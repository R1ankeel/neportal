import type { AiIntent } from "../../ai-contracts";
import { createTaskAssigneeNeedsClarification } from "../../create-task-assignee-resolve";
import { devLog } from "../../dev-log";
import { fixAiIntentBeforeValidation } from "../../fix-ai-intent-deadline";
import { extractOrdinalWeekdayNextMonth } from "../../parse-ru-date";
import { SELF_HINT_MARKER } from "../../resolve-users-by-hint";
import { postProcessCreateTaskPayload } from "./create-task-normalize";

const BASE_DATE = "2026-05-25";

const ORDINAL_DATE_CASES: ReadonlyArray<{ text: string; expected: string }> = [
  { text: "на первую пятницу следующего месяца", expected: "2026-06-05" },
  { text: "первую пятницу следующего месяца", expected: "2026-06-05" },
  { text: "на вторую пятницу следующего месяца", expected: "2026-06-12" },
  { text: "на третью пятницу следующего месяца", expected: "2026-06-19" },
  { text: "на четвертую пятницу следующего месяца", expected: "2026-06-26" },
  { text: "на последнюю пятницу следующего месяца", expected: "2026-06-26" },
  { text: "ко второй среде следующего месяца", expected: "2026-06-10" },
  { text: "на первый понедельник следующего месяца", expected: "2026-06-01" },
  { text: "в следующем месяце в первую пятницу", expected: "2026-06-05" },
];

const ORIGINAL_CASE_1 =
  "Создай Маше задачу на первую пятницу следующего месяца сделать отчёт по продажам";

type NormalizeCase = {
  name: string;
  userText: string;
  payload: Record<string, unknown>;
  expect: {
    title?: string;
    description?: string | null;
    deadlineDate?: string;
    assigneeHint?: string;
  };
};

const NORMALIZE_CASES: NormalizeCase[] = [
  {
    name: "case1 dirty title wrong deadline",
    userText: ORIGINAL_CASE_1,
    payload: {
      title: "На первую пятницу следующего месяца сделать отчёт по продажам",
      description: null,
      deadlineDate: "2026-05-29",
      assigneeHint: "Маше",
    },
    expect: {
      title: "Сделать отчёт по продажам",
      description: null,
      deadlineDate: "2026-06-05",
      assigneeHint: "Маше",
    },
  },
  {
    name: "case2 title only date phrase",
    userText: ORIGINAL_CASE_1,
    payload: {
      title: "Первую пятницу следующего месяца",
      description: null,
      deadlineDate: "2026-05-29",
      assigneeHint: "Маше",
    },
    expect: {
      title: "Сделать отчёт по продажам",
      description: null,
      deadlineDate: "2026-06-05",
    },
  },
  {
    name: "case3 date in description",
    userText: ORIGINAL_CASE_1,
    payload: {
      title: "Сделать отчёт по продажам",
      description: "На первую пятницу следующего месяца",
      deadlineDate: "2026-05-29",
      assigneeHint: "Маше",
    },
    expect: {
      title: "Сделать отчёт по продажам",
      description: null,
      deadlineDate: "2026-06-05",
    },
  },
  {
    name: "case4 supplemental description from user text",
    userText:
      "Создай Маше задачу на первую пятницу следующего месяца сделать отчёт. Собрать данные из CRM.",
    payload: {
      title: "На первую пятницу следующего месяца сделать отчёт",
      description: null,
      deadlineDate: "2026-05-29",
      assigneeHint: "Маше",
    },
    expect: {
      title: "Сделать отчёт",
      description: "Собрать данные из CRM",
      deadlineDate: "2026-06-05",
    },
  },
  {
    name: "case5 date at end of message",
    userText:
      "Создай Маше задачу сделать отчёт по продажам на первую пятницу следующего месяца",
    payload: {
      title: "Сделать отчёт по продажам на первую пятницу следующего месяца",
      description: null,
      deadlineDate: "2026-05-29",
      assigneeHint: "Маше",
    },
    expect: {
      title: "Сделать отчёт по продажам",
      description: null,
      deadlineDate: "2026-06-05",
    },
  },
];

function clonePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload };
}

function runOrdinalDateChecks(): void {
  for (const { text, expected } of ORDINAL_DATE_CASES) {
    const match = extractOrdinalWeekdayNextMonth(text, BASE_DATE);
    const ok = match?.deadlineDate === expected;
    devLog(`create_task ordinal date ${ok ? "OK" : "FAIL"}: ${text.slice(0, 48)}`, {
      expected,
      got: match?.deadlineDate ?? null,
      matchedText: match?.matchedText,
    });
  }
}

function assertPayload(
  name: string,
  payload: Record<string, unknown>,
  expect: NormalizeCase["expect"],
): void {
  const title = typeof payload.title === "string" ? payload.title : undefined;
  const description =
    typeof payload.description === "string" ? payload.description : undefined;
  const deadlineDate =
    typeof payload.deadlineDate === "string" ? payload.deadlineDate : undefined;

  const titleOk = expect.title === undefined || title === expect.title;
  const descOk =
    expect.description === undefined ||
    (expect.description === null ? description === undefined : description === expect.description);
  const deadlineOk =
    expect.deadlineDate === undefined || deadlineDate === expect.deadlineDate;

  const ok = titleOk && descOk && deadlineOk;
  devLog(`create_task normalize ${name} ${ok ? "OK" : "FAIL"}`, {
    expect,
    got: { title, description, deadlineDate },
  });
}

function runNormalizeCases(): void {
  for (const testCase of NORMALIZE_CASES) {
    const payload = clonePayload(testCase.payload);
    postProcessCreateTaskPayload(payload, {
      userText: testCase.userText,
      baseDate: BASE_DATE,
    });
    assertPayload(testCase.name, payload, testCase.expect);
  }
}

function runRegressionCases(): void {
  const tomorrowText = "создай Маше задачу на завтра сделать отчёт";
  const tomorrowPayload: Record<string, unknown> = {
    title: "На завтра сделать отчёт",
    deadlineDate: "2026-05-30",
    assigneeHint: "Маше",
  };
  postProcessCreateTaskPayload(tomorrowPayload, { userText: tomorrowText, baseDate: BASE_DATE });
  devLog(
    `create_task regression завтра ${tomorrowPayload.deadlineDate === "2026-05-26" ? "OK" : "FAIL"}`,
    { got: tomorrowPayload.deadlineDate, title: tomorrowPayload.title },
  );

  const fridayText = "создай Маше задачу до пятницы сделать отчёт";
  const fridayPayload: Record<string, unknown> = {
    title: "До пятницы сделать отчёт",
    deadlineDate: "2026-06-05",
    assigneeHint: "Маше",
  };
  postProcessCreateTaskPayload(fridayPayload, { userText: fridayText, baseDate: BASE_DATE });
  const fridayOk =
    typeof fridayPayload.deadlineDate === "string" &&
    fridayPayload.deadlineDate >= "2026-05-25" &&
    fridayPayload.deadlineDate <= "2026-05-31";
  devLog(`create_task regression до пятницы ${fridayOk ? "OK" : "FAIL"}`, {
    got: fridayPayload.deadlineDate,
    title: fridayPayload.title,
  });

  const absText = "создай Маше задачу 25.06.2026 сделать отчёт";
  const absPayload: Record<string, unknown> = {
    title: "25.06.2026 сделать отчёт",
    deadlineDate: "2026-05-29",
    assigneeHint: "Маше",
  };
  postProcessCreateTaskPayload(absPayload, { userText: absText, baseDate: BASE_DATE });
  devLog(
    `create_task regression 25.06.2026 ${absPayload.deadlineDate === "2026-06-25" ? "OK" : "FAIL"}`,
    { got: absPayload.deadlineDate, title: absPayload.title },
  );

  const selfText = "создай мне задачу на завтра подготовить отчёт";
  const selfFixed = fixAiIntentBeforeValidation(
    {
      intent: "create_task",
      confidence: 0.9,
      requiresConfirmation: true,
      payload: {
        title: "Подготовить отчёт",
        assigneeUserId: SELF_HINT_MARKER,
        deadlineDate: "2026-05-30",
      },
    },
    { userText: selfText, baseDate: BASE_DATE },
  ) as Extract<AiIntent, { intent: "create_task" }>;

  const selfOk =
    selfFixed.payload.assigneeUserId === SELF_HINT_MARKER &&
    createTaskAssigneeNeedsClarification(selfFixed.payload) === false;
  devLog(`create_task regression self assignee ${selfOk ? "OK" : "FAIL"}`, {
    assigneeUserId: selfFixed.payload.assigneeUserId,
    deadlineDate: selfFixed.payload.deadlineDate,
  });

  const missingFixed = fixAiIntentBeforeValidation(
    {
      intent: "create_task",
      confidence: 0.9,
      requiresConfirmation: true,
      payload: { title: "Сделать отчёт", deadlineDate: "2026-06-05" },
    },
    { userText: ORIGINAL_CASE_1, baseDate: BASE_DATE },
  ) as Extract<AiIntent, { intent: "create_task" }>;

  devLog(
    `create_task regression missing assignee ${createTaskAssigneeNeedsClarification(missingFixed.payload) ? "OK" : "FAIL"}`,
    { payload: missingFixed.payload },
  );
}

function runFixAiIntentFlowCheck(): void {
  const userText =
    "Создай Маше задачу на первую пятницу следующего месяца сделать отчёт по продажам.";
  const fixed = fixAiIntentBeforeValidation(
    {
      intent: "create_task",
      confidence: 0.9,
      requiresConfirmation: true,
      payload: {
        title: "На первую пятницу следующего месяца сделать отчёт по продажам",
        description: "первая пятница следующего месяца",
        deadlineDate: "2026-05-29",
        assigneeHint: "Маше",
      },
    },
    { userText, baseDate: BASE_DATE },
  ) as Extract<AiIntent, { intent: "create_task" }>;

  const ok =
    fixed.payload.deadlineDate === "2026-06-05" &&
    fixed.payload.title === "Сделать отчёт по продажам" &&
    fixed.payload.description === undefined;
  devLog(`create_task fixAiIntent flow ${ok ? "OK" : "FAIL"}`, {
    got: fixed.payload,
  });
}

/** Dev self-checks для post-processing create_task (BOT_DEV_SELF_CHECKS=true). */
export function devLogCreateTaskNormalizeChecks(): void {
  runOrdinalDateChecks();
  runNormalizeCases();
  runRegressionCases();
  runFixAiIntentFlowCheck();
}
