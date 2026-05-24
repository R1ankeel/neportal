import { devLog } from "./dev-log";
import { validateAddTaskCommentPayload } from "./validate-add-task-comment-payload";

type Case = {
  name: string;
  userText: string;
  payload: { taskQuery?: string; taskTitle?: string; comment?: string };
  expectComment?: string;
  expectNeedsComment?: boolean;
  expectNeedsTask?: boolean;
};

const CASES: Case[] = [
  {
    name: "A: recovery after task hint in prepositional form",
    userText: "комментарий в квартальном отчете к понедельнику нужен кровь из носа",
    payload: {
      taskQuery: "квартальный отчет",
      comment: "комментарий в квартальном отчете к понедельнику нужен кровь из носа",
    },
    expectComment: "к понедельнику нужен кровь из носа",
  },
  {
    name: "B: explicit «, что» split",
    userText:
      "напиши комментарий к задаче по квартальному отчету, что к понедельнику нужен кровь из носа",
    payload: {
      taskQuery: "квартальный отчет",
      comment:
        "напиши комментарий к задаче по квартальному отчету, что к понедельнику нужен кровь из носа",
    },
    expectComment: "к понедельнику нужен кровь из носа",
  },
  {
    name: "C: short comment after task",
    userText: "комментарий к квартальному отчету жду сегодня",
    payload: { taskQuery: "квартальный отчет", comment: "комментарий к квартальному отчету жду сегодня" },
    expectComment: "жду сегодня",
  },
  {
    name: "D: «что» separator with склад",
    userText: "добавь комментарий в задачу по складу что нужна проверка от Васи",
    payload: {
      taskQuery: "склад",
      comment: "добавь комментарий в задачу по складу что нужна проверка от Васи",
    },
    expectComment: "нужна проверка от Васи",
  },
  {
    name: "E: bad LLM comment equals full user text",
    userText: "комментарий в квартальном отчете к понедельнику нужен кровь из носа",
    payload: {
      taskQuery: "квартальный отчет",
      comment: "комментарий в квартальном отчете к понедельнику нужен кровь из носа",
    },
    expectComment: "к понедельнику нужен кровь из носа",
  },
  {
    name: "F: empty comment",
    userText: "комментарий к квартальному отчету",
    payload: { taskQuery: "квартальный отчет" },
    expectNeedsComment: true,
  },
  {
    name: "G: empty task",
    userText: "к понедельнику нужен кровь из носа",
    payload: { comment: "к понедельнику нужен кровь из носа" },
    expectComment: "к понедельнику нужен кровь из носа",
    expectNeedsTask: true,
  },
  {
    name: "I: edit-flow value must not be trimmed by recovery",
    userText: "",
    payload: { taskTitle: "Подготовить квартальный отчет", comment: "понедельнику нужен кровь из носа" },
    expectComment: "понедельнику нужен кровь из носа",
  },
];

export function devLogValidateAddTaskCommentChecks(): void {
  for (const c of CASES) {
    const result = validateAddTaskCommentPayload({
      payload: c.payload,
      userText: c.userText,
    });
    const comment = result.payload.comment;
    let ok = true;
    if (c.expectComment !== undefined && comment !== c.expectComment) ok = false;
    if (c.expectNeedsComment && !result.needsComment) ok = false;
    if (c.expectNeedsTask && !result.needsTaskQuery) ok = false;
    devLog(`add_task_comment validate ${ok ? "OK" : "FAIL"}: ${c.name}`, {
      expectComment: c.expectComment,
      gotComment: comment,
      needsComment: result.needsComment,
      needsTask: result.needsTaskQuery,
    });
  }
}
