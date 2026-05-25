let nextChoiceId = 1;

export function createChoiceId(): string {
  return String(nextChoiceId++);
}
