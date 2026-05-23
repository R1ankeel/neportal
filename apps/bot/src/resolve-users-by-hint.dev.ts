import type { ApiUser } from "./api";
import { devLog } from "./dev-log";
import { resolveUsersByHint } from "./resolve-users-by-hint";

const TEST_USERS: ApiUser[] = [
  { id: "1", fullName: "Вася Пупкин", role: "EMPLOYEE" },
  { id: "2", fullName: "Иван Иванов", role: "EMPLOYEE" },
  { id: "3", fullName: "Иван Петров", role: "EMPLOYEE" },
  { id: "4", fullName: "Мария Соколова", role: "EMPLOYEE" },
];

type Expected =
  | { kind: "one"; fullName: string }
  | { kind: "many"; fullNames: string[] };

const RESOLVE_USER_HINT_DEV_CASES: Array<{ hint: string; expected: Expected }> = [
  { hint: "вася", expected: { kind: "one", fullName: "Вася Пупкин" } },
  { hint: "васе", expected: { kind: "one", fullName: "Вася Пупкин" } },
  { hint: "васи", expected: { kind: "one", fullName: "Вася Пупкин" } },
  { hint: "васю", expected: { kind: "one", fullName: "Вася Пупкин" } },
  { hint: "василия", expected: { kind: "one", fullName: "Вася Пупкин" } },
  { hint: "васе пупкину", expected: { kind: "one", fullName: "Вася Пупкин" } },
  {
    hint: "ивану",
    expected: { kind: "many", fullNames: ["Иван Иванов", "Иван Петров"] },
  },
  { hint: "ивану иванову", expected: { kind: "one", fullName: "Иван Иванов" } },
  { hint: "маше", expected: { kind: "one", fullName: "Мария Соколова" } },
  { hint: "марии соколовой", expected: { kind: "one", fullName: "Мария Соколова" } },
];

function matchExpected(result: ReturnType<typeof resolveUsersByHint>, expected: Expected): boolean {
  if (expected.kind === "one") {
    return result.kind === "one" && result.user.fullName === expected.fullName;
  }
  if (result.kind !== "many") return false;
  const got = result.users.map((u) => u.fullName).sort();
  const want = [...expected.fullNames].sort();
  return got.length === want.length && got.every((name, i) => name === want[i]);
}

const AMBIGUOUS_VASYA_CASES: Array<{ hint: string; expected: Expected }> = [
  {
    hint: "васи",
    expected: { kind: "many", fullNames: ["Вася Пупкин", "Василий Иванов"] },
  },
  { hint: "васе пупкину", expected: { kind: "one", fullName: "Вася Пупкин" } },
];

export function devLogResolveUsersByHintChecks(): void {
  for (const { hint, expected } of RESOLVE_USER_HINT_DEV_CASES) {
    const result = resolveUsersByHint(TEST_USERS, hint, null);
    const ok = matchExpected(result, expected);
    const got =
      result.kind === "none"
        ? "none"
        : result.kind === "one"
          ? result.user.fullName
          : result.users.map((u) => u.fullName).join(", ");
    devLog(`resolve-users-by-hint ${ok ? "OK" : "FAIL"}`, { hint, expected, got });
  }

  const ambiguousUsers: ApiUser[] = [
    { id: "1", fullName: "Вася Пупкин", role: "EMPLOYEE" },
    { id: "5", fullName: "Василий Иванов", role: "EMPLOYEE" },
  ];
  for (const { hint, expected } of AMBIGUOUS_VASYA_CASES) {
    const result = resolveUsersByHint(ambiguousUsers, hint, null);
    const ok = matchExpected(result, expected);
    const got =
      result.kind === "none"
        ? "none"
        : result.kind === "one"
          ? result.user.fullName
          : result.users.map((u) => u.fullName).join(", ");
    devLog(`resolve-users-by-hint (ambiguous) ${ok ? "OK" : "FAIL"}`, { hint, expected, got });
  }
}
