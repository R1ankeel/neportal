import { devLog } from "../dev-log";
import { startPendingConfirmationEdit, clearPendingConfirmationEdit } from "../pending-confirmation-edit";
import { setPendingConfirmation, clearPendingConfirmation } from "../pending-intent";
import { setPendingTaskStatusDetails, clearPendingTaskStatusDetails } from "../pending-task-status-details";
import { startPendingCreateTaskAssignee, clearPendingCreateTaskAssignee } from "../pending-create-task-assignee";
import { hasBlockingPendingState } from "./voice-pending-guard";

const DEV_TELEGRAM_USER_ID = 9_999_991;

function clearAll(): void {
  clearPendingConfirmationEdit(DEV_TELEGRAM_USER_ID);
  clearPendingTaskStatusDetails(DEV_TELEGRAM_USER_ID);
  clearPendingCreateTaskAssignee(DEV_TELEGRAM_USER_ID);
  clearPendingConfirmation(DEV_TELEGRAM_USER_ID);
}

export function devLogVoicePendingGuardChecks(): void {
  clearAll();

  setPendingTaskStatusDetails(DEV_TELEGRAM_USER_ID, {
    type: "awaiting_completion_result",
    taskId: "t1",
    taskTitle: "Проверить поставщика",
    createdAt: Date.now(),
  });
  devLog(
    `voice guard allows completion value ${!hasBlockingPendingState(DEV_TELEGRAM_USER_ID) ? "OK" : "FAIL"}`,
  );
  clearAll();

  setPendingTaskStatusDetails(DEV_TELEGRAM_USER_ID, {
    type: "awaiting_cancellation_reason",
    taskId: "t1",
    taskTitle: "Проверить поставщика",
    createdAt: Date.now(),
  });
  devLog(
    `voice guard allows cancellation value ${!hasBlockingPendingState(DEV_TELEGRAM_USER_ID) ? "OK" : "FAIL"}`,
  );
  clearAll();

  setPendingConfirmation(DEV_TELEGRAM_USER_ID, {
    type: "confirm_link_by_username",
    userId: "u1",
    fullName: "Тестовый Пользователь",
    username: "tester",
  });
  devLog(
    `voice guard blocks confirmation ${hasBlockingPendingState(DEV_TELEGRAM_USER_ID) ? "OK" : "FAIL"}`,
  );
  clearAll();

  startPendingCreateTaskAssignee(DEV_TELEGRAM_USER_ID, {
    candidates: [{ kind: "self" }],
    title: "Проверить поставщика",
    creatorId: "u1",
  });
  devLog(
    `voice guard blocks choice menu ${hasBlockingPendingState(DEV_TELEGRAM_USER_ID) ? "OK" : "FAIL"}`,
  );
  clearAll();

  startPendingConfirmationEdit(
    DEV_TELEGRAM_USER_ID,
    {
      type: "ai_intent",
      intent: { intent: "complete_task", confidence: 1, requiresConfirmation: true, payload: { taskTitle: "X" } },
      resolved: {
        intent: "complete_task",
        taskId: "t1",
        taskTitle: "X",
        completionResult: "ok",
      },
    },
    [{ key: "title", label: "Название задачи" }],
  );
  devLog(
    `voice guard blocks edit select menu ${hasBlockingPendingState(DEV_TELEGRAM_USER_ID) ? "OK" : "FAIL"}`,
  );
  clearAll();
}
