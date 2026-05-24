import type { ApiTask, ApiUser } from "./api";
import { devLog } from "./dev-log";
import { findTaskByTitle } from "./hint-matchers";
import { parseTaskTransferLikeQuery } from "./parse-task-transfer-query";
import { parseTaskListQuery } from "./parse-task-list-query";
import {
  removeLeadingUserHintPrepositions,
  resolveUsersByHint,
} from "./resolve-users-by-hint";
import { extractLeadingAssigneeFromCreateTaskMessage } from "./create-task-assignee-extract";
import { parseBudgetReceiptEdit } from "./parse-budget-receipt-edit";
import { parseBasicCreateTask } from "./ai/deterministic/parse-basic-create-task";
import { parseCreateTaskQuery } from "./parse-create-task-query";
import { rawTitleHasNoiseMarkers } from "./ai/deterministic/basic-create-task-text";
import { scoreTaskTitleMatch } from "./task-search-text";

const USER_HINT_TEST_USERS: ApiUser[] = [
  { id: "1", fullName: "Вася Пупкин", role: "EMPLOYEE" },
  { id: "2", fullName: "Иван Иванов", role: "EMPLOYEE" },
  { id: "3", fullName: "Иван Петров", role: "EMPLOYEE" },
];

const TASK_MATCH_FIXTURES: ApiTask[] = [
  {
    id: "t1",
    title: "Поехать в офис к поставщикам",
    deadlineAt: null,
    status: "IN_PROGRESS",
    creatorId: "c1",
    assigneeId: "1",
  },
  {
    id: "t2",
    title: "Подготовить отчет",
    deadlineAt: null,
    status: "NEW",
    creatorId: "c1",
    assigneeId: "1",
  },
];

function devCheckUserHintCleanup(): void {
  const cases: Array<{ raw: string; expected: string }> = [
    { raw: "у васи", expected: "васи" },
    { raw: "для васи", expected: "васи" },
    { raw: "к ивану", expected: "ивану" },
    { raw: "на машу", expected: "машу" },
    { raw: "с пети", expected: "пети" },
  ];

  for (const { raw, expected } of cases) {
    const cleaned = removeLeadingUserHintPrepositions(raw);
    const ok = cleaned.toLowerCase() === expected;
    devLog(`user-hint cleanup ${ok ? "OK" : "FAIL"}`, { raw, expected, got: cleaned });
  }

  const resolveCases: Array<{
    hint: string;
    expected: "one" | "many";
    fullName?: string;
  }> = [
    { hint: "у васи", expected: "one", fullName: "Вася Пупкин" },
    { hint: "для васи", expected: "one", fullName: "Вася Пупкин" },
    { hint: "к ивану", expected: "many" },
  ];

  for (const { hint, expected, fullName } of resolveCases) {
    const result = resolveUsersByHint(USER_HINT_TEST_USERS, hint, null);
    const ok =
      expected === "one"
        ? result.kind === "one" && result.user.fullName === fullName
        : result.kind === "many" && result.users.length >= 2;
    const got =
      result.kind === "none"
        ? "none"
        : result.kind === "one"
          ? result.user.fullName
          : result.users.map((u) => u.fullName).join(", ");
    devLog(`resolve user hint ${ok ? "OK" : "FAIL"}`, { hint, expected, fullName, got });
  }

  const listQuery = parseTaskListQuery("покажи задачи у васи");
  const listOk =
    listQuery?.type === "user" &&
    removeLeadingUserHintPrepositions(listQuery.userHint.toLowerCase()) === "васи";
  devLog(`parseTaskListQuery у васи ${listOk ? "OK" : "FAIL"}`, { listQuery });
}

function devCheckTaskMatching(): void {
  const queries: Array<{ query: string; expectedTitle: string }> = [
    { query: "поехать к поставщикам", expectedTitle: "Поехать в офис к поставщикам" },
    { query: "поехать в офис поставщикам", expectedTitle: "Поехать в офис к поставщикам" },
    { query: "подготовить отчет", expectedTitle: "Подготовить отчет" },
  ];

  for (const { query, expectedTitle } of queries) {
    const score = scoreTaskTitleMatch(expectedTitle, query);
    const match = findTaskByTitle(TASK_MATCH_FIXTURES, query);
    const ok = match.kind === "found" && match.task.title === expectedTitle;
    devLog(`task match ${ok ? "OK" : "FAIL"}`, {
      query,
      expectedTitle,
      score,
      got: match.kind === "found" ? match.task.title : match.kind,
    });
  }
}

function devCheckTransferParser(): void {
  const parsed = parseTaskTransferLikeQuery(
    "перекинь задачу поехать к поставщикам на Ивана",
    { preferReassign: true },
  );
  const ok =
    parsed?.intent === "reassign_task" &&
    parsed.payload.taskTitle.toLowerCase().includes("поехать") &&
    parsed.payload.taskTitle.toLowerCase().includes("поставщик") &&
    parsed.payload.toUserHint.toLowerCase().startsWith("иван");

  devLog(`transfer parser ${ok ? "OK" : "FAIL"}`, { parsed });

  const withFrom = parseTaskTransferLikeQuery(
    "перекинь задачу поехать к поставщикам с Васи на Ивана",
    { preferReassign: true },
  );
  const fromOk =
    withFrom?.intent === "reassign_task" &&
    withFrom.payload.fromUserHint?.toLowerCase().startsWith("вас") &&
    withFrom.payload.toUserHint.toLowerCase().startsWith("иван");
  devLog(`transfer parser from/to ${fromOk ? "OK" : "FAIL"}`, { withFrom });
}

function devCheckBudgetReceiptEdit(): void {
  const trueCases = ["чек да", "нужен чек", "отчетность обязательна", "чек: да"];
  const falseCases = ["чек нет", "без чека", "отчетность не обязательна"];

  for (const t of trueCases) {
    const ok = parseBudgetReceiptEdit(t) === true;
    devLog(`budget receipt edit true ${ok ? "OK" : "FAIL"}`, { input: t, got: parseBudgetReceiptEdit(t) });
  }
  for (const t of falseCases) {
    const ok = parseBudgetReceiptEdit(t) === false;
    devLog(`budget receipt edit false ${ok ? "OK" : "FAIL"}`, { input: t, got: parseBudgetReceiptEdit(t) });
  }
}

function devCheckCreateTaskAssignee(): void {
  const multiStep =
    "создай задачу маше поехать в архив и собрать документацию по подрядчику";
  const basicRejected = parseBasicCreateTask(multiStep) === null;
  devLog(`basic create_task multi-step null ${basicRejected ? "OK" : "FAIL"}`, {
    parsed: parseBasicCreateTask(multiStep),
  });

  const simple = parseCreateTaskQuery("создай задачу Маше проверить архив");
  const simpleOk =
    simple?.payload.assigneeHint?.toLowerCase().startsWith("маш") &&
    simple.payload.title.toLowerCase().includes("архив");
  devLog(`basic create_task simple ${simpleOk ? "OK" : "FAIL"}`, { parsed: simple });

  const noisy = parseBasicCreateTask("создай задачу Маше эээ проверить там архив");
  const noisyOk =
    noisy?.meta.needsCleanup === true && rawTitleHasNoiseMarkers(noisy.payload.rawTitle);
  devLog(`basic create_task noise cleanup flag ${noisyOk ? "OK" : "FAIL"}`, { parsed: noisy });

  const vague = parseBasicCreateTask(
    "короче пусть Вася поедет там посмотрит ну и вот это вот все",
  );
  devLog(`basic create_task vague null ${vague === null ? "OK" : "FAIL"}`, { parsed: vague });

  const leading = extractLeadingAssigneeFromCreateTaskMessage(multiStep);
  devLog(`create_task leading extract ${leading ? "OK" : "FAIL"}`, { leading });
}

export function devLogNaturalLanguageSelfChecks(): void {
  devCheckUserHintCleanup();
  devCheckTaskMatching();
  devCheckTransferParser();
  devCheckBudgetReceiptEdit();
  devCheckCreateTaskAssignee();
}
