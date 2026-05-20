import { Bot } from "grammy";
import { loadRootEnv } from "@neportal/shared";
import {
  createBudgetExpense,
  createNote,
  createTask,
  fetchBudgets,
  fetchProjects,
  fetchUsers,
  formatMoney,
  parseAmount,
  pickAssigneeId,
  pickCreatorId,
  pickDefaultBudget,
  pickDefaultProject,
  pickDefaultProjectId,
  getApiBaseUrl,
} from "./api";

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
      ].join("\n"),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
});

bot.hears(/^\/expense(?:@\w+)?\s*$/i, async (ctx) => {
  await ctx.reply("Использование: /expense <сумма> <описание>");
});

bot.hears(/^\/expense(?:@\w+)?\s+(.+)$/ims, async (ctx) => {
  await ctx.reply("Использование: /expense <сумма> <описание>");
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
