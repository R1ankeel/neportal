import type { UserCandidate } from "./pending-user-selection";

export function formatUserCandidates(candidates: UserCandidate[]): string {
  const lines = ["Кого вы имели в виду?", ""];

  candidates.forEach((user, index) => {
    const n = index + 1;
    const username = user.telegramUsername
      ? ` · @${user.telegramUsername.replace(/^@+/, "")}`
      : "";
    lines.push(`${n}. ${user.fullName} · ${user.role}${username}`);
  });

  lines.push("", "Напишите номер сотрудника.");
  return lines.join("\n");
}

export function userNotFoundMessage(hint: string): string {
  return `Не нашёл сотрудника «${hint}». Проверьте имя.`;
}
