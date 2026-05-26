export type EditVoiceField = "title" | "description" | "assignee" | "deadline" | "project";

export type ParsedEditVoiceCommand = {
  field: EditVoiceField;
  valueText: string;
};

const FIELD_ONLY_HINTS: Record<EditVoiceField, string> = {
  deadline: "дедлайн на пятницу",
  assignee: "исполнитель Ваня",
  description: "описание нужны трубы диаметром 5 и 3",
  title: "название купить рыбу",
  project: "проект Реклама VK",
};

function normalizeInput(text: string): string {
  return text
    .trim()
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, " ");
}

function normalizeValue(raw: string): string {
  return raw
    .trim()
    .replace(/^[:\-\s]+/u, "")
    .replace(/^на\s+/iu, "")
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

function isVoiceMenuSelectionLike(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\d+$/u.test(t)) return true;
  if (/^(?:пункт|номер)\s+\d+$/iu.test(t)) return true;
  if (/^(?:пункт|номер)\s+(?:один|два|три|четыре|пять|шесть|семь|восемь|девять|десять)$/iu.test(t)) return true;
  if (/^(?:перв(?:ый|ого|ому)|втор(?:ой|ого|ому)|трет(?:ий|ьего|ьему)|четверт(?:ый|ого|ому)|пят(?:ый|ого|ому)|шест(?:ой|ого|ому)|седьм(?:ой|ого|ому))\s+пункт$/iu.test(t)) return true;
  if (/^(?:выбери|выбрать)\s+(?:перв(?:ый|ого)|втор(?:ой|ого)|трет(?:ий|ьего)|четверт(?:ый|ого)|пят(?:ый|ого)|шест(?:ой|ого)|седьм(?:ой|ого)|\d+)$/iu.test(t)) return true;
  if (/^(?:один|два|три|четыре|пять|шесть|семь|восемь|девять|десять)$/iu.test(t)) return true;
  return false;
}

const FIELD_ONLY_PATTERNS: Array<{ field: EditVoiceField; patterns: RegExp[] }> = [
  { field: "deadline", patterns: [/^(?:дедлайн|дедлайна|срок|сроком|дата|дату)$/iu] },
  { field: "assignee", patterns: [/^(?:исполнитель|исполнителя|ответственный|ответственного)$/iu] },
  { field: "description", patterns: [/^(?:описание|описания|детали)$/iu] },
  { field: "title", patterns: [/^(?:название|названия|задача|задачу|заголовок)$/iu] },
  { field: "project", patterns: [/^(?:проект|проекта)$/iu] },
];

export function parseEditVoiceFieldOnly(text: string): { field: EditVoiceField; example: string } | null {
  const input = normalizeInput(text);
  if (!input) return null;
  if (isVoiceMenuSelectionLike(input)) return null;

  for (const spec of FIELD_ONLY_PATTERNS) {
    if (spec.patterns.some((pattern) => pattern.test(input))) {
      return { field: spec.field, example: FIELD_ONLY_HINTS[spec.field] };
    }
  }
  return null;
}

export function parseEditVoiceCommand(text: string): ParsedEditVoiceCommand | null {
  const input = normalizeInput(text);
  if (!input) return null;
  if (isVoiceMenuSelectionLike(input)) return null;

  const specs: Array<{ field: EditVoiceField; patterns: RegExp[] }> = [
    {
      field: "description",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени|задай|поставь)\s+(?:нов(?:ое|ый|ая)\s+)?(?:описани(?:е|я)|детали)(?:\s+задачи)?(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)(?:описани(?:е|я)|детали)(?:\s*[:\-]|\s+)(.+)$/iu,
        /(?:^|\s)нов(?:ое|ый|ая)\s+(?:описани(?:е|я)|детали)(?:\s*[:\-]|\s+)(.+)$/iu,
      ],
    },
    {
      field: "title",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени|задай|поставь)\s+(?:нов(?:ое|ый|ая)\s+)?(?:названи(?:е|я)|задач[ауеи]?|заголовок)(?:\s+задачи)?(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)(?:названи(?:е|я)|задач[ауеи]?|заголовок)(?:\s*[:\-]|\s+)(.+)$/iu,
        /(?:^|\s)нов(?:ое|ый|ая)\s+(?:названи(?:е|я)|заголовок)(?:\s*[:\-]|\s+)(.+)$/iu,
      ],
    },
    {
      field: "deadline",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени|задай|поставь)\s+(?:нов(?:ое|ый|ая)\s+)?(?:дедлайн|дедлайна|срок|сроком|дат[ауы]?)(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)(?:дедлайн|дедлайна|срок|сроком|дат[ауы]?)(?:\s+на|\s*[:\-]|\s+)(.+)$/iu,
      ],
    },
    {
      field: "assignee",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени|задай)\s+(?:нов(?:ое|ый|ая)\s+)?(?:исполнител(?:я|ь)|ответственн(?:ого|ый))(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)(?:исполнител(?:я|ь)|ответственн(?:ого|ый))(?:\s+на|\s*[:\-]|\s+)(.+)$/iu,
        /(?:^|\s)(?:назначить|назначь|поставь)\s+на(?:\s*[:\-]|\s+)(.+)$/iu,
      ],
    },
    {
      field: "project",
      patterns: [
        /(?:^|\s)(?:измени|поменяй|смени|задай|поставь)\s+(?:нов(?:ое|ый|ая)\s+)?(?:проект|проекта)(?:\s+на|\s*[:\-])?\s*(.+)$/iu,
        /(?:^|\s)(?:проект|проекта)(?:\s*[:\-]|\s+)(.+)$/iu,
      ],
    },
  ];

  for (const spec of specs) {
    const valueText = pickValue(input, spec.patterns);
    if (valueText) return { field: spec.field, valueText };
  }

  return null;
}
