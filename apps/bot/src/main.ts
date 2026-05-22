import { Bot, type Context } from "grammy";
import { loadRootEnv } from "@neportal/shared";
import {
  handleSickSlashCommand,
  handleVacationSlashCommand,
} from "./absence-slash-flow";
import {
  createBudgetExpense,
  createExpenseAttachment,
  createNote,
  createTask,
  fetchBudgets,
  fetchProjects,
  fetchUserByTelegramId,
  fetchUsers,
  linkTelegramUser,
  formatMoney,
  parseAmount,
  pickAssigneeId,
  pickDefaultBudget,
  pickDefaultProject,
  pickDefaultProjectId,
  getApiBaseUrl,
} from "./api";
import { requireLinkedUser } from "./current-user";
import { devLog } from "./dev-log";
import { devLogCreateAbsenceUserSelfChecks } from "./fix-ai-intent-absence-user";
import { devLogCreateTaskAssigneeSelfChecks } from "./fix-ai-intent-assignee";
import { devLogRelativeMonthDeadlineChecks } from "./parse-ru-date";
import { getLastExpense, setLastExpense } from "./last-expense";
import { handlePlainTextMessage } from "./ai-message";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import { resolveUserByHint } from "./user-hint-resolution";
import { formatUserCandidates, userNotFoundMessage } from "./user-selection-format";
import { handleStartBinding } from "./start-binding";
import { startTaskNotificationScheduler } from "./task-notification-scheduler";
import { notifyTaskAssigned } from "./task-notifications";
import { handleDeadlineSlashCommand } from "./handle-deadline-slash";
import { handleCommentSlashCommand } from "./task-comment-flow";
import { handleMentionSlashCommand } from "./task-mention-flow";
import { handleTransferSlashCommand } from "./task-transfer-flow";
import { handleStartTaskSlashCommand } from "./task-start-flow";
import { handleTaskStatusSlashCommand } from "./task-status-flow";
import { replyWithTasksForHint } from "./my-tasks-flow";
import { buildIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";

const envPath = loadRootEnv();
if (envPath) {
  console.log(`Loaded env from: ${envPath}`);
} else {
  console.log("Root .env file not found. Environment variables should be provided by the system.");
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || token === "change_me") {
  console.error("Set TELEGRAM_BOT_TOKEN in the root .env file.");
  process.exit(1);
}

const bot = new Bot(token);

bot.command("start", async (ctx) => {
  await handleStartBinding(ctx);

  await ctx.reply(
    [
      "",
      "Команды Neportal:",
      "/task <название> — задача",
      "/note <текст> — заметка",
      "/expense <сумма> <описание> — расход",
      "/sick до 25.05.2026 номер 123456 — больничный",
      "/vacation с 01.06.2026 по 10.06.2026 — отпуск",
      "/start-task <название> — взять задачу в работу",
      "/work <название> — взять задачу в работу",
      "/done <название> — закрыть задачу",
      "/cancel <название> — отменить задачу",
      "/comment <задача> — <комментарий> — комментарий к задаче",
      "/mention <сотрудник> | <задача> | <комментарий> — призвать в задачу",
      "/transfer <задача> | <исполнитель> | <комментарий> — передать задачу",
      "/tasks — мои ближайшие задачи",
      "/tasks <сотрудник> — задачи сотрудника (OWNER/MANAGER)",
      "/me — статус привязки",
      "/demo — справка",
    ].join("\n"),
  );
});

bot.command("demo", async (ctx) => {
  await ctx.reply(
    [
      "Доступные команды:",
      "",
      "/start — приветствие",
      "/demo — эта справка",
      "/task <текст> — создать задачу в Neportal (через API)",
      "/note <текст> — создать заметку в проекте по умолчанию",
      "/expense <сумма> <описание> — добавить расход в бюджет проекта",
      "/sick до 25.05.2026 номер 123456 — больничный",
      "/vacation с 01.06.2026 по 10.06.2026 — отпуск",
      "/deadline Подготовить отчет 22.05.2026 — дедлайн задачи",
      "/start-task Проверить склад — взять задачу в работу",
      "/work Проверить склад — взять задачу в работу",
      "/done Проверить склад — закрыть задачу",
      "/cancel Проверить склад — отменить задачу",
      "/comment Проверить склад — склад закрыт до завтра — комментарий к задаче",
      "/mention Вася | Проверить склад | нужны его комментарии — призвать в задачу",
      "/transfer Проверить склад | Вася | потому что он отвечает за склад — передать задачу",
      "/tasks — показать мои ближайшие задачи",
      "/tasks Вася — задачи сотрудника (OWNER/MANAGER)",
      "/link Вася Пупкин — привязка по ФИО (dev)",
      "/me — статус привязки",
      "",
      "Можно писать обычным текстом, например:",
      "- Поставь Васе задачу подготовить отчет до 23 мая",
      "- Запиши заметку: клиент попросил проверить статистику",
      "- Потратил 1500 рублей на рекламу VK",
      "- Вася заболел до 25 мая, больничный 123456",
      "- Взял задачу Проверить склад в работу",
      "- Беру в работу задачу Заключить договор",
      "- Закрой задачу Проверить склад",
      "- Закрой задачу Проверить склад, всё проверил",
      "- Отмени задачу Проверить склад",
      "- Отмени задачу Проверить склад, склад закрыт",
      "- Напиши комментарий к задаче Проверить склад: склад закрыт до завтра",
      "- Позови Васю в задачу Проверить склад, нужны его комментарии",
      "- Передай задачу Проверить склад Васе, потому что он отвечает за склад",
      "- покажи мои задачи",
      "- Какие задачи у Васи? (OWNER/MANAGER)",
      "",
      "Пример с чеком:",
      "/expense 1500 реклама VK",
      "затем отправьте фото или документ чека",
      "",
      `API: ${getApiBaseUrl()}`,
    ].join("\n"),
  );
});

bot.command("link", async (ctx) => {
  const hint = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!hint) {
    await ctx.reply("Использование: /link <ФИО>, например /link Вася Пупкин");
    return;
  }

  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  try {
    const users = await fetchUsers();
    const match = resolveUserByHint(users, hint, null);
    if (match.kind === "none") {
      await ctx.reply(userNotFoundMessage(hint));
      return;
    }
    if (match.kind === "many") {
      startPendingUserSelection(
        telegramId,
        "select_user_for_link",
        match.users.map(apiUserToCandidate),
        { intent: "link_telegram" },
      );
      await ctx.reply(formatUserCandidates(match.users.map(apiUserToCandidate)));
      return;
    }

    await linkTelegramUser(match.user.id, String(telegramId));
    await ctx.reply(`Telegram привязан к сотруднику: ${match.user.fullName}.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] link command error: ${msg}`);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
});

bot.command("me", async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  try {
    const linked = await fetchUserByTelegramId(String(telegramId));
    if (linked) {
      const lines = [
        `Вы привязаны как: ${linked.fullName} · ${linked.role}`,
      ];
      if (linked.telegramUsername) {
        lines.push(`Username в Neportal: @${linked.telegramUsername}`);
      }
      await ctx.reply(lines.join("\n"));
      return;
    }
    await ctx.reply(
      [
        "Telegram не привязан.",
        "Попросите руководителя указать ваш @username в карточке сотрудника и отправьте /start.",
        "Dev: /link <ФИО>",
      ].join("\n"),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] me command error: ${msg}`);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
});

bot.command("tasks", async (ctx) => {
  const user = await requireLinkedUser(ctx);
  if (!user) return;

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  const hint = typeof ctx.match === "string" ? ctx.match.trim() : "";

  try {
    await replyWithTasksForHint(ctx, user, telegramUserId, hint, 5);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] tasks command error: ${msg}`);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
});

bot.hears(/^\/task(?:@\w+)?\s+(.+)$/ims, async (ctx) => {
  const title = ctx.match[1].trim();
  if (!title) {
    await ctx.reply("Укажите название: /task Сделать что-то важное");
    return;
  }

  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser) return;

    const [users, projects] = await Promise.all([fetchUsers(), fetchProjects()]);
    const creatorId = currentUser.id;
    const assigneeId = pickAssigneeId(users);

    const projectId = pickDefaultProjectId(projects);
    if (!projectId) {
      await ctx.reply("Нет проектов. Сначала создайте проект в Web.");
      return;
    }

    const task = await createTask({
      title,
      creatorId,
      assigneeId,
      projectId,
    });

    try {
      await notifyTaskAssigned(bot.api, task);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[task-notifications] assign notify error: ${msg}`);
    }

    const projectName = task.project?.name ?? projects.find((p) => p.id === projectId)?.name ?? "проект";
    await ctx.reply(`Задача создана в проекте «${projectName}»: ${task.title}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
});

bot.hears(/^\/task(?:@\w+)?\s*$/i, async (ctx) => {
  await ctx.reply("Использование: /task Подготовить отчёт");
});

bot.hears(/^\/note(?:@\w+)?\s+(.+)$/ims, async (ctx) => {
  const text = ctx.match[1].trim();
  if (!text) {
    await ctx.reply("Использование: /note <текст заметки>");
    return;
  }

  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser) return;

    const projects = await fetchProjects();
    const creatorId = currentUser.id;

    const projectId = pickDefaultProjectId(projects);
    if (!projectId) {
      await ctx.reply("Нет проектов. Сначала создайте проект в Web.");
      return;
    }

    const note = await createNote({
      text,
      creatorId,
      projectId,
      source: "TELEGRAM_TEXT",
    });

    const projectName = note.project?.name ?? projects.find((p) => p.id === projectId)?.name ?? "проект";
    await ctx.reply(`Заметка создана в проекте «${projectName}»: ${note.text}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
});

bot.hears(/^\/note(?:@\w+)?\s*$/i, async (ctx) => {
  await ctx.reply("Использование: /note <текст заметки>");
});

bot.hears(/^\/expense(?:@\w+)?\s+([\d]+(?:[.,]\d+)?)\s*(.*)$/ims, async (ctx) => {
  const amountRaw = ctx.match[1].replace(",", ".");
  const amount = Number(amountRaw);
  const description = ctx.match[2].trim() || undefined;

  if (!Number.isFinite(amount) || amount <= 0) {
    await ctx.reply("Использование: /expense <сумма> <описание>");
    return;
  }

  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser) return;

    const projects = await fetchProjects();
    const userId = currentUser.id;

    const project = pickDefaultProject(projects);
    if (!project) {
      await ctx.reply("Нет проектов. Сначала создайте проект в Web.");
      return;
    }

    const budgets = await fetchBudgets(project.id);
    const budget = pickDefaultBudget(budgets);
    if (!budget) {
      await ctx.reply(`В проекте «${project.name}» нет бюджетов. Создайте бюджет в Web.`);
      return;
    }

    const result = await createBudgetExpense(budget.id, {
      userId,
      amount,
      description,
      source: "TELEGRAM_TEXT",
    });

    const updatedBudget = result.budget;
    const remaining =
      parseAmount(updatedBudget.initialAmount) - parseAmount(updatedBudget.spentAmount);

    await ctx.reply(
      [
        `Расход создан в бюджете «${updatedBudget.title}»: ${formatMoney(amount, updatedBudget.currency)}`,
        `Остаток бюджета: ${formatMoney(remaining, updatedBudget.currency)}`,
        "",
        "Отправьте фото или документ чека, чтобы прикрепить его к этому расходу.",
      ].join("\n"),
    );

    const telegramUserId = ctx.from?.id;
    if (telegramUserId) {
      setLastExpense(telegramUserId, {
        expenseId: result.id,
        budgetTitle: updatedBudget.title,
        amount,
        createdAt: new Date(),
        uploadedById: userId,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
});

bot.hears(/^\/expense(?:@\w+)?\s*$/i, async (ctx) => {
  await ctx.reply("Использование: /expense <сумма> <описание>");
});

bot.command("sick", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  devLog("parsed sick command", { payload });

  try {
    await handleSickSlashCommand(ctx, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] sick command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
});

bot.command("done", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const telegramUserId = ctx.from?.id;
  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser || !telegramUserId) return;

    const result = await handleTaskStatusSlashCommand(
      currentUser,
      telegramUserId,
      payload,
      "DONE",
    );
    if (result.kind === "reply") {
      await ctx.reply(result.message);
      return;
    }

    const resolved = result.resolved;
    if (resolved.intent !== "complete_task") return;

    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        intent: "complete_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          taskTitle: resolved.taskTitle,
          completionResult: resolved.completionResult ?? "",
        },
      },
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] done command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
});

async function runStartTaskSlash(ctx: Context, payload: string): Promise<void> {
  const telegramUserId = ctx.from?.id;
  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser || !telegramUserId) return;

    const result = await handleStartTaskSlashCommand(
      currentUser,
      telegramUserId,
      payload,
    );
    if (result.kind === "reply") {
      await ctx.reply(result.message);
      return;
    }

    const resolved = result.resolved;
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        intent: "start_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: { taskTitle: resolved.taskTitle },
      },
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] start-task command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
}

bot.command("start-task", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  await runStartTaskSlash(ctx, payload);
});

bot.command("work", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  await runStartTaskSlash(ctx, payload);
});

bot.command("cancel", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const telegramUserId = ctx.from?.id;
  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser || !telegramUserId) return;

    const result = await handleTaskStatusSlashCommand(
      currentUser,
      telegramUserId,
      payload,
      "CANCELLED",
    );
    if (result.kind === "reply") {
      await ctx.reply(result.message);
      return;
    }

    const resolved = result.resolved;
    if (resolved.intent !== "cancel_task") return;

    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        intent: "cancel_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          taskTitle: resolved.taskTitle,
          cancellationReason: resolved.cancellationReason ?? "",
        },
      },
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] cancel command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
});

bot.command("comment", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const telegramUserId = ctx.from?.id;
  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser || !telegramUserId) return;

    const result = await handleCommentSlashCommand(
      currentUser,
      telegramUserId,
      payload,
    );
    if (result.kind === "reply" || result.kind === "awaiting_text") {
      await ctx.reply(result.message);
      return;
    }

    const resolved = result.resolved;
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        intent: "add_task_comment",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          taskTitle: resolved.taskTitle,
          text: resolved.text,
        },
      },
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] comment command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
});

bot.command("mention", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const telegramUserId = ctx.from?.id;
  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser || !telegramUserId) return;

    const result = await handleMentionSlashCommand(
      currentUser,
      telegramUserId,
      payload,
      ctx,
    );
    if (
      result.kind === "reply" ||
      result.kind === "awaiting_text" ||
      result.kind === "user_selection_started"
    ) {
      if (result.kind !== "user_selection_started") {
        await ctx.reply(result.message);
      }
      return;
    }

    const resolved = result.resolved;
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        intent: "mention_in_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          userHint: resolved.mentionedUserName,
          taskTitle: resolved.taskTitle,
          text: resolved.text,
        },
      },
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] mention command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
});

bot.command("transfer", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const telegramUserId = ctx.from?.id;
  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser || !telegramUserId) return;

    const result = await handleTransferSlashCommand(
      currentUser,
      telegramUserId,
      payload,
      ctx,
    );
    if (
      result.kind === "reply" ||
      result.kind === "awaiting_text" ||
      result.kind === "user_selection_started"
    ) {
      if (result.kind !== "user_selection_started") {
        await ctx.reply(result.message);
      }
      return;
    }

    const resolved = result.resolved;
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        intent: "transfer_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          taskTitle: resolved.taskTitle,
          toUserHint: resolved.toUserName,
          comment: resolved.comment,
        },
      },
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] transfer command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
});

bot.command("deadline", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  devLog("parsed deadline command", { payload });

  const telegramUserId = ctx.from?.id;
  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser || !telegramUserId) return;

    const usageOrNull = await handleDeadlineSlashCommand(
      ctx,
      currentUser,
      telegramUserId,
      payload,
    );
    if (usageOrNull) {
      await ctx.reply(usageOrNull);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] deadline command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
});

bot.command("vacation", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  devLog("parsed vacation command", { payload });

  try {
    await handleVacationSlashCommand(ctx, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] vacation command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
});

bot.hears(/^\/expense(?:@\w+)?\s+(.+)$/ims, async (ctx) => {
  await ctx.reply("Использование: /expense <сумма> <описание>");
});

async function handleReceiptAttachment(
  ctx: { from?: { id: number }; reply: (text: string) => Promise<unknown> },
  file: { telegramFileId: string; originalFilename?: string; mimeType?: string },
): Promise<void> {
  const linked = await requireLinkedUser(ctx);
  if (!linked) return;

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  const lastExpense = getLastExpense(telegramUserId);
  if (!lastExpense) {
    await ctx.reply("Не нашёл недавний расход. Сначала создайте расход командой /expense.");
    return;
  }

  try {
    await createExpenseAttachment(lastExpense.expenseId, {
      telegramFileId: file.telegramFileId,
      originalFilename: file.originalFilename,
      mimeType: file.mimeType,
      uploadedById: lastExpense.uploadedById,
    });

    await ctx.reply(
      `Чек прикреплён к расходу ${formatMoney(lastExpense.amount)} по бюджету «${lastExpense.budgetTitle}».`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
}

bot.on("message:photo", async (ctx) => {
  const photos = ctx.message.photo;
  if (photos.length === 0) return;
  const largest = photos[photos.length - 1];
  await handleReceiptAttachment(ctx, {
    telegramFileId: largest.file_id,
    originalFilename: "photo.jpg",
    mimeType: "image/jpeg",
  });
});

bot.on("message:document", async (ctx) => {
  const doc = ctx.message.document;
  await handleReceiptAttachment(ctx, {
    telegramFileId: doc.file_id,
    originalFilename: doc.file_name,
    mimeType: doc.mime_type,
  });
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (!text || text.startsWith("/")) return;
  await handlePlainTextMessage(ctx);
});

const mode = process.env.BOT_MODE ?? "polling";

async function main() {
  devLogRelativeMonthDeadlineChecks();
  devLogCreateTaskAssigneeSelfChecks();
  devLogCreateAbsenceUserSelfChecks();
  startTaskNotificationScheduler(bot);

  if (mode === "webhook") {
    const url = process.env.TELEGRAM_WEBHOOK_URL;
    if (!url) {
      throw new Error("TELEGRAM_WEBHOOK_URL is required when BOT_MODE=webhook");
    }
    await bot.api.setWebhook(url);
    console.log(`Webhook set to ${url}. Use an HTTP server to forward updates.`);
    return;
  }

  await bot.start({
    onStart: (me) => {
      console.log(`Bot @${me.username} started (polling). API: ${getApiBaseUrl()}`);
    },
  });
}

void main();
