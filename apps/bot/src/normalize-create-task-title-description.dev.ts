import { devLog } from "./dev-log";
import { normalizeCreateTaskTitleDescription } from "./normalize-create-task-title-description";

type Case = {
  name: string;
  title: string;
  description?: string;
  expectTitle: string;
  expectDescription?: string;
  expectNoDescription?: boolean;
};

const CASES: Case[] = [
  {
    name: "long comma-separated title",
    title:
      "Поехать к узбекским поставщикам, разобраться в беспорядке, проверить качество продукции",
    expectTitle: "Поехать к узбекским поставщикам",
    expectDescription: "Разобраться в беспорядке. Проверить качество продукции.",
  },
  {
    name: "short title unchanged",
    title: "Подготовить презентацию",
    expectTitle: "Подготовить презентацию",
    expectNoDescription: true,
  },
  {
    name: "warehouse with extras",
    title: "Проверить склад, пересчитать остатки и написать что нужно докупить",
    expectTitle: "Проверить склад",
    expectDescription:
      "Пересчитать остатки и написать что нужно докупить.",
  },
  {
    name: "existing description preserved",
    title: "Поехать к поставщикам, лишнее в title",
    description: "Уже заданное описание",
    expectTitle: "Поехать к поставщикам, лишнее в title",
    expectDescription: "Уже заданное описание",
  },
];

export function devLogCreateTaskTitleDescriptionChecks(): void {
  for (const c of CASES) {
    const got = normalizeCreateTaskTitleDescription({
      title: c.title,
      description: c.description,
    });
    const titleOk = got.title === c.expectTitle;
    const descOk = c.expectNoDescription
      ? !got.description?.trim()
      : got.description === c.expectDescription;
    const ok = titleOk && descOk;
    devLog(`create_task title/description ${ok ? "OK" : "FAIL"}: ${c.name}`, {
      expectTitle: c.expectTitle,
      gotTitle: got.title,
      expectDescription: c.expectDescription ?? "(none)",
      gotDescription: got.description,
    });
  }
}
