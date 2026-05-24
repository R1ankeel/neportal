import type { ApiBudget, ApiUser } from "./api";
import { resolveCompletionMaxTokens } from "./ai/completion-max-tokens";
import { measureSystemPrompt } from "./ai/build-system-prompt";
import { resolvePromptGroup } from "./ai/prompt-group-router";
import { budgetContextCacheKey, clearBudgetContextCache } from "./budget-context-cache";
import { resolveBudgetForExpense } from "./budget-resolver";
import { devLog } from "./dev-log";
import { applyCreateAbsenceDateFix } from "./fix-ai-intent-absence-dates";
import { pickAliasesForPrompt } from "./intent-context";
import { parseTaskTransferLikeQuery } from "./parse-task-transfer-query";
import { generateSystemAliases, systemAliasesToString } from "@neportal/shared";

function withAliases(fullName: string, id: string): ApiUser {
  return {
    id,
    fullName,
    role: "EMPLOYEE",
    systemAliases: systemAliasesToString(generateSystemAliases(fullName)),
  };
}

const ALIAS_SMOKE_USERS: ApiUser[] = [
  withAliases("Антон Антонов", "anton"),
  withAliases("Мария Иванова", "maria"),
  withAliases("Петр Сидоров", "petr"),
  withAliases("Сабир Махмудов", "sabir"),
];

function devCheckPromptGroupRoutes(): void {
  const cases: Array<{ text: string; expected: ReturnType<typeof resolvePromptGroup> }> = [
    {
      text: "комментарий в квартальном отчете к понедельнику нужен кровь из носа",
      expected: "collaboration",
    },
    { text: "потратил 1500 на рекламу чек потом", expected: "expense" },
    { text: "я заболел до пятницы", expected: "absence" },
    { text: "передай задачу по складу Васе", expected: "collaboration" },
    { text: "покажи задачи Маши", expected: "task-list" },
    { text: "создай бюджет реклама 50000 чек обязателен", expected: "expense" },
    { text: "поставь Маше задачу подготовить презентацию к пятнице", expected: "create-task-rich" },
    { text: "перекинь отчет на Машу, я не успеваю", expected: "collaboration" },
    { text: "привет как дела", expected: "classifier" },
    {
      text: "закрыл задачу по складу, проверил остатки, не хватает бумаги",
      expected: "task-status",
    },
    { text: "добавь мне отпуск с завтра до понедельника", expected: "absence" },
  ];

  for (const { text, expected } of cases) {
    const got = resolvePromptGroup(text);
    const ok = got === expected;
    devLog(`resolvePromptGroup ${ok ? "OK" : "FAIL"}`, { text, expected, got });
  }
}

function devCheckCompletionMaxTokens(): void {
  const cases: Array<{ group: string; expected: number }> = [
    { group: "classifier", expected: 256 },
    { group: "task-list", expected: 256 },
    { group: "expense", expected: 384 },
    { group: "collaboration", expected: 512 },
    { group: "create-task-rich", expected: 768 },
    { group: "task-title-cleanup", expected: 512 },
  ];

  for (const { group, expected } of cases) {
    const got = resolveCompletionMaxTokens(group);
    const ok = got === expected;
    devLog(`completion maxTokens ${ok ? "OK" : "FAIL"}`, { group, expected, got });
  }
}

function findUserByAliasHint(hint: string): ApiUser | undefined {
  const normalizedHint = hint.toLowerCase().replace(/ё/g, "е");
  return ALIAS_SMOKE_USERS.find((user) => {
    const aliases = pickAliasesForPrompt(user, `тест ${hint} тест`);
    return aliases.some((a) => {
      const n = a.toLowerCase().replace(/ё/g, "е");
      return n === normalizedHint || normalizedHint.startsWith(n.slice(0, 3));
    });
  });
}

function devCheckCompactAliases(): void {
  const cases: Array<{ hint: string; expectedName: string }> = [
    { hint: "тохе", expectedName: "Антон Антонов" },
    { hint: "маше", expectedName: "Мария Иванова" },
    { hint: "пети", expectedName: "Петр Сидоров" },
    { hint: "сабирчика", expectedName: "Сабир Махмудов" },
  ];

  for (const { hint, expectedName } of cases) {
    const userText = `поставь ${hint} задачу проверить склад`;
    const matched = ALIAS_SMOKE_USERS.filter((user) => pickAliasesForPrompt(user, userText).length > 0);
    const expanded = matched.find((u) => u.fullName === expectedName);
    const aliases = expanded ? pickAliasesForPrompt(expanded, userText) : [];
    const ok = Boolean(expanded) && aliases.some((a) => a.toLowerCase().includes(hint.slice(0, 3)));
    devLog(`compact aliases ${ok ? "OK" : "FAIL"}`, {
      hint,
      expectedName,
      gotUser: expanded?.fullName,
      aliases,
    });
  }

  const anton = ALIAS_SMOKE_USERS[0];
  const compact = pickAliasesForPrompt(anton);
  const expanded = pickAliasesForPrompt(anton, "поставь Тохе задачу");
  devLog("compact aliases size", {
    compactCount: compact.length,
    expandedCount: expanded.length,
    compactHasToha: compact.some((a) => a.toLowerCase().includes("тох")),
    expandedHasToha: expanded.some((a) => a.toLowerCase().includes("тох")),
  });

  const byHint = findUserByAliasHint("тохе");
  devLog(`alias hint resolve ${byHint?.fullName === "Антон Антонов" ? "OK" : "FAIL"}`, {
    got: byHint?.fullName,
  });
}

function devCheckTransferSabir(): void {
  const intent = parseTaskTransferLikeQuery("передай задачу по складу Сабирчику", {
    users: ALIAS_SMOKE_USERS,
    currentUser: null,
  });
  const ok =
    intent?.intent === "transfer_task" &&
    intent.payload.toUserHint.toLowerCase().includes("сабир") &&
    intent.payload.taskTitle.toLowerCase().includes("склад");
  devLog(`transfer по складу Сабирчику ${ok ? "OK" : "FAIL"}`, {
    intent: intent?.intent,
    taskTitle: intent?.payload.taskTitle,
    toUserHint: intent?.intent === "transfer_task" ? intent.payload.toUserHint : undefined,
  });
}

function devCheckAbsenceDates(): void {
  const baseDate = "2026-05-24";
  const payload: Record<string, unknown> = {
    type: "VACATION",
    startDate: "2026-05-25",
    endDate: "2026-05-29",
  };
  applyCreateAbsenceDateFix(
    payload,
    "добавь мне отпуск с завтра до понедельника",
    baseDate,
  );
  const ok = payload.startDate === "2026-05-25" && payload.endDate === "2026-05-25";
  devLog(`absence period fix ${ok ? "OK" : "FAIL"}`, {
    startDate: payload.startDate,
    endDate: payload.endDate,
  });
}

function devCheckPromptSizes(): void {
  for (const group of [
    "classifier",
    "task-status",
    "collaboration",
    "create-task-rich",
    "absence",
  ] as const) {
    const m = measureSystemPrompt(group);
    devLog("system prompt size", { group, systemChars: m.systemChars, groupChars: m.groupChars });
  }
}

function devCheckBudgetScoring(): void {
  const budgets: ApiBudget[] = [
    {
      id: "b1",
      title: "На подарки",
      initialAmount: 1000,
      spentAmount: 0,
      currency: "RUB",
      status: "ACTIVE",
      requiresReceipt: false,
      project: { id: "p1", name: "Реклама VK" },
    },
    {
      id: "b2",
      title: "Реклама VK",
      initialAmount: 5000,
      spentAmount: 0,
      currency: "RUB",
      status: "ACTIVE",
      requiresReceipt: false,
      project: { id: "p1", name: "Реклама VK" },
    },
  ];
  const result = resolveBudgetForExpense({
    budgets,
    expenseDescription: "рекламу",
    currentUser: { id: "u1", fullName: "Test", role: "EMPLOYEE" },
  });
  const ok = result.kind === "resolved" && result.budget.title === "Реклама VK";
  devLog(`budget scoring рекламу ${ok ? "OK" : "FAIL"}`, {
    kind: result.kind,
    budget: result.kind === "resolved" ? result.budget.title : undefined,
  });
}

function devCheckBudgetCacheKey(): void {
  clearBudgetContextCache();
  const k1 = budgetContextCacheKey();
  const k2 = budgetContextCacheKey("user-1");
  devLog(`budget cache key ${k1 !== k2 ? "OK" : "FAIL"}`, { k1, k2 });
}

export function devLogAiStage2SelfChecks(): void {
  devCheckPromptGroupRoutes();
  devCheckCompletionMaxTokens();
  devCheckCompactAliases();
  devCheckTransferSabir();
  devCheckAbsenceDates();
  devCheckPromptSizes();
  devCheckBudgetScoring();
  devCheckBudgetCacheKey();
}
