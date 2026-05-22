import type { Bot } from "grammy";
import {
  fetchDeadlineTomorrowNotifications,
  fetchOverdueNotifications,
} from "./api";
import {
  buildDeadlineTomorrowMessage,
  buildOverdueAssigneeMessage,
  buildOverdueCreatorMessage,
  sendAndLogNotification,
} from "./task-notifications";

function schedulerEnabled(): boolean {
  const raw = process.env.TASK_NOTIFICATION_SCHEDULER_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function schedulerIntervalMs(): number {
  const raw = process.env.TASK_NOTIFICATION_INTERVAL_MS?.trim();
  const n = raw ? Number(raw) : 60_000;
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

async function runDeadlineTomorrowTick(bot: Bot): Promise<void> {
  const items = await fetchDeadlineTomorrowNotifications();
  for (const task of items) {
    const assignee = task.assignee;
    if (!assignee?.telegramId || !assignee.id) continue;

    await sendAndLogNotification(
      bot.api,
      task.id,
      assignee.telegramId,
      assignee.id,
      "TASK_DEADLINE_TOMORROW",
      buildDeadlineTomorrowMessage(task),
    );
  }
}

async function runOverdueTick(bot: Bot): Promise<void> {
  const items = await fetchOverdueNotifications();
  for (const task of items) {
    if (task.notifyAssignee && task.assignee?.telegramId && task.assignee.id) {
      await sendAndLogNotification(
        bot.api,
        task.id,
        task.assignee.telegramId,
        task.assignee.id,
        "TASK_OVERDUE_ASSIGNEE",
        buildOverdueAssigneeMessage(task),
      );
    }

    if (task.notifyCreator && task.creator?.telegramId && task.creator.id) {
      await sendAndLogNotification(
        bot.api,
        task.id,
        task.creator.telegramId,
        task.creator.id,
        "TASK_OVERDUE_CREATOR",
        buildOverdueCreatorMessage(task),
      );
    }
  }
}

async function runSchedulerTick(bot: Bot): Promise<void> {
  await runDeadlineTomorrowTick(bot);
  await runOverdueTick(bot);
}

/** Периодические уведомления: дедлайн завтра и просрочка. Ошибки не роняют процесс бота. */
export function startTaskNotificationScheduler(bot: Bot): void {
  if (!schedulerEnabled()) {
    console.log("[task-notifications] scheduler disabled (TASK_NOTIFICATION_SCHEDULER_ENABLED)");
    return;
  }

  const intervalMs = schedulerIntervalMs();
  console.log(`[task-notifications] scheduler started, interval ${intervalMs} ms`);

  const tick = () => {
    void runSchedulerTick(bot).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[task-notifications] scheduler tick error: ${msg}`);
    });
  };

  tick();
  setInterval(tick, intervalMs);
}
