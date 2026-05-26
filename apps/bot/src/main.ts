import { Bot, type Context } from "grammy";
import { loadRootEnv } from "@neportal/shared";
import { handleCancelAbsenceSlashCommand } from "./absence-cancel-slash-flow";
import {
  handleSickSlashCommand,
  handleVacationSlashCommand,
} from "./absence-slash-flow";
import {
  createNote,
  createTask,
  fetchProjects,
  fetchUserByTelegramId,
  fetchUsers,
  linkTelegramUser,
  formatMoney,
  pickAssigneeId,
  pickDefaultProject,
  pickDefaultProjectId,
  getApiBaseUrl,
} from "./api";
import { requireLinkedUser } from "./current-user";
import { devLog } from "./dev-log";
import { devLogCreateAbsenceUserSelfChecks } from "./fix-ai-intent-absence-user";
import { devLogCreateTaskAssigneeSelfChecks } from "./fix-ai-intent-assignee";
import { devLogNaturalLanguageSelfChecks } from "./natural-language-self-checks.dev";
import { devLogValidateAddTaskCommentChecks } from "./validate-add-task-comment-payload.dev";
import { devLogAiStage2SelfChecks } from "./ai-stage2-self-checks.dev";
import { devLogAiProviderRegistryChecks } from "./ai-provider-registry.dev";
import { devLogAiProviderHardeningChecks } from "./ai-provider-hardening.dev";
import { devLogCreateTaskAssigneeResolveChecks } from "./create-task-assignee-resolve.dev";
import { devLogTransferCommentFixChecks } from "./fix-ai-intent-transfer-comment.dev";
import { devLogCreateTaskTitleDescriptionChecks } from "./normalize-create-task-title-description.dev";
import { devLogCreateTaskNormalizeChecks } from "./ai/postprocess/create-task-normalize.dev";
import { devLogConfirmationKeyboardChecks } from "./confirmation-keyboard.dev";
import { devLogChoiceKeyboardChecks } from "./choice-keyboard.dev";
import { devLogResolveUsersByHintChecks } from "./resolve-users-by-hint.dev";
import { devLogRelativeMonthDeadlineChecks } from "./parse-ru-date";
import { beginCreateExpenseFlow } from "./create-expense-flow";
import { getLastExpense } from "./last-expense";
import {
  clearPendingExpenseReceiptUpload,
  getPendingExpenseReceiptUpload,
  isPendingExpenseReceiptUploadExpired,
} from "./pending-expense-receipt-upload";
import { showPendingExpenses } from "./pending-expenses-flow";
import { attachTelegramReceiptToExpense } from "./receipt-attachment";
import { handlePlainTextMessage } from "./ai-message";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import { resolveUserByHint } from "./user-hint-resolution";
import { formatUserCandidates, userNotFoundMessage } from "./user-selection-format";
import { handleStartBinding } from "./start-binding";
import { handleStartLinkCallback } from "./start-link-callback";
import { handleMainMenuCallback } from "./main-menu-callback";
import { replyWithMainMenu } from "./main-menu-reply";
import { startTaskNotificationScheduler } from "./task-notification-scheduler";
import { notifyTaskAssigned } from "./task-notifications";
import { handleDeadlineSlashCommand } from "./handle-deadline-slash";
import { handleCommentSlashCommand } from "./task-comment-flow";
import { handleMentionSlashCommand } from "./task-mention-flow";
import { handleReassignSlashCommand } from "./task-reassign-flow";
import { handleTransferSlashCommand } from "./task-transfer-flow";
import { handleStartTaskSlashCommand } from "./task-start-flow";
import { handleTaskStatusSlashCommand } from "./task-status-flow";
import { getPendingTaskStatusDetails } from "./pending-task-status-details";
import { buildTaskStatusDetailsCancelKeyboard, handleTaskStatusDetailsCancelCallback } from "./task-status-details-cancel";
import { devLogVoicePendingGuardChecks } from "./speech/voice-pending-guard.dev";
import { devLogSpeechKitAsyncRoutingChecks } from "./speech/speechkit-async-routing.dev";
import { devLogTaskStatusFlowChecks } from "./task-status-flow.dev";
import { replyWithTasksForHint } from "./my-tasks-flow";
import { replyWithIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import { handleConfirmationCallback } from "./confirmation-callback";
import { handleChoiceCallback } from "./choice-callback";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";
import { logBotMiddlewareError } from "./telegram-error-log";
import { devLogSafeCallbackChecks } from "./telegram/safe-callback.dev";
import { handleTelegramVoiceMessage } from "./speech/telegram-voice-handler";

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

bot.catch(logBotMiddlewareError);

async function handleStartCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  try {
    const linked = await fetchUserByTelegramId(String(telegramId));
    if (linked) {
      await replyWithMainMenu(
        ctx,
        `Здравствуйте, ${linked.fullName}.\nВы можете создавать задачи, записывать заметки и управлять ими текстом или голосом.`,
      );
      return;
    }

    await handleStartBinding(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] start command error: ${msg}`);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
}

bot.command("start", async (ctx) => {
  await handleStartCommand(ctx);
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
      "/cancel-absence — отменить своё отсутствие",
      "/cancel-absence Вася — отменить отсутствие сотрудника",
      "/deadline Подготовить отчет 22.05.2026 — дедлайн задачи",
      "/start-task Проверить склад — взять задачу в работу",
      "/work Проверить склад — взять задачу в работу",
      "/done Проверить склад — закрыть задачу",
      "/cancel Проверить склад — отменить задачу",
      "/comment Проверить склад — склад закрыт до завтра — комментарий к задаче",
      "/mention Вася | Проверить склад | нужны его комментарии — призвать в задачу",
      "/transfer Проверить склад | Вася | потому что он отвечает за склад — передать задачу",
      "/reassign Проверить склад | Вася | Маша | из-за больничного — переназначить задачу",
      "/tasks — показать мои ближайшие задачи",
      "/tasks Вася — задачи сотрудника (OWNER/MANAGER)",
      "/pending-expenses — расходы без чеков",
      "/link Вася Пупкин — привязка по ФИО (dev)",
      "/me — статус привязки",
      "",
      "На подтверждении можно ответить: да / нет / изменить",
      "",
      "Можно писать обычным текстом, например:",
      "- Поставь Васе задачу подготовить отчет до 23 мая",
      "- Запиши заметку: клиент попросил проверить статистику",
      "- Потратил 1500 рублей на рекламу VK",
      "- Вася заболел до 25 мая, больничный 123456",
      "- удали мой больничный / отмени мой отпуск",
      "- удали больничный Васи",
      "- Взял задачу Проверить склад в работу",
      "- Беру в работу задачу Заключить договор",
      "- Закрой задачу Проверить склад",
      "- Закрой задачу Проверить склад, всё проверил",
      "- Отмени задачу Проверить склад",
      "- Отмени задачу Проверить склад, склад закрыт",
      "- Напиши комментарий к задаче Проверить склад: склад закрыт до завтра",
      "- Позови Васю в задачу Проверить склад, нужны его комментарии",
      "- Передай задачу Проверить склад Васе, потому что он отвечает за склад",
      "- Перекинь задачу Проверить склад с Васи на Машу (OWNER/MANAGER)",
      "- покажи мои задачи",
      "- Какие задачи у Васи? (OWNER/MANAGER)",
      "- мои неподтвержденные расходы",
      "- покажи расходы без чеков",
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
      await replyWithActiveChoiceKeyboard(
        ctx,
        telegramId,
        formatUserCandidates(match.users.map(apiUserToCandidate)),
      );
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

    const project = pickDefaultProject(projects);
    if (!project) {
      await ctx.reply("Нет проектов. Сначала создайте проект в Web.");
      return;
    }

    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;

    const flow = await beginCreateExpenseFlow(ctx, telegramUserId, currentUser, {
      amount,
      description,
      executeIfResolved: true,
    });

    if (flow.kind === "error") {
      await ctx.reply(flow.message);
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
      if (getPendingTaskStatusDetails(telegramUserId)) {
        await ctx.reply(result.message, {
          reply_markup: buildTaskStatusDetailsCancelKeyboard(),
        });
      } else {
        await replyWithActiveChoiceKeyboard(ctx, telegramUserId, result.message);
      }
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
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
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
      if (getPendingTaskStatusDetails(telegramUserId)) {
        await ctx.reply(result.message, {
          reply_markup: buildTaskStatusDetailsCancelKeyboard(),
        });
      } else {
        await replyWithActiveChoiceKeyboard(ctx, telegramUserId, result.message);
      }
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
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
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
      await replyWithActiveChoiceKeyboard(ctx, telegramUserId, result.message);
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
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
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
      await replyWithActiveChoiceKeyboard(ctx, telegramUserId, result.message);
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
          comment: resolved.text,
        },
      },
      resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
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
        await replyWithActiveChoiceKeyboard(ctx, telegramUserId, result.message);
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
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
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
        await replyWithActiveChoiceKeyboard(ctx, telegramUserId, result.message);
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
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] transfer command error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
});

bot.command("reassign", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const telegramUserId = ctx.from?.id;
  try {
    const currentUser = await requireLinkedUser(ctx);
    if (!currentUser || !telegramUserId) return;

    const result = await handleReassignSlashCommand(
      currentUser,
      telegramUserId,
      payload,
      ctx,
    );
    if (result.kind === "reply" || result.kind === "user_selection_started") {
      if (result.kind !== "user_selection_started") {
        await replyWithActiveChoiceKeyboard(ctx, telegramUserId, result.message);
      }
      return;
    }

    const resolved = result.resolved;
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        intent: "reassign_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          taskTitle: resolved.taskTitle,
          fromUserHint: resolved.fromUserName,
          toUserHint: resolved.toUserName,
          comment: resolved.comment,
        },
      },
      resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] reassign command error: ${msg}`);
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
      await replyWithActiveChoiceKeyboard(ctx, telegramUserId, usageOrNull);
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

bot.command(["cancel-absence", "delete-absence"], async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  devLog("parsed cancel-absence command", { payload });

  try {
    await handleCancelAbsenceSlashCommand(ctx, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] cancel-absence command error: ${msg}`);
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
  if (lastExpense?.pendingReceipt) {
    try {
      await attachTelegramReceiptToExpense(lastExpense.expenseId, lastExpense.uploadedById, file);
      await ctx.reply("Чек прикреплён. Расход подтверждён.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
      await ctx.reply(`Ошибка API: ${msg}`);
    }
    return;
  }

  const pendingUpload = getPendingExpenseReceiptUpload(telegramUserId);
  if (pendingUpload) {
    if (isPendingExpenseReceiptUploadExpired(pendingUpload)) {
      clearPendingExpenseReceiptUpload(telegramUserId);
      await ctx.reply("Время ожидания истекло. Повторите команду.");
      return;
    }
    try {
      await attachTelegramReceiptToExpense(
        pendingUpload.expenseId,
        pendingUpload.uploadedById,
        file,
      );
      clearPendingExpenseReceiptUpload(telegramUserId);
      await ctx.reply("Чек прикреплён. Расход подтверждён.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
      await ctx.reply(`Ошибка API: ${msg}`);
    }
    return;
  }

  if (!lastExpense) {
    await ctx.reply("Не нашёл недавний расход. Сначала создайте расход командой /expense.");
    return;
  }

  try {
    await attachTelegramReceiptToExpense(lastExpense.expenseId, lastExpense.uploadedById, file);
    await ctx.reply(
      `Чек прикреплён к расходу ${formatMoney(lastExpense.amount)} по бюджету «${lastExpense.budgetTitle}».`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
}

bot.command("pending-expenses", async (ctx) => {
  try {
    const linked = await requireLinkedUser(ctx);
    if (!linked) return;

    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;

    await showPendingExpenses(ctx, linked, telegramUserId, 10);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] pending-expenses command error: ${msg}`);
    await ctx.reply(msg.startsWith("GET /budget-expenses/pending") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`);
  }
});

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

bot.on("message:voice", async (ctx) => {
  await handleTelegramVoiceMessage(ctx);
});

bot.on("callback_query:data", async (ctx) => {
  if (await handleStartLinkCallback(ctx)) return;
  if (await handleMainMenuCallback(ctx)) return;
  if (await handleTaskStatusDetailsCancelCallback(ctx)) return;
  await handleChoiceCallback(ctx);
  await handleConfirmationCallback(ctx);
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (!text || text.startsWith("/")) return;
  await handlePlainTextMessage(ctx);
});

const mode = process.env.BOT_MODE ?? "polling";

async function main() {
  if (process.env.BOT_DEV_SELF_CHECKS === "true") {
    devLogRelativeMonthDeadlineChecks();
    devLogCreateTaskAssigneeSelfChecks();
    devLogCreateAbsenceUserSelfChecks();
    devLogResolveUsersByHintChecks();
    devLogNaturalLanguageSelfChecks();
    devLogValidateAddTaskCommentChecks();
    devLogAiStage2SelfChecks();
    devLogAiProviderRegistryChecks();
    devLogAiProviderHardeningChecks();
    devLogCreateTaskAssigneeResolveChecks();
    devLogTransferCommentFixChecks();
    devLogCreateTaskTitleDescriptionChecks();
    devLogConfirmationKeyboardChecks();
    devLogChoiceKeyboardChecks();
    devLogVoicePendingGuardChecks();
    devLogSpeechKitAsyncRoutingChecks();
    await devLogTaskStatusFlowChecks();
    await devLogSafeCallbackChecks();
    await devLogCreateTaskNormalizeChecks();
  }
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
