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
  fetchTasks,
  fetchUsers,
  updateTaskDeadline,
  formatMoney,
  parseAmount,
  pickAssigneeId,
  pickAbsenceUserId,
  pickCreatorId,
  pickDefaultBudget,
  pickDefaultProject,
  pickDefaultProjectId,
  getApiBaseUrl,
} from "./api";
import { devLog } from "./dev-log";
import {
  formatIsoDateRu,
  parseDeadlineCommandPayload,
  parseRuDate,
  todayIsoDate,
} from "./parse-ru-date";
import { getLastExpense, setLastExpense } from "./last-expense";
import { handlePlainTextMessage } from "./ai-message";

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
  await ctx.reply(
    [
      "Привет! Я бот Neportal.",
      "",
      "Создавай задачи: /task <название>",
      "Создавай заметки: /note <текст>",
      "Добавляй расходы: /expense <сумма> <описание>",
      "Больничный: /sick до 25.05.2026 номер 123456",
      "Отпуск: /vacation с 01.06.2026 по 10.06.2026",
      "Дедлайн: /deadline Подготовить отчет 22.05.2026",
      "Список команд: /demo",
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
      "",
      "Можно писать обычным текстом, например:",
      "- Поставь Васе задачу подготовить отчет до 23 мая",
      "- Запиши заметку: клиент попросил проверить статистику",
      "- Потратил 1500 рублей на рекламу VK",
      "- Вася заболел до 25 мая, больничный 123456",
      "",
      "Пример с чеком:",
      "/expense 1500 реклама VK",
      "затем отправьте фото или документ чека",
      "",
      `API: ${getApiBaseUrl()}`,
    ].join("\n"),
  );
});

bot.hears(/^\/task(?:@\w+)?\s+(.+)$/ims, async (ctx) => {
  const title = ctx.match[1].trim();
  if (!title) {
    await ctx.reply("Укажите название: /task Сделать что-то важное");
    return;
  }

  try {
    const [users, projects] = await Promise.all([fetchUsers(), fetchProjects()]);
    const creatorId = pickCreatorId(users);
    const assigneeId = pickAssigneeId(users);
    if (!creatorId) {
      await ctx.reply("Не удалось определить автора задачи. Проверьте сид и GET /users.");
      return;
    }

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
    const [users, projects] = await Promise.all([fetchUsers(), fetchProjects()]);
    const creatorId = pickCreatorId(users);
    if (!creatorId) {
      await ctx.reply("Не удалось определить автора заметки. Проверьте сид и GET /users.");
      return;
    }

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
    const [users, projects] = await Promise.all([fetchUsers(), fetchProjects()]);
    const userId = pickCreatorId(users);
    if (!userId) {
      await ctx.reply("Не удалось определить пользователя. Проверьте сид и GET /users.");
      return;
    }

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
const DEADLINE_USAGE = "Использование: /deadline <название задачи> <дата>";

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
    const users = await fetchUsers();
    const employee = pickAbsenceUserId(users);
    if (!employee) {
      await ctx.reply("Не удалось определить сотрудника. Проверьте сид и GET /users.");
      return;
    }

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

bot.command("deadline", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  devLog("parsed deadline command", { payload });

  const parsed = parseDeadlineCommandPayload(payload);
  if (!parsed) {
    await ctx.reply(DEADLINE_USAGE);
    return;
  }

  const { title, dateIso } = parsed;

  try {
    const projects = await fetchProjects();
    const projectId = pickDefaultProjectId(projects);
    if (!projectId) {
      await ctx.reply("Нет проектов. Сначала создайте проект в Web.");
      return;
    }

    const tasks = await fetchTasks(projectId);
    const matches = tasks.filter((t) => t.title === title);

    if (matches.length === 0) {
      await ctx.reply("Задача не найдена.");
      return;
    }
    if (matches.length > 1) {
      await ctx.reply("Найдено несколько задач с таким названием. Уточнение пока не реализовано.");
      return;
    }

    await updateTaskDeadline(matches[0].id, dateIso);

    await ctx.reply(`Дедлайн задачи «${title}» установлен на ${formatIsoDateRu(dateIso)}.`);
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
    const users = await fetchUsers();
    const employee = pickAbsenceUserId(users);
    if (!employee) {
      await ctx.reply("Не удалось определить сотрудника. Проверьте сид и GET /users.");
      return;
    }

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
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.reply("Не удалось определить пользователя Telegram.");
    return;
  }

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
