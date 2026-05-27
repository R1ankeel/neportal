import type { Api } from "grammy";
import {
  createAbsence,
  createTaskTransfer,
  fetchAbsenceAffectedTasks,
  fetchUsers,
  recordAbsenceNotification,
  type ApiAbsence,
  type ApiUser,
} from "./api";
import {
  absenceTypeLabelRu,
  buildDistributionResultMessage,
  formatAbsenceImpactIntroMessage,
  toAbsenceDelegationTasks,
} from "./absence-delegation-format";
import { formatIsoDateRu } from "./parse-ru-date";
import { sendTelegramMessage } from "./send-telegram";
import { formatTaskDeadline } from "./task-notifications";
import { setPendingTaskTransferDecision } from "./pending-task-transfer-decision";
import { notifyTransferImmediate, notifyTransferPending } from "./task-notifications";
import { startPendingAbsenceDelegationMode } from "./pending-absence-delegation";
import type {
  AbsenceDelegationAssignment,
  AbsenceDelegationTaskItem,
} from "./pending-absence-delegation";

const ABSENCE_TRANSFER_COMMENT_PREFIX = "Передача из-за отсутствия";

export { absenceTypeLabelRu };

export function buildAbsenceTransferComment(
  type: "SICK_LEAVE" | "VACATION",
  startDate: string,
  endDate: string,
): string {
  const label = absenceTypeLabelRu(type);
  const startRu = formatIsoDateRu(startDate);
  const endRu = formatIsoDateRu(endDate);
  if (startRu === endRu) {
    return `${ABSENCE_TRANSFER_COMMENT_PREFIX}: ${label} ${startRu}`;
  }
  return `${ABSENCE_TRANSFER_COMMENT_PREFIX}: ${label} с ${startRu} по ${endRu}`;
}

export async function createAbsenceWithImpact(
  api: Api,
  body: Parameters<typeof createAbsence>[0],
  absenceUser: ApiUser,
): Promise<ApiAbsence> {
  const absence = await createAbsence(body);
  let affectedTasks = absence.affectedTasks;
  if (!affectedTasks?.length) {
    affectedTasks = await fetchAbsenceAffectedTasks(absence.id);
  }
  const fullAbsence: ApiAbsence = { ...absence, affectedTasks };
  await handleAbsenceImpact(api, fullAbsence, absenceUser);
  return fullAbsence;
}

export async function handleAbsenceImpact(
  api: Api,
  absence: ApiAbsence,
  absenceUser: ApiUser,
): Promise<void> {
  const affectedTasks = absence.affectedTasks ?? [];
  if (affectedTasks.length === 0) return;

  const startRu = formatIsoDateRu(absence.startDate);
  const endRu = formatIsoDateRu(absence.endDate);
  const delegationTasks = toAbsenceDelegationTasks(affectedTasks);

  if (absenceUser.telegramId) {
    await sendTelegramMessage(
      api,
      absenceUser.telegramId,
      formatAbsenceImpactIntroMessage(absence.type, delegationTasks),
    );

    const telegramNumeric = Number(absenceUser.telegramId);
    if (Number.isFinite(telegramNumeric)) {
      startPendingAbsenceDelegationMode(telegramNumeric, {
        absenceId: absence.id,
        absenceUserId: absenceUser.id,
        absenceUserName: absenceUser.fullName,
        absenceType: absence.type,
        startDate: absence.startDate,
        endDate: absence.endDate,
        tasks: delegationTasks,
      });
    }

    for (const task of affectedTasks) {
      try {
        await recordAbsenceNotification(absence.id, {
          taskId: task.id,
          userId: absenceUser.id,
          type: "ABSENCE_AFFECTED_TASKS_EMPLOYEE",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[absence-impact] employee log error: ${msg}`);
      }
    }
  }

  for (const task of affectedTasks) {
    const creator = task.creator;
    if (!creator.telegramId || creator.id === absenceUser.id) continue;

    const deadline = formatTaskDeadline(task.deadlineAt);
    const text = [
      `${absenceUser.fullName} отсутствует с ${startRu} по ${endRu}.`,
      "",
      "Задача с дедлайном на период отсутствия:",
      `«${task.title}»`,
      `Дедлайн: ${deadline}`,
      "",
      "Если задачу передадут другому исполнителю, я сообщу.",
    ].join("\n");

    try {
      await sendTelegramMessage(api, creator.telegramId, text);
      await recordAbsenceNotification(absence.id, {
        taskId: task.id,
        userId: creator.id,
        type: "ABSENCE_AFFECTED_TASK_CREATOR",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[absence-impact] creator notify error: ${msg}`);
    }
  }
}

export async function executeAbsenceDelegationDistribution(
  api: Api,
  params: {
    absenceId: string;
    absenceUser: ApiUser;
    absenceType: "SICK_LEAVE" | "VACATION";
    startDate: string;
    endDate: string;
    tasks: AbsenceDelegationTaskItem[];
    assignments: AbsenceDelegationAssignment[];
  },
): Promise<string> {
  const comment = buildAbsenceTransferComment(
    params.absenceType,
    params.startDate,
    params.endDate,
  );

  const author: ApiUser = {
    id: params.absenceUser.id,
    fullName: params.absenceUser.fullName,
    role: params.absenceUser.role,
    telegramId: params.absenceUser.telegramId,
    telegramUsername: params.absenceUser.telegramUsername,
  };

  const statuses: Array<{ status: "PENDING" | "ACCEPTED" }> = [];
  const users = await fetchUsers();
  const userById = new Map(users.map((u) => [u.id, u]));

  for (const assignment of params.assignments) {
    if (assignment.action !== "TRANSFER" || !assignment.toUserId) continue;

    const task = params.tasks.find((t) => t.id === assignment.taskId);
    if (!task) continue;

    const toUserId = assignment.toUserId;
    if (toUserId === params.absenceUser.id) continue;

    const toUser = userById.get(toUserId);
    const toUserName = assignment.toUserName ?? toUser?.fullName ?? "сотрудник";
    const toUserTelegramId = toUser?.telegramId ?? null;

    const result = await createTaskTransfer(task.id, {
      requestedById: params.absenceUser.id,
      toUserId,
      comment,
      absenceId: params.absenceId,
    });

    const transfer = result.transfer;
    const updatedTask = result.task;
    if (transfer.status === "PENDING" || transfer.status === "ACCEPTED") {
      statuses.push({ status: transfer.status });
    }

    if (transfer.status === "ACCEPTED") {
      if (toUserTelegramId) {
        try {
          await notifyTransferImmediate(api, {
            taskTitle: updatedTask.title,
            projectName: task.projectName,
            comment,
            author,
            toUser: {
              id: toUserId,
              fullName: toUserName,
              telegramId: toUserTelegramId,
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[absence-impact] transfer immediate notify error: ${msg}`);
        }
      }

      try {
        await notifyAbsenceTaskDelegatedToCreator(api, {
          absenceId: params.absenceId,
          taskId: task.id,
          taskTitle: updatedTask.title,
          creatorId: task.creatorId,
          fromUserName: params.absenceUser.fullName,
          toUserName,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[absence-impact] delegated creator immediate error: ${msg}`);
      }
      continue;
    }

    if (!toUserTelegramId) {
      console.error(`[absence-impact] transfer pending without telegram for ${toUserId}`);
      continue;
    }

    const toTelegramNumeric = Number(toUserTelegramId);
    if (Number.isFinite(toTelegramNumeric)) {
      setPendingTaskTransferDecision(toTelegramNumeric, {
        type: "pending_task_transfer_decision",
        transferId: transfer.id,
        taskId: updatedTask.id,
        taskTitle: updatedTask.title,
        requestedById: params.absenceUser.id,
        requestedByName: params.absenceUser.fullName,
        toUserId,
        comment,
        projectName: task.projectName ?? undefined,
        createdAt: Date.now(),
      });
    }

    try {
      await notifyTransferPending(api, {
        taskTitle: updatedTask.title,
        projectName: task.projectName,
        comment,
        author,
        toUser: {
          id: toUserId,
          fullName: toUserName,
          telegramId: toUserTelegramId,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[absence-impact] transfer pending notify error: ${msg}`);
    }
  }

  return buildDistributionResultMessage(statuses);
}

/** Уведомление постановщика о новом исполнителе после accept transfer из-за отсутствия. */
export async function notifyAbsenceTaskDelegatedToCreator(
  api: Api,
  params: {
    absenceId: string;
    taskId: string;
    taskTitle: string;
    creatorId: string;
    fromUserName: string;
    toUserName: string;
  },
): Promise<void> {
  const users = await fetchUsers();
  const creator = users.find((u) => u.id === params.creatorId);
  if (!creator?.telegramId) return;

  const text = [
    `Задача «${params.taskTitle}» передана новому исполнителю.`,
    "",
    `Было: ${params.fromUserName}`,
    `Стало: ${params.toUserName}`,
    "Причина: отсутствие сотрудника.",
  ].join("\n");

  await sendTelegramMessage(api, creator.telegramId, text);

  try {
    await recordAbsenceNotification(params.absenceId, {
      taskId: params.taskId,
      userId: params.creatorId,
      type: "ABSENCE_TASK_DELEGATED_CREATOR",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[absence-impact] delegated creator log error: ${msg}`);
  }
}
