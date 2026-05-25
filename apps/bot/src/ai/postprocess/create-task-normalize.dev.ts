import type { AiIntent } from "../../ai-contracts";
import { applyCreateTaskTitleDescriptionFix } from "../../fix-ai-intent-create-task";
import { createTaskAssigneeNeedsClarification } from "../../create-task-assignee-resolve";
import { devLog } from "../../dev-log";
import { fixAiIntentBeforeValidation } from "../../fix-ai-intent-deadline";
import { extractOrdinalWeekdayDate } from "../../parse-ru-date";
import { SELF_HINT_MARKER } from "../../resolve-users-by-hint";
import { needsLlmDeadlineResolution } from "./create-task-deadline-llm";
import { resolveCreateTaskDeadlineDevMock } from "./create-task-deadline-llm";
import { postProcessCreateTaskPayloadAsync } from "./create-task-normalize";

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
  { text: "на первую пятницу июля", expected: "2026-07-03" },
  { text: "на вторую среду июля", expected: "2026-07-08" },
  { text: "на последнюю пятницу июля", expected: "2026-07-31" },
];

const JULY_TEXT =
  "Создай Маше задачу на первую пятницу июля сделать отчёт по продажам";

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
  {
    name: "case6 july first friday",
    userText: JULY_TEXT,
    payload: {
      title: "Сделать отчёт по продажам",
      description: null,
      deadlineDate: "2026-05-29",
      assigneeHint: "Маше",
    },
    expect: {
      title: "Сделать отчёт по продажам",
      description: null,
      deadlineDate: "2026-07-03",
    },
  },
  {
    name: "case7 july first friday at end",
    userText: "Создай Маше задачу сделать отчёт по продажам на первую пятницу июля",
    payload: {
      title: "Сделать отчёт по продажам на первую пятницу июля",
      description: null,
      deadlineDate: "2026-05-29",
      assigneeHint: "Маше",
    },
    expect: {
      title: "Сделать отчёт по продажам",
      description: null,
      deadlineDate: "2026-07-03",
    },
  },
  {
    name: "case8 july first friday supplemental description",
    userText: "Создай Маше задачу на первую пятницу июля сделать отчёт. Собрать данные из CRM.",
    payload: {
      title: "На первую пятницу июля сделать отчёт",
      description: null,
      deadlineDate: "2026-05-29",
      assigneeHint: "Маше",
    },
    expect: {
      title: "Сделать отчёт",
      description: "Собрать данные из CRM",
      deadlineDate: "2026-07-03",
    },
  },
];

function clonePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload };
}

function runOrdinalDateChecks(): void {
  for (const { text, expected } of ORDINAL_DATE_CASES) {
    const match = extractOrdinalWeekdayDate(text, BASE_DATE);
    const ok = match?.deadlineDate === expected;
    devLog(`create_task ordinal date ${ok ? "OK" : "FAIL"}: ${text.slice(0, 48)}`, {
      expected,
      got: match?.deadlineDate ?? null,
      matchedText: match?.matchedText,
    });
  }
}

function runNeedsLlmChecks(): void {
  const julyOk = needsLlmDeadlineResolution(JULY_TEXT) === false;
  devLog(`create_task needsLlm июля deterministic ${julyOk ? "OK" : "FAIL"}`, {});

  const tomorrowOk =
    needsLlmDeadlineResolution("создай задачу на завтра сделать отчёт") === false;
  devLog(`create_task needsLlm завтра only ${tomorrowOk ? "OK" : "FAIL"}`, {});

  const fridayOk =
    needsLlmDeadlineResolution("создай Маше задачу до пятницы сделать отчёт") === false;
  devLog(`create_task needsLlm до пятницы ${fridayOk ? "OK" : "FAIL"}`, {});
}

function runJulyMockCheck(): void {
  const mock = resolveCreateTaskDeadlineDevMock(JULY_TEXT, BASE_DATE);
  const ok = mock?.deadlineDate === "2026-07-03";
  devLog(`create_task mock july first friday ${ok ? "OK" : "FAIL"}`, {
    got: mock?.deadlineDate ?? null,
    datePhrase: mock?.datePhrase,
  });
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

async function runNormalizeCases(): Promise<void> {
  for (const testCase of NORMALIZE_CASES) {
    const payload = clonePayload(testCase.payload);
    await postProcessCreateTaskPayloadAsync(payload, {
      userText: testCase.userText,
      baseDate: BASE_DATE,
    });
    assertPayload(testCase.name, payload, testCase.expect);
  }
}

async function runRegressionCases(): Promise<void> {
  const tomorrowText = "создай Маше задачу на завтра сделать отчёт";
  const tomorrowPayload: Record<string, unknown> = {
    title: "На завтра сделать отчёт",
    deadlineDate: "2026-05-30",
    assigneeHint: "Маше",
  };
  await postProcessCreateTaskPayloadAsync(tomorrowPayload, {
    userText: tomorrowText,
    baseDate: BASE_DATE,
  });
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
  await postProcessCreateTaskPayloadAsync(fridayPayload, {
    userText: fridayText,
    baseDate: BASE_DATE,
  });
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
  await postProcessCreateTaskPayloadAsync(absPayload, { userText: absText, baseDate: BASE_DATE });
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

async function runFixAiIntentFlowCheck(): Promise<void> {
  const userText =
    "Создай Маше задачу на первую пятницу следующего месяца сделать отчёт по продажам.";
  let fixed = fixAiIntentBeforeValidation(
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

  const payload = { ...fixed.payload };
  await postProcessCreateTaskPayloadAsync(payload, { userText, baseDate: BASE_DATE });
  applyCreateTaskTitleDescriptionFix(payload);
  fixed = { ...fixed, payload };

  const ok =
    fixed.payload.deadlineDate === "2026-06-05" &&
    fixed.payload.title === "Сделать отчёт по продажам" &&
    fixed.payload.description === undefined;
  devLog(`create_task fixAiIntent flow ${ok ? "OK" : "FAIL"}`, {
    got: fixed.payload,
  });

  const julyPayload: Record<string, unknown> = {
    title: "Сделать отчёт по продажам",
    deadlineDate: "2026-05-29",
    assigneeHint: "Маше",
  };
  await postProcessCreateTaskPayloadAsync(julyPayload, {
    userText: JULY_TEXT,
    baseDate: BASE_DATE,
  });
  devLog(
    `create_task july flow ${julyPayload.deadlineDate === "2026-07-03" ? "OK" : "FAIL"}`,
    { got: julyPayload },
  );
}

/** Dev self-checks для post-processing create_task (BOT_DEV_SELF_CHECKS=true). */
export async function devLogCreateTaskNormalizeChecks(): Promise<void> {
  const prevMock = process.env.BOT_DEV_MOCK_DEADLINE_LLM;
  process.env.BOT_DEV_MOCK_DEADLINE_LLM = "true";

  try {
    runOrdinalDateChecks();
    runNeedsLlmChecks();
    runJulyMockCheck();
    await runNormalizeCases();
    await runRegressionCases();
    await runFixAiIntentFlowCheck();
  } finally {
    if (prevMock === undefined) {
      delete process.env.BOT_DEV_MOCK_DEADLINE_LLM;
    } else {
      process.env.BOT_DEV_MOCK_DEADLINE_LLM = prevMock;
    }
  }
}
