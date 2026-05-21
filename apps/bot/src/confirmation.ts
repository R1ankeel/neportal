const YES_RE = /^(?:да|yes|\+)$/iu;
const NO_RE = /^(?:нет|no|-)$/iu;

export function isConfirmationYes(text: string): boolean {
  return YES_RE.test(text.trim());
}

export function isConfirmationNo(text: string): boolean {
  return NO_RE.test(text.trim());
}
