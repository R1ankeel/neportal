import { SELF_HINT_MARKER } from "./resolve-users-by-hint";

/**
 * Явные маркеры «исполнитель = я» в исходном тексте create_task.
 * Только create_task — не transfer/mention.
 */
const CREATE_TASK_SELF_MARKER_PATTERNS: RegExp[] = [
  /поставь\s+мне\b/iu,
  /поставь\s+задачу\s+мне\b/iu,
  /поставь\s+мне\s+задачу\b/iu,
  /запиши\s+мне\s+в\s+задач/iu,
  /добавь\s+мне\s+задачу\b/iu,
  /\bна\s+меня\b/iu,
  /\bсебе\b/iu,
  /\bдля\s+меня\b/iu,
];

export function createTaskTextHasSelfAssigneeMarker(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  return CREATE_TASK_SELF_MARKER_PATTERNS.some((re) => re.test(t));
}

/**
 * Если в тексте есть self-marker — принудительно assigneeHint = "__self__"
 * (приоритет над именами в title).
 */
export function applyCreateTaskAssigneeSelfFix(
  payload: Record<string, unknown>,
  userText?: string,
): boolean {
  if (!userText?.trim()) return false;
  if (!createTaskTextHasSelfAssigneeMarker(userText)) return false;
  payload.assigneeHint = SELF_HINT_MARKER;
  return true;
}

export const CREATE_TASK_ASSIGNEE_SELF_CHECK_BASE = "2026-05-22";

/** Dev: post-processing перебивает ошибочный assigneeHint при «мне». */
export const CREATE_TASK_ASSIGNEE_SELF_CHECK_CASES: Array<{
  text: string;
  wrongAssigneeHint: string;
}> = [
  {
    text: "Поставь мне задачу уволить Васю за кутежи через месяц",
    wrongAssigneeHint: "Вася",
  },
  {
    text: "Запиши мне в задачи позвонить Ивану завтра",
    wrongAssigneeHint: "Иван",
  },
];

export function devLogCreateTaskAssigneeSelfChecks(): void {
  if (process.env.BOT_DEV_LOG === "0") return;

  for (const { text, wrongAssigneeHint } of CREATE_TASK_ASSIGNEE_SELF_CHECK_CASES) {
    const payload: Record<string, unknown> = {
      assigneeHint: wrongAssigneeHint,
      title: "Test",
    };
    const changed = applyCreateTaskAssigneeSelfFix(payload, text);
    const ok = changed && payload.assigneeHint === SELF_HINT_MARKER;
    console.log(`[fix-ai-intent-assignee] self assignee ${ok ? "OK" : "FAIL"}`, {
      text,
      wrongAssigneeHint,
      got: payload.assigneeHint,
    });
  }
}
