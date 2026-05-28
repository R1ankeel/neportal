import type { Context } from "grammy";
import type { ApiProject } from "./api";
import { formatProjectSelectionMessage } from "./project-selection-format";
import {
  resolveProjectForAction,
  resolveProjectForActionMessage,
  type ResolveProjectForActionResult,
} from "./project-resolution";
import {
  startPendingProjectSelection,
  type ProjectSelectionContinue,
} from "./pending-project-selection";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";

export async function replyProjectResolutionError(
  ctx: Pick<Context, "reply">,
  result: ResolveProjectForActionResult,
): Promise<boolean> {
  const message = resolveProjectForActionMessage(result);
  if (!message) return false;
  await ctx.reply(message);
  return true;
}

export async function startProjectSelectionIfNeeded(
  ctx: Context,
  telegramUserId: number,
  projects: ApiProject[],
  projectHint: string | undefined,
  continuation: ProjectSelectionContinue,
): Promise<ApiProject | null> {
  const result = resolveProjectForAction(projects, projectHint);
  if (result.kind === "resolved") {
    return result.project;
  }
  if (result.kind === "not_found" || result.kind === "ambiguous") {
    await replyProjectResolutionError(ctx, result);
    return null;
  }

  startPendingProjectSelection(telegramUserId, {
    candidates: result.projects.map((p) => ({ id: p.id, name: p.name })),
    truncated: result.truncated,
    continue: continuation,
  });
  await replyWithActiveChoiceKeyboard(
    ctx,
    telegramUserId,
    formatProjectSelectionMessage(result.projects, { truncated: result.truncated }),
  );
  return null;
}
