import { SELF_HINT_MARKER } from "./resolve-users-by-hint";

/** JS `\b` не учитывает кириллицу — граница слова через Unicode properties. */
const WB_START = "(?<![\\p{L}\\p{N}_])";
const WB_END = "(?![\\p{L}\\p{N}_])";

/**
 * Явные маркеры «исполнитель = я» в исходном тексте create_task.
 * Только create_task — не transfer/mention.
 */
const CREATE_TASK_SELF_MARKER_PATTERNS: RegExp[] = [
  new RegExp(`${WB_START}поставь\\s+мне${WB_END}`, "iu"),
  new RegExp(`${WB_START}поставь\\s+задачу\\s+мне${WB_END}`, "iu"),
  new RegExp(`${WB_START}поставь\\s+мне\\s+задачу${WB_END}`, "iu"),
  new RegExp(`${WB_START}запиши\\s+мне\\s+в\\s+задач`, "iu"),
  new RegExp(`${WB_START}добавь\\s+мне\\s+задачу${WB_END}`, "iu"),
  new RegExp(`${WB_START}на\\s+меня${WB_END}`, "iu"),
  new RegExp(`${WB_START}себе${WB_END}`, "iu"),
  new RegExp(`${WB_START}для\\s+меня${WB_END}`, "iu"),
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
