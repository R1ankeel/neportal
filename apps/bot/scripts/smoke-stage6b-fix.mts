/**
 * Stage 6B fix smoke. Run: pnpm --filter @neportal/bot exec tsx scripts/smoke-stage6b-fix.mts
 */
import { createRequire } from "module";
import type { Context } from "grammy";
import { loadRootEnv } from "@neportal/shared";

loadRootEnv();

const require = createRequire(import.meta.url);
const { fetchUsers, getApiBaseUrl } = require("../dist/api.js");
const { formatMyTasksReply, TASK_LIST_DISPLAY_LIMIT } = require("../dist/my-tasks-flow.js");
const {
  enterConfirmationEditMode,
  handlePendingConfirmationEditMessage,
} = require("../dist/confirmation-edit.js");
const { handlePendingProjectSelectionMessage } = require("../dist/handle-pending-project-selection.js");
const { getPendingProjectSelection } = require("../dist/pending-project-selection.js");
const { getPendingConfirmationEdit } = require("../dist/pending-confirmation-edit.js");
const { getPendingConfirmation, setPendingConfirmation } = require("../dist/pending-intent.js");
const { resolveIntent } = require("../dist/intent-resolver.js");
const { buildIntentPreview } = require("../dist/intent-preview.js");
const { routeParsedAiIntent } = require("../dist/route-parsed-intent.js");
const { getPendingCreateTaskAssignee } = require("../dist/pending-create-task-assignee.js");

const TG_OWNER = 5_398_285_050;
const TG_MANAGER = 5_298_548_877;

function mockCtx() {
  const replies: string[] = [];
  const ctx = {
    from: { id: TG_OWNER },
    chat: { id: TG_OWNER },
    reply: async (text: string) => {
      replies.push(text);
      return { message_id: replies.length };
    },
  } as unknown as Context;
  return { ctx, replies };
}

function sectionCount(text: string): number {
  return [...text.matchAll(/^Проект: /gm)].length;
}

async function fetchProjects(actorId: string) {
  const url = new URL(`${getApiBaseUrl()}/projects`);
  url.searchParams.set("actorUserId", actorId);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET /projects → ${res.status}`);
  return res.json() as Promise<{ id: string; name: string }[]>;
}

const users = await fetchUsers();
const owner = users.find((u) => u.fullName.includes("Михайлович"))!;
const manager = users.find((u) => u.fullName.includes("Валерия"))!;

let failed = 0;
function pass(name: string) {
  console.log(`[PASS] ${name}`);
}
function fail(name: string, detail: string) {
  console.log(`[FAIL] ${name}: ${detail}`);
  failed++;
}

// 1. edit → pick project → new preview
{
  const intent = {
    intent: "create_task" as const,
    confidence: 0.9,
    requiresConfirmation: true,
    payload: {
      title: "smoke-6b-fix",
      assigneeHint: "__self__",
      projectHint: "Stage4 Smoke Test",
    },
  };
  const r = await resolveIntent(intent, TG_OWNER);
  if (!r.ok) {
    fail("edit-pick-preview", r.message);
  } else {
    setPendingConfirmation(TG_OWNER, { type: "ai_intent", intent, resolved: r.resolved });
    const before = buildIntentPreview(r.resolved);
    enterConfirmationEditMode(TG_OWNER, { type: "ai_intent", intent, resolved: r.resolved });
    const { ctx: c1, replies: r1 } = mockCtx();
    await handlePendingConfirmationEditMessage(c1, TG_OWNER, "5");
    if (!getPendingConfirmationEdit(TG_OWNER)) {
      fail("edit-pick-preview", "edit pending lost after field Проект");
    } else if (!getPendingConfirmation(TG_OWNER)) {
      fail("edit-pick-preview", "confirmation lost after field Проект");
    } else if (!getPendingProjectSelection(TG_OWNER)) {
      fail("edit-pick-preview", "no project selection pending");
    } else {
      const { ctx: c2, replies: r2 } = mockCtx();
      await handlePendingProjectSelectionMessage(c2, TG_OWNER, "1");
      const conf = getPendingConfirmation(TG_OWNER);
      const after =
        conf?.type === "ai_intent" ? buildIntentPreview(conf.resolved) : "";
      const pickedVk = r2.some((x) => x.includes("Реклама VK")) || after.includes("Реклама VK");
      if (r2.some((x) => x.includes("Сессия редактирования истекла"))) {
        fail("edit-pick-preview", r2.join(" | "));
      } else if (!pickedVk) {
        fail("edit-pick-preview", `no VK in preview: ${after.slice(0, 200)}`);
      } else if (after === before) {
        fail("edit-pick-preview", "preview unchanged after pick Реклама VK");
      } else {
        pass("edit-pick-preview");
        console.log("  preview snippet:", after.split("\n").slice(0, 5).join(" / "));
      }
    }
  }
}

// 2. edit → cancel
{
  const intent = {
    intent: "create_task" as const,
    confidence: 0.9,
    requiresConfirmation: true,
    payload: {
      title: "smoke-6b-cancel",
      assigneeHint: "__self__",
      projectHint: "Stage4 Smoke Test",
    },
  };
  const r = await resolveIntent(intent, TG_OWNER);
  if (!r.ok) {
    fail("edit-cancel", r.message);
  } else {
    setPendingConfirmation(TG_OWNER, { type: "ai_intent", intent, resolved: r.resolved });
    enterConfirmationEditMode(TG_OWNER, { type: "ai_intent", intent, resolved: r.resolved });
    const { ctx: c1 } = mockCtx();
    await handlePendingConfirmationEditMessage(c1, TG_OWNER, "5");
    const { ctx: c2, replies: r2 } = mockCtx();
    await handlePendingProjectSelectionMessage(c2, TG_OWNER, "отмена");
    const okMsg = r2.some((x) => x.includes("изменение проекта отменено"));
    if (!okMsg) fail("edit-cancel", `reply: ${r2.join(" | ")}`);
    else if (getPendingProjectSelection(TG_OWNER))
      fail("edit-cancel", "project pending still set");
    else if (!getPendingConfirmation(TG_OWNER))
      fail("edit-cancel", "confirmation lost");
    else if (!getPendingConfirmationEdit(TG_OWNER))
      fail("edit-cancel", "edit pending lost");
    else pass("edit-cancel");
  }
}

// 3. create_task 2+ projects → project selection (owner has 3 accessible projects)
{
  const { ctx, replies } = mockCtx();
  await routeParsedAiIntent(
    ctx,
    owner,
    TG_OWNER,
    "создай задачу smoke-regression",
    {
      intent: "create_task",
      confidence: 0.9,
      requiresConfirmation: true,
      payload: { title: "smoke-regression" },
    },
  );
  const projects = await fetchProjects(owner.id);
  const pp = getPendingProjectSelection(TG_OWNER);
  const assignee = getPendingCreateTaskAssignee(TG_OWNER);
  if (projects.length < 2) {
    fail("create-task-project-selection", `owner has only ${projects.length} projects`);
  } else if (pp && pp.candidates.length >= 2) {
    pass("create-task-project-selection");
    console.log(`  candidates: ${pp.candidates.length}`);
  } else if (assignee) {
    pass("create-task-project-selection (assignee step before project, ok for 6A)");
  } else if (replies.some((x) => x.includes("Выберите проект"))) {
    pass("create-task-project-selection (message only)");
  } else {
    fail("create-task-project-selection", replies.join(" | ").slice(0, 300));
  }
}

// 4. my tasks grouped
{
  const text = await formatMyTasksReply(owner.id, TASK_LIST_DISPLAY_LIMIT);
  const sections = sectionCount(text);
  if (sections < 2) {
    fail("my-tasks-grouped", `sections=${sections}`);
  } else if (!text.startsWith("Ваши ближайшие задачи:")) {
    fail("my-tasks-grouped", "bad header");
  } else {
    pass("my-tasks-grouped");
    console.log(`  sections=${sections}`);
  }
}

console.log(failed ? `\nFAILED: ${failed}` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
