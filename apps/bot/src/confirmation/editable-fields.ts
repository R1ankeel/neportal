import type { AiIntent } from "../ai-contracts";

export type EditableField = {
  key: string;
  label: string;
};

const SAVE_FIELD: EditableField = { key: "save", label: "Сохранить без изменений" };
const CANCEL_FIELD: EditableField = { key: "cancel", label: "Отменить" };

function withActions(fields: EditableField[]): EditableField[] {
  return [...fields, SAVE_FIELD, CANCEL_FIELD];
}

export function getEditableFields(intent: AiIntent): EditableField[] {
  switch (intent.intent) {
    case "add_task_comment":
      return withActions([
        { key: "commentText", label: "Текст комментария" },
        { key: "taskTitle", label: "Задачу" },
      ]);

    case "create_note":
      return withActions([{ key: "text", label: "Текст заметки" }]);

    case "create_task":
      return withActions([
        { key: "title", label: "Название задачи" },
        { key: "description", label: "Описание задачи" },
        { key: "assignee", label: "Исполнителя" },
        { key: "deadline", label: "Дедлайн" },
        { key: "project", label: "Проект" },
      ]);

    case "create_absence": {
      const fields: EditableField[] = [
        { key: "user", label: "Сотрудника" },
        { key: "startDate", label: "Дату начала" },
        { key: "endDate", label: "Дату окончания" },
      ];
      if (intent.payload.type === "SICK_LEAVE") {
        fields.push({ key: "documentNumber", label: "Номер больничного" });
      }
      fields.push({ key: "comment", label: "Комментарий" });
      return withActions(fields);
    }

    case "create_expense":
      return withActions([
        { key: "amount", label: "Сумму" },
        { key: "description", label: "Описание" },
        { key: "budget", label: "Бюджет" },
        { key: "project", label: "Проект" },
      ]);

    case "create_budget":
      return withActions([
        { key: "name", label: "Название бюджета" },
        { key: "amount", label: "Сумму" },
        { key: "requiresReceipt", label: "Обязательность чека" },
        { key: "matchingKeywords", label: "Ключевые слова" },
      ]);

    case "transfer_task":
      return withActions([
        { key: "taskTitle", label: "Задачу" },
        { key: "toUser", label: "Нового исполнителя" },
        { key: "comment", label: "Комментарий" },
      ]);

    case "reassign_task": {
      const fields: EditableField[] = [
        { key: "taskTitle", label: "Задачу" },
        { key: "toUser", label: "Нового исполнителя" },
        { key: "comment", label: "Комментарий" },
      ];
      if (intent.payload.fromUserHint?.trim() || intent.payload.fromUserId) {
        fields.splice(1, 0, { key: "fromUser", label: "Старого исполнителя" });
      }
      return withActions(fields);
    }

    case "mention_in_task":
      return withActions([
        { key: "user", label: "Сотрудника" },
        { key: "taskTitle", label: "Задачу" },
        { key: "commentText", label: "Текст комментария" },
      ]);

    case "complete_task":
      return withActions([
        { key: "taskTitle", label: "Задачу" },
        { key: "completionResult", label: "Результат" },
      ]);

    case "cancel_task":
      return withActions([
        { key: "taskTitle", label: "Задачу" },
        { key: "cancellationReason", label: "Причину" },
      ]);

    case "set_task_deadline":
      return withActions([
        { key: "taskTitle", label: "Задачу" },
        { key: "deadline", label: "Дедлайн" },
      ]);

    default:
      return [];
  }
}

export function formatFieldSelectionMessage(fields: EditableField[]): string {
  const lines = ["Что редактируем?", ""];
  for (let i = 0; i < fields.length; i++) {
    lines.push(`${i + 1}. ${fields[i].label}`);
  }
  lines.push("", "Выберите кнопкой ниже или отправьте номер пункта.");
  return lines.join("\n");
}

export function getFieldValuePrompt(fieldKey: string, _intent: AiIntent): string {
  switch (fieldKey) {
    case "text":
      return "Введите новый текст заметки.";
    case "title":
      return "Введите новое название задачи.";
    case "description":
      return "Введите новое описание задачи. Можно написать «пусто», чтобы очистить.";
    case "assignee":
      return "Кому назначить задачу? Напишите имя сотрудника или «мне».";
    case "deadline":
      return "Введите новый дедлайн: например, завтра, пятница, 25.05.2026. Или «без дедлайна».";
    case "commentText":
      return "Введите новый текст комментария.";
    case "taskTitle":
      return "Введите название задачи.";
    case "user":
      return "Укажите сотрудника: имя или «мне».";
    case "toUser":
      return "Кому передать задачу? Напишите имя сотрудника.";
    case "fromUser":
      return "С кого переназначить? Напишите имя сотрудника.";
    case "startDate":
      return "Введите новую дату начала: например, завтра, пятница или 25.05.2026.";
    case "endDate":
      return "Введите новую дату окончания: например, пятница или 29.05.2026.";
    case "documentNumber":
      return "Введите номер больничного.";
    case "comment":
      return "Введите комментарий.";
    case "amount":
      return "Введите новую сумму.";
    case "name":
      return "Введите новое название бюджета.";
    case "requiresReceipt":
      return "Чек обязателен? Напишите да или нет.";
    case "matchingKeywords":
      return "Введите ключевые слова. Можно написать «пусто», чтобы очистить.";
    case "budget":
      return "Укажите название бюджета.";
    case "project":
      return "Укажите название проекта.";
    case "completionResult":
      return "Введите результат выполнения задачи.";
    case "cancellationReason":
      return "Введите причину отмены.";
    default:
      return `Введите новое значение для поля «${fieldKey}»:`;
  }
}

/** Маппинг русских ключей fallback-формата «поле: значение» на field key. */
export function legacyKeyToFieldKey(key: string, intentName: AiIntent["intent"]): string | null {
  const k = key.trim().toLowerCase();

  const common: Record<string, string> = {
    комментарий: "commentText",
    задача: "taskTitle",
    название: "name",
    имя: "name",
    сумма: "amount",
    описание: "description",
    расход: "description",
    бюджет: "budget",
    проект: "project",
    чек: "requiresReceipt",
    сотрудник: "user",
    кого: "user",
    исполнитель: "assignee",
    кому: "toUser",
    "с кого": "fromUser",
    "старый исполнитель": "fromUser",
    от: "fromUser",
    дедлайн: "deadline",
    срок: "deadline",
    "дата окончания": "endDate",
    до: "endDate",
    "дата начала": "startDate",
    с: "startDate",
    номер: "documentNumber",
    результат: "completionResult",
    причина: "cancellationReason",
  };

  if (intentName === "create_task" && (k === "задача" || k === "название")) return "title";
  if (intentName === "create_budget" && (k === "название" || k === "имя")) return "name";
  if (intentName === "add_task_comment" && k === "комментарий") return "commentText";
  if (intentName === "transfer_task" && (k === "исполнитель" || k === "кому")) return "toUser";
  if (intentName === "reassign_task") {
    if (k === "кому" || k === "исполнитель") return "toUser";
    if (k === "с кого" || k === "старый исполнитель" || k === "от") return "fromUser";
  }
  if (intentName === "create_absence" && k === "сотрудник") return "user";
  if (intentName === "mention_in_task" && (k === "сотрудник" || k === "кого")) return "user";
  if (k === "текст") {
    if (intentName === "create_note") return "text";
    if (intentName === "add_task_comment" || intentName === "mention_in_task") return "commentText";
  }

  return common[k] ?? null;
}
