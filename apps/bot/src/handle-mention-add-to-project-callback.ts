import type { Context } from "grammy";
import { addProjectMember } from "./api";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import {
  continueMentionFlowAfterAddToProject,
  formatAddToProjectCancelMessageForName,
} from "./mention-project-membership";
import {
  clearPendingMentionAddToProject,
  getPendingMentionAddToProject,
  isPendingMentionAddToProjectExpired,
} from "./pending-mention-add-to-project";
import { clearPendingConfirmation } from "./pending-intent";
import { parseMentionAddCallbackData } from "./telegram/keyboards/mention-add-to-project-keyboard";
import { safeAnswerCallbackQuery } from "./telegram/safe-answer-callback";
import { safeEditMessageReplyMarkup } from "./telegram/safe-edit-message-reply-markup";

export async function handleMentionAddToProjectCallback(ctx: Context): Promise<boolean> {
  const parsed = parseMentionAddCallbackData(ctx.callbackQuery?.data);
  if (!parsed) return false;

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId || parsed.ownerTelegramUserId !== telegramUserId) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Этот выбор не для вас или уже устарел.",
      show_alert: false,
    });
    return true;
  }

  const pending = getPendingMentionAddToProject(telegramUserId);
  if (!pending || pending.choiceId !== parsed.choiceId) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Этот выбор уже обработан или устарел.",
      show_alert: false,
    });
    await safeEditMessageReplyMarkup(ctx, undefined);
    return true;
  }

  if (isPendingMentionAddToProjectExpired(pending)) {
    clearPendingMentionAddToProject(telegramUserId);
    if (pending.continuation === "execute") {
      clearPendingConfirmation(telegramUserId);
    }
    await safeAnswerCallbackQuery(ctx, {
      text: "Время ожидания истекло. Повторите команду.",
      show_alert: false,
    });
    await safeEditMessageReplyMarkup(ctx, undefined);
    return true;
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageReplyMarkup(ctx, undefined);

  if (parsed.action === "no") {
    clearPendingMentionAddToProject(telegramUserId);
    if (pending.continuation === "execute") {
      clearPendingConfirmation(telegramUserId);
    }
    await ctx.reply(formatAddToProjectCancelMessageForName(pending.mentionedUserName));
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked || linked.id !== pending.actorUserId) {
    clearPendingMentionAddToProject(telegramUserId);
    if (pending.continuation === "execute") {
      clearPendingConfirmation(telegramUserId);
    }
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  try {
    await addProjectMember(pending.projectId, linked.id, pending.mentionedUserId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
    return true;
  }

  clearPendingMentionAddToProject(telegramUserId);
  if (pending.continuation === "execute") {
    clearPendingConfirmation(telegramUserId);
  }

  await continueMentionFlowAfterAddToProject(ctx, telegramUserId, linked, pending);
  return true;
}
