const YES_RE = /^(?:да|yes|y|ок|ok|подтвердить|подтверждаю|\+)$/iu;
const NO_RE = /^(?:нет|no|-)$/iu;
const CANCEL_RE = /^(?:отмена|отмени|отменить|cancel|стоп|не\s+добавлять)$/iu;
const EDIT_RE = /^(?:изменить|исправить|редактировать|поменять)$/iu;

export const CONFIRM_REPLY_PROMPT =
  "Выберите действие кнопками ниже или ответьте текстом: да / изменить / отмена";
export const CREATE_EXPENSE_CONFIRM_FOOTER =
  "\n\nВыберите действие кнопками ниже или ответьте текстом: да / изменить / отмена\nнет — выбрать другой бюджет";
export const CONFIRM_WAIT_MESSAGE = `Ожидаю подтверждение. ${CONFIRM_REPLY_PROMPT}`;
export const CREATE_EXPENSE_CONFIRM_WAIT_MESSAGE =
  "Ожидаю подтверждение. Выберите действие кнопками ниже или ответьте текстом: да / изменить / отмена (нет — другой бюджет).";

export function isConfirmationYes(text: string): boolean {
  return YES_RE.test(text.trim());
}

export function isConfirmationNo(text: string): boolean {
  return NO_RE.test(text.trim());
}

export function isConfirmationCancel(text: string): boolean {
  return CANCEL_RE.test(text.trim());
}

export function isConfirmationEdit(text: string): boolean {
  return EDIT_RE.test(text.trim());
}
