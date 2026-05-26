export type EditVoiceField = "title" | "description" | "assignee" | "deadline" | "project";

export type ParsedEditVoiceCommand = {
  field: EditVoiceField;
  valueText: string;
};

function normalizeValue(raw: string): string {
  return raw
    .trim()
    .replace(/^[:\-\s]+/u, "")
    .trim();
}

function pickValue(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const raw = match?.[1];
    const value = raw ? normalizeValue(raw) : "";
    if (value) return value;
  }
  return null;
}

export function parseEditVoiceCommand(text: string): ParsedEditVoiceCommand | null {
  const input = text.trim();
  if (!input) return null;

  const specs: Array<{ field: EditVoiceField; patterns: RegExp[] }> = [
    {
      field: "description",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени)\s+описани(?:е|я)(?:\s+задачи)?(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)новое\s+описани(?:е|я)\s*[:\-]?\s*(.+)$/iu,
      ],
    },
    {
      field: "title",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени)\s+названи(?:е|я)(?:\s+задачи)?(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)названи(?:е|я)(?:\s+задачи)?\s*[:\-]?\s*(.+)$/iu,
      ],
    },
    {
      field: "deadline",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени)\s+(?:дедлайн|срок)(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)поставь\s+(?:дедлайн|срок)(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)срок(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
      ],
    },
    {
      field: "assignee",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени)\s+исполнител(?:я|ь)(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)поставь\s+исполнителем(?:\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)назначь\s+на(?:\s*[:\-])?\s*(.+)$/iu,
      ],
    },
    {
      field: "project",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени)\s+проект(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)проект\s*[:\-]?\s*(.+)$/iu,
      ],
    },
  ];

  for (const spec of specs) {
    const valueText = pickValue(input, spec.patterns);
    if (valueText) return { field: spec.field, valueText };
  }

  return null;
}
