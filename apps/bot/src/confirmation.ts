const YES_RE = /^(?:да|yes|\+)$/iu;
const NO_RE = /^(?:нет|no|-)$/iu;
const CANCEL_RE = /^(?:отмена|отмени|стоп)$/iu;
const EDIT_RE = /^(?:изменить|исправить|редактировать|поменять)$/iu;

export const CONFIRM_REPLY_PROMPT = "Ответьте: да / нет / изменить";
export const CONFIRM_WAIT_MESSAGE = `Ожидаю подтверждение. ${CONFIRM_REPLY_PROMPT}`;

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
