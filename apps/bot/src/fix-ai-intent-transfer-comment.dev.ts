import { devLog } from "./dev-log";
import { applyTransferTaskCommentFix } from "./fix-ai-intent-transfer-comment";

export function devLogTransferCommentFixChecks(): void {
  const payload: Record<string, unknown> = {
    taskTitle: "подписать договор",
    toUserHint: "Мария Соколова",
  };
  applyTransferTaskCommentFix(
    payload,
    "перекинь отчет на Машу, я не успеваю",
  );
  const ok = payload.comment === "я не успеваю";
  devLog(`transfer comment LLM fix ${ok ? "OK" : "FAIL"}`, { comment: payload.comment });
}
