import { normalizeStructuredCreateTaskDescription, shouldStructureCreateTaskDescription } from "./create-task-structured-description";
import { devLog } from "../../dev-log";

type Case = {
  name: string;
  originalText: string;
  title: string;
  description?: string;
  expectShould: boolean;
  expectTitle?: string;
  expectDescriptionIncludes?: string[];
  expectDescriptionExcludes?: string[];
};

const LONG_TEXT =
  "Поставь задачу Подготовить отчет для инвесторов, Запросить информацию по маркетингу. " +
  "Запросить информацию по клиентскому сервису. Запросить финансовый результат у бухгалтерии. " +
  "Запросить информацию у продуктового отдела. Запросить информацию у разработчиков. Сверстать в презентацию";

const CASES: Case[] = [
  {
    name: "long command with multiple actions",
    originalText: LONG_TEXT,
    title: "Подготовить отчет для инвесторов",
    description:
      "Запросить информацию по маркетингу. Запросить информацию по клиентскому сервису. Запросить финансовый результат у бухгалтерии. " +
      "Запросить информацию у продуктового отдела. Запросить информацию у разработчиков. Сверстать в презентацию",
    expectShould: true,
    expectTitle: "Подготовить отчет для инвесторов",
    expectDescriptionIncludes: [
      "1. ",
      "2. ",
      "Запросить информацию по маркетингу",
      "Запросить информацию по клиентскому сервису",
      "Запросить финансовый результат у бухгалтерии",
      "Сверстать в презентацию",
    ],
    expectDescriptionExcludes: ["План:", "Подзадачи:", "Чеклист:"],
  },
  {
    name: "already numbered description should stay numbered",
    originalText: "Подготовить отчет: 1. Запросить маркетинг. 2. Запросить бухгалтерию.",
    title: "Подготовить отчет",
    description: "1. Запросить маркетинг.\n2. Запросить бухгалтерию.",
    expectShould: true,
    expectDescriptionIncludes: ["1. Запросить маркетинг", "2. Запросить бухгалтерию"],
  },
  {
    name: "short task should not trigger",
    originalText: "Создай Маше задачу завтра проверить склад",
    title: "Проверить склад",
    description: "",
    expectShould: false,
  },
  {
    name: "voice-like first second third markers",
    originalText:
      "Нужно подготовить отчет для инвесторов. Первое запросить маркетинг. Второе запросить клиентский сервис. " +
      "Третье запросить финансовый результат у бухгалтерии. Потом сверстать презентацию.",
    title: "Подготовить отчет для инвесторов",
    description:
      "Первое запросить маркетинг. Второе запросить клиентский сервис. Третье запросить финансовый результат у бухгалтерии. Потом сверстать презентацию.",
    expectShould: true,
    expectDescriptionIncludes: ["1. ", "2. ", "3. "],
  },
];

async function run(): Promise<void> {
  for (const testCase of CASES) {
    const detected = shouldStructureCreateTaskDescription({
      originalText: testCase.originalText,
      title: testCase.title,
      description: testCase.description,
    });

    const detectOk = detected.should === testCase.expectShould;
    devLog(`structured-description detect ${testCase.name} ${detectOk ? "OK" : "FAIL"}`, {
      expected: testCase.expectShould,
      got: detected.should,
      reason: detected.reason,
    });

    const result = await normalizeStructuredCreateTaskDescription({
      originalText: testCase.originalText,
      title: testCase.title,
      description: testCase.description,
    });

    const titleOk = !testCase.expectTitle || result.title === testCase.expectTitle;
    const includesOk = (testCase.expectDescriptionIncludes ?? []).every((part) =>
      (result.description ?? "").includes(part),
    );
    const excludesOk = (testCase.expectDescriptionExcludes ?? []).every(
      (part) => !(result.description ?? "").includes(part),
    );

    devLog(`structured-description normalize ${testCase.name} ${titleOk && includesOk && excludesOk ? "OK" : "FAIL"}`, {
      source: result.source,
      changed: result.changed,
      title: result.title,
      descriptionChars: (result.description ?? "").length,
    });
  }
}

run().catch((error) => {
  devLog("structured-description dev check failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
