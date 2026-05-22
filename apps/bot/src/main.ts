import { Bot } from "grammy";
import { loadRootEnv } from "@neportal/shared";
import {
  createAbsence,
  createBudgetExpense,
  createExpenseAttachment,
  createNote,
  createTask,
  fetchBudgets,
  fetchProjects,
  fetchUserByTelegramId,
  fetchUsers,
  findUserByNameHint,
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
import {
  devLogRelativeMonthDeadlineChecks,
  formatIsoDateRu,
  parseRuDate,
  todayIsoDate,
} from "./parse-ru-date";
import { getLastExpense, setLastExpense } from "./last-expense";
import { handlePlainTextMessage } from "./ai-message";
import { handleStartBinding } from "./start-binding";
import { startTaskNotificationScheduler } from "./task-notification-scheduler";
import { notifyTaskAssigned } from "./task-notifications";
import { handleDeadlineSlashCommand } from "./handle-deadline-slash";
import { handleCommentSlashCommand } from "./task-comment-flow";
import { handleTaskStatusSlashCommand } from "./task-status-flow";
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
      "/done <название> — закрыть задачу",
      "/cancel <название> — отменить задачу",
      "/comment <задача> — <комментарий> — комментарий к задаче",
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
      "/done Проверить склад — закрыть задачу",
      "/cancel Проверить склад — отменить задачу",
      "/comment Проверить склад — склад закрыт до завтра — комментарий к задаче",
      "/link Вася Пупкин — привязка по ФИО (dev)",
      "/me — статус привязки",
      "",
      "Можно писать обычным текстом, например:",
      "- Поставь Васе задачу подготовить отчет до 23 мая",
      "- Запиши заметку: клиент попросил проверить статистику",
      "- Потратил 1500 рублей на рекламу VK",
      "- Вася заболел до 25 мая, больничный 123456",
      "- Закрой задачу Проверить склад",
      "- Закрой задачу Проверить склад, всё проверил",
      "- Отмени задачу Проверить склад",
      "- Отмени задачу Проверить склад, склад закрыт",
      "- Напиши комментарий к задаче Проверить склад: склад закрыт до завтра",
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
    const match = findUserByNameHint(users, hint);
    if (match.kind === "none") {
      await ctx.reply(`Не нашёл сотрудника «${hint}». Проверьте имя.`);
      return;
    }
    if (match.kind === "many") {
      const names = match.users.map((u) => u.fullName).join(", ");
      await ctx.reply(`Нашёл несколько сотрудников: ${names}. Уточните ФИО.`);
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

const SICK_USAGE = "Использование: /sick до 25.05.2026 номер 123456";
const VACATION_USAGE = "Использование: /vacation с 01.06.2026 по 10.06.2026";

/** grammY: bot.hears не ловит Telegram-команды — только bot.command. */
function parseSickPayload(payload: string): { endIso: string; documentNumber?: string } | null {
  const m = payload.trim().match(/^(?:до\s+)?(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+номер\s+(\S+))?$/iu);
  if (!m) return null;
  const endIso = parseRuDate(m[1]);
  if (!endIso) return null;
  return { endIso, documentNumber: m[2]?.trim() || undefined };
}

function parseVacationPayload(payload: string): { startIso: string; endIso: string } | null {
  const trimmed = payload.trim();
  const m =
    trimmed.match(/^с\s+(\d{1,2}\.\d{1,2}\.\d{4})\s+по\s+(\d{1,2}\.\d{1,2}\.\d{4})$/iu) ??
    trimmed.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{1,2}\.\d{1,2}\.\d{4})$/iu);
  if (!m) return null;
  const startIso = parseRuDate(m[1]);
  const endIso = parseRuDate(m[2]);
  if (!startIso || !endIso) return null;
  return { startIso, endIso };
}

bot.command("sick", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  devLog("parsed sick command", { payload });

  const parsed = parseSickPayload(payload);
  if (!parsed) {
    await ctx.reply(SICK_USAGE);
    return;
  }

  const { endIso, documentNumber } = parsed;
  const startIso = todayIsoDate();

  try {
    const employee = await requireLinkedUser(ctx);
    if (!employee) return;

    devLog("selected absence user", { id: employee.id, fullName: employee.fullName });

    await createAbsence({
      userId: employee.id,
      type: "SICK_LEAVE",
      startDate: startIso,
      endDate: endIso,
      documentNumber,
      status: "APPROVED",
    });

    await ctx.reply(
      [
        `Больничный добавлен: с ${formatIsoDateRu(startIso)} по ${formatIsoDateRu(endIso)}.`,
        `Номер: ${documentNumber ?? "не указан"}.`,
      ].join("\n"),
    );
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

  const parsed = parseVacationPayload(payload);
  if (!parsed) {
    await ctx.reply(VACATION_USAGE);
    return;
  }

  const { startIso, endIso } = parsed;
  if (endIso < startIso) {
    await ctx.reply("Дата окончания не может быть раньше даты начала.");
    return;
  }

  try {
    const employee = await requireLinkedUser(ctx);
    if (!employee) return;

    devLog("selected absence user", { id: employee.id, fullName: employee.fullName });

    await createAbsence({
      userId: employee.id,
      type: "VACATION",
      startDate: startIso,
      endDate: endIso,
      status: "APPROVED",
    });

    await ctx.reply(`Отпуск добавлен: с ${formatIsoDateRu(startIso)} по ${formatIsoDateRu(endIso)}.`);
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
