import path from "node:path";
import { config } from "dotenv";
import { Bot } from "grammy";
import { createTask, fetchUsers, pickAssigneeId, pickCreatorId, getApiBaseUrl } from "./api";

config({
  path: process.env.NEPORTAL_ENV_PATH ?? path.resolve(process.cwd(), ".env"),
});

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
      "Создавай задачи текстом: /task <название>",
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
    const users = await fetchUsers();
    const creatorId = pickCreatorId(users);
    const assigneeId = pickAssigneeId(users);
    if (!creatorId) {
      await ctx.reply("Не удалось определить автора задачи. Проверьте сид и GET /users.");
      return;
    }

    const task = await createTask({
      title,
      creatorId,
      assigneeId,
    });

    await ctx.reply(`Задача создана: ${task.title}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
});

bot.hears(/^\/task(?:@\w+)?\s*$/i, async (ctx) => {
  await ctx.reply("Использование: /task Подготовить отчёт");
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
