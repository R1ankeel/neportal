function extractHttpBody(raw: string): string | null {
  const m = raw.match(/→ \d{3} ([\s\S]+)$/);
  return m ? m[1].trim() : null;
}

/** Человекочитаемые сообщения из ответов API (Nest ConflictException и др.). */
export function formatApiErrorMessage(raw: string): string {
  const legacy = raw.match(
    /telegramUsername already used by user "([^"]+)"/i,
  );
  if (legacy) {
    return `Этот username уже указан у сотрудника ${legacy[1]}`;
  }

  const body = extractHttpBody(raw);
  if (body) {
    try {
      const parsed = JSON.parse(body) as { message?: string | string[] };
      const msg = parsed.message;
      if (typeof msg === "string") {
        return formatApiErrorMessage(msg);
      }
      if (Array.isArray(msg) && msg[0]) {
        return formatApiErrorMessage(msg[0]);
      }
    } catch {
      if (body.includes("Этот username уже указан у сотрудника")) {
        return body;
      }
      return body;
    }
  }

  if (raw.includes("Этот username уже указан у сотрудника")) {
    return raw;
  }

  return raw;
}
