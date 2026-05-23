import type { AbsenceCandidate } from "./pending-absence-selection";
import { formatIsoDateRu } from "./parse-ru-date";

function absenceTypeLabel(type: AbsenceCandidate["type"]): string {
  return type === "SICK_LEAVE" ? "Больничный" : "Отпуск";
}

export function formatAbsenceCandidates(candidates: AbsenceCandidate[]): string {
  const lines = ["Нашёл несколько отсутствий:", ""];

  candidates.forEach((absence, index) => {
    const n = index + 1;
    lines.push(
      `${n}. ${absenceTypeLabel(absence.type)} — ${formatIsoDateRu(absence.startDate)}—${formatIsoDateRu(absence.endDate)}`,
    );
    if (index < candidates.length - 1) lines.push("");
  });

  lines.push("", "Напишите номер.");
  return lines.join("\n");
}
