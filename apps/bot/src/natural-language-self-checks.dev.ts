import type { ApiTask, ApiUser } from "./api";
import { devLog } from "./dev-log";
import { findTaskByTitle } from "./hint-matchers";
import { parseTaskTransferLikeQuery } from "./parse-task-transfer-query";
import { parseCompletedTaskListQuery } from "./parse-completed-task-list-query";
import { parseTaskCommentsListQuery } from "./parse-task-comments-list-query";
import { parseTaskListQuery } from "./parse-task-list-query";
import {
  removeLeadingUserHintPrepositions,
  resolveUsersByHint,
} from "./resolve-users-by-hint";
import { extractLeadingAssigneeFromCreateTaskMessage } from "./create-task-assignee-extract";
import { parseBudgetReceiptEdit } from "./parse-budget-receipt-edit";
import { parseBasicCreateTask } from "./ai/deterministic/parse-basic-create-task";
import { parseTaskReassignQuery } from "./ai/deterministic/parse-task-reassign-query";
import { generateSystemAliases, systemAliasesToString } from "@neportal/shared";
import { parseCreateTaskQuery } from "./parse-create-task-query";
import { rawTitleHasNoiseMarkers } from "./ai/deterministic/basic-create-task-text";
import { SELF_HINT_MARKER } from "./resolve-users-by-hint";
import { scoreTaskTitleMatch } from "./task-search-text";
import {
  cleanupFillerWords,
  containsSelfAssigneeMarker,
  ensureIntentMarkerPreserved,
} from "./speech/voice-text-cleanup";
import { parseEditVoiceCommand } from "./confirmation/parse-edit-voice-command";

function withAliases(fullName: string, id: string): ApiUser {
  return {
    id,
    fullName,
    role: "EMPLOYEE",
    systemAliases: systemAliasesToString(generateSystemAliases(fullName)),
  };
}

const USER_HINT_TEST_USERS: ApiUser[] = [
  withAliases("Вася Пупкин", "1"),
  withAliases("Иван Иванов", "2"),
  withAliases("Иван Петров", "3"),
  withAliases("Мария Соколова", "4"),
  withAliases("Сабир Махмудов", "5"),
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
  {
    id: "t3",
    title: "Подготовить квартальный отчет",
    deadlineAt: null,
    status: "IN_PROGRESS",
    creatorId: "c1",
    assigneeId: "2",
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

  const commentsQuery = parseTaskCommentsListQuery("покажи комментарии по задаче склад");
  const commentsOk =
    commentsQuery?.taskHint.toLowerCase().replace(/ё/g, "е") === "склад";
  devLog(`parseTaskCommentsListQuery склад ${commentsOk ? "OK" : "FAIL"}`, { commentsQuery });

  const myCompleted = parseCompletedTaskListQuery("мои выполненные задачи");
  devLog(`parseCompletedTaskListQuery my ${myCompleted?.type === "my" ? "OK" : "FAIL"}`, {
    myCompleted,
  });

  const userCompleted = parseCompletedTaskListQuery("покажи выполненные задачи васи");
  const userCompletedOk =
    userCompleted?.type === "user" &&
    removeLeadingUserHintPrepositions(userCompleted.userHint.toLowerCase()) === "васи";
  devLog(`parseCompletedTaskListQuery васи ${userCompletedOk ? "OK" : "FAIL"}`, { userCompleted });

  const activeNotCompleted = parseTaskListQuery("покажи выполненные задачи васи");
  devLog(
    `parseTaskListQuery не ловит выполненные ${activeNotCompleted === null ? "OK" : "FAIL"}`,
    { activeNotCompleted },
  );
}

function devCheckTaskMatching(): void {
  const queries: Array<{ query: string; expectedTitle: string }> = [
    { query: "по квартальному отчету", expectedTitle: "Подготовить квартальный отчет" },
    { query: "квартальный отчет", expectedTitle: "Подготовить квартальный отчет" },
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

function devCheckReassignParser(): void {
  const selfCases = [
    "передай мне задачу по квартальному отчету",
    "переведи на меня квартальный отчет",
  ];
  for (const text of selfCases) {
    const parsed = parseTaskReassignQuery(text, "OWNER", {
      users: USER_HINT_TEST_USERS,
      currentUser: null,
    });
    const ok =
      parsed?.intent === "reassign_task" &&
      parsed.payload.toUserHint === SELF_HINT_MARKER &&
      parsed.payload.taskTitle.toLowerCase().includes("квартальн");
    devLog(`reassign parser self ${ok ? "OK" : "FAIL"}`, { text, parsed });
  }

  const toOther = parseTaskReassignQuery("перекинь задачу купить бумагу на Машу", "OWNER", {
    users: USER_HINT_TEST_USERS,
    currentUser: null,
  });
  const toOtherOk =
    toOther?.intent === "reassign_task" &&
    toOther.payload.taskTitle.toLowerCase().includes("бумаг") &&
    toOther.payload.toUserHint.toLowerCase().startsWith("маш");
  devLog(`reassign parser to user ${toOtherOk ? "OK" : "FAIL"}`, { parsed: toOther });
}

function devCheckTransferParser(): void {
  const ambiguousIvan = parseTaskTransferLikeQuery(
    "перекинь задачу поехать к поставщикам на Ивана",
    {
      preferReassign: true,
      users: USER_HINT_TEST_USERS,
      currentUser: null,
    },
  );
  devLog(`transfer parser ambiguous null ${ambiguousIvan === null ? "OK" : "FAIL"}`, {
    parsed: ambiguousIvan,
  });

  const withFrom = parseTaskTransferLikeQuery(
    "перекинь задачу поехать к поставщикам с Васи на Ивана",
    {
      preferReassign: true,
      users: USER_HINT_TEST_USERS,
      currentUser: null,
    },
  );
  devLog(`transfer parser from/to ambiguous null ${withFrom === null ? "OK" : "FAIL"}`, {
    parsed: withFrom,
  });
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

  const withDeadlinePrep = parseBasicCreateTask(
    "Создай задачу для ромыча на сегодня продать стулья Остапу",
  );
  const titleNorm = withDeadlinePrep?.payload.title.toLowerCase().replace(/ё/g, "е") ?? "";
  const deadlineOk = Boolean(withDeadlinePrep?.payload.deadlineDate);
  const noLeadingNa = !titleNorm.startsWith("на ");
  const titleOk = titleNorm.includes("продать") && titleNorm.includes("остап");
  devLog(
    `basic create_task deadline prep stripped ${deadlineOk && noLeadingNa && titleOk ? "OK" : "FAIL"}`,
    {
      title: withDeadlinePrep?.payload.title,
      deadlineDate: withDeadlinePrep?.payload.deadlineDate,
      assigneeHint: withDeadlinePrep?.payload.assigneeHint,
    },
  );

  const naTodayNotAssignee =
    parseBasicCreateTask("создай задачу на сегодня проверить склад") === null;
  devLog(`basic create_task на сегодня not assignee ${naTodayNotAssignee ? "OK" : "FAIL"}`);
}

function devCheckVoiceCleanupIntentPreservation(): void {
  const cases: Array<{
    input: string;
    mustContainOneOf?: string[];
    mustContainAll?: string[];
    mustNotContain?: string[];
  }> = [
    {
      input: "ну короче нужно записать заметку типа короче нужно купить рыбу завтра на корпоратив",
      mustContainOneOf: ["заметк"],
      mustContainAll: ["купить рыбу завтра на корпоратив"],
      mustNotContain: ["короче", "типа"],
    },
    {
      input: "ну короче создай задачу Маше купить рыбу",
      mustContainOneOf: ["создай", "задач"],
      mustNotContain: ["короче"],
    },
    {
      input: "типа потратил тысячу пятьсот на рекламу",
      mustContainOneOf: ["потратил", "расход"],
      mustNotContain: ["типа"],
    },
    {
      input: "напиши комментарий к задаче купить трубы короче нужны трубы диаметром 5 и 3",
      mustContainAll: ["комментар", "нужны трубы диаметром 5 и 3"],
      mustNotContain: ["короче"],
    },
    {
      input: "ну короче закрой задачу по квартальному отчёту, я всё сделал, всё отправил",
      mustContainAll: ["закрой задачу", "я всё сделал", "всё отправил"],
      mustNotContain: ["короче"],
    },
    {
      input: "короче отмени задачу по складу, потому что больше не актуально",
      mustContainAll: ["отмени задачу", "потому что больше не актуально"],
      mustNotContain: ["короче"],
    },
  ];

  for (const testCase of cases) {
    const cleaned = cleanupFillerWords(testCase.input);
    const safe = ensureIntentMarkerPreserved(testCase.input, cleaned);
    const normalized = safe.toLowerCase();
    const oneOfOk = !testCase.mustContainOneOf
      || testCase.mustContainOneOf.some((fragment) => normalized.includes(fragment));
    const allOk = !testCase.mustContainAll
      || testCase.mustContainAll.every((fragment) => normalized.includes(fragment));
    const notContainOk = !testCase.mustNotContain
      || testCase.mustNotContain.every((fragment) => !normalized.includes(fragment));
    const ok = oneOfOk && allOk && notContainOk;
    devLog(`voice cleanup intent ${ok ? "OK" : "FAIL"}`, {
      input: testCase.input,
      cleaned,
      safe,
      mustContainOneOf: testCase.mustContainOneOf,
      mustContainAll: testCase.mustContainAll,
      mustNotContain: testCase.mustNotContain,
    });
  }
}

function devCheckVoiceCleanupSelfAssigneePreservation(): void {
  const markerCases = [
    "Создай мне задачу проверить поставщика",
    "Поставь на меня задачу проверить склад",
    "Добавь себе задачу купить рыбу",
  ];

  for (const input of markerCases) {
    const cleaned = cleanupFillerWords(input);
    const hasMarker = containsSelfAssigneeMarker(cleaned);
    devLog(`voice cleanup self-marker keep ${hasMarker ? "OK" : "FAIL"}`, {
      input,
      cleaned,
      hasMarker,
    });
  }

  const original = "Создаем мне задачу проверить поставщика на надежность";
  const badCleaned = "Создай задачу проверить поставщика на надежность";
  const originalHas = containsSelfAssigneeMarker(original);
  const cleanedHas = containsSelfAssigneeMarker(badCleaned);
  const fallbackExpected = originalHas && !cleanedHas;
  devLog(`voice cleanup self-marker fallback ${fallbackExpected ? "OK" : "FAIL"}`, {
    originalHasSelfMarker: originalHas,
    cleanedHasSelfMarker: cleanedHas,
    originalChars: original.length,
    cleanedChars: badCleaned.length,
  });

  const explicitAssignee = "Создай задачу Маше проверить склад";
  const explicitHasSelfMarker = containsSelfAssigneeMarker(explicitAssignee);
  devLog(`voice cleanup self-marker explicit assignee unaffected ${!explicitHasSelfMarker ? "OK" : "FAIL"}`, {
    explicitAssignee,
    explicitHasSelfMarker,
  });
}

function devCheckEditVoiceParser(): void {
  const shouldParse: Array<{ input: string; field: string; valuePart: string }> = [
    {
      input: "добавь описание: проверить склад на соответствие ГОСТ",
      field: "description",
      valuePart: "проверить склад на соответствие гост",
    },
    {
      input: "добавь описание проверить склад на соответствие ГОСТ",
      field: "description",
      valuePart: "проверить склад на соответствие гост",
    },
    {
      input: "добавь в описание проверить склад на соответствие ГОСТ",
      field: "description",
      valuePart: "проверить склад на соответствие гост",
    },
    {
      input: "допиши описание проверить склад на соответствие ГОСТ",
      field: "description",
      valuePart: "проверить склад на соответствие гост",
    },
    {
      input: "описание проверить склад на соответствие ГОСТ",
      field: "description",
      valuePart: "проверить склад на соответствие гост",
    },
    { input: "дедлайн на пятницу", field: "deadline", valuePart: "пятницу" },
    { input: "дедлайн пятница", field: "deadline", valuePart: "пятница" },
    { input: "срок завтра", field: "deadline", valuePart: "завтра" },
    { input: "исполнитель Ваня", field: "assignee", valuePart: "ваня" },
    { input: "исполнителя Машу", field: "assignee", valuePart: "машу" },
    { input: "описание нужны трубы диаметром 5 и 3", field: "description", valuePart: "трубы диаметром 5 и 3" },
    { input: "название купить рыбу", field: "title", valuePart: "купить рыбу" },
    { input: "проект Реклама VK", field: "project", valuePart: "реклама vk" },
  ];

  for (const testCase of shouldParse) {
    const parsed = parseEditVoiceCommand(testCase.input);
    const ok =
      !!parsed
      && parsed.field === testCase.field
      && parsed.valueText.toLowerCase().includes(testCase.valuePart);
    devLog(`edit voice parser parse ${ok ? "OK" : "FAIL"}`, {
      input: testCase.input,
      parsed,
      expectedField: testCase.field,
      expectedValuePart: testCase.valuePart,
    });
  }

  const shouldNotParse = ["четыре", "пункт четыре", "первый пункт"];
  for (const input of shouldNotParse) {
    const parsed = parseEditVoiceCommand(input);
    const ok = parsed === null;
    devLog(`edit voice parser no-menu-voice ${ok ? "OK" : "FAIL"}`, { input, parsed });
  }
}

export function devLogNaturalLanguageSelfChecks(): void {
  devCheckUserHintCleanup();
  devCheckTaskMatching();
  devCheckReassignParser();
  devCheckTransferParser();
  devCheckBudgetReceiptEdit();
  devCheckCreateTaskAssignee();
  devCheckVoiceCleanupIntentPreservation();
  devCheckVoiceCleanupSelfAssigneePreservation();
  devCheckEditVoiceParser();
}
