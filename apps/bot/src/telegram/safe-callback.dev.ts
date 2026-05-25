import { safeAnswerCallbackQuery } from "./safe-answer-callback";

function logCheck(name: string, ok: boolean, data?: Record<string, unknown>): void {
  console.log(`[safe-callback] ${name} ${ok ? "OK" : "FAIL"}`, data ?? {});
}

function makeCtx(message: string): Parameters<typeof safeAnswerCallbackQuery>[0] {
  return {
    from: { id: 123 },
    callbackQuery: {
      data: "choice:select:123:1:0",
      message: { message_id: 10, chat: { id: 20 } },
    },
    answerCallbackQuery: async () => {
      throw new Error(message);
    },
  } as unknown as Parameters<typeof safeAnswerCallbackQuery>[0];
}

export async function devLogSafeCallbackChecks(): Promise<void> {
  const oldWarn = console.warn;
  console.warn = () => undefined;
  try {
    const oldQuery = await safeAnswerCallbackQuery(
      makeCtx("400: Bad Request: query is too old and response timeout expired or query ID is invalid"),
    );
    logCheck("swallow old query", oldQuery === false);

    const timeout = await safeAnswerCallbackQuery(
      makeCtx("400: Bad Request: response timeout expired"),
    );
    logCheck("swallow timeout", timeout === false);

    const other = await safeAnswerCallbackQuery(makeCtx("network failed"));
    logCheck("swallow other answer errors", other === false);
  } finally {
    console.warn = oldWarn;
  }
}
