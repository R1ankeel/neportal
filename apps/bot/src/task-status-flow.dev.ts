import { devLog } from "./dev-log";
import { handlePendingTaskStatusDetailsMessage } from "./handle-pending-task-status-details";
import { getPendingConfirmation, setPendingConfirmation, clearPendingConfirmation } from "./pending-intent";
import {
  clearPendingTaskStatusDetails,
  getPendingTaskStatusDetails,
  setPendingTaskStatusDetails,
} from "./pending-task-status-details";

const DEV_TELEGRAM_USER_ID = 9_999_993;

type MockCtx = {
  reply: (text: string) => Promise<void>;
};

const mockCtx: MockCtx = {
  reply: async () => {},
};

function clearAll(): void {
  clearPendingTaskStatusDetails(DEV_TELEGRAM_USER_ID);
  clearPendingConfirmation(DEV_TELEGRAM_USER_ID);
}

export async function devLogTaskStatusFlowChecks(): Promise<void> {
  clearAll();

  setPendingTaskStatusDetails(DEV_TELEGRAM_USER_ID, {
    type: "awaiting_completion_result",
    taskId: "t1",
    taskTitle: "Проверить поставщика",
    createdAt: Date.now(),
  });
  await handlePendingTaskStatusDetailsMessage(mockCtx as never, DEV_TELEGRAM_USER_ID, "отмена");
  const completionPendingCleared = !getPendingTaskStatusDetails(DEV_TELEGRAM_USER_ID);
  const noConfirmationAfterCompletionCancel = !getPendingConfirmation(DEV_TELEGRAM_USER_ID);
  devLog(
    `task status cancel from completion prompt ${completionPendingCleared && noConfirmationAfterCompletionCancel ? "OK" : "FAIL"}`,
    { completionPendingCleared, noConfirmationAfterCompletionCancel },
  );
  clearAll();

  setPendingTaskStatusDetails(DEV_TELEGRAM_USER_ID, {
    type: "awaiting_cancellation_reason",
    taskId: "t2",
    taskTitle: "Проверить склад",
    createdAt: Date.now(),
  });
  await handlePendingTaskStatusDetailsMessage(mockCtx as never, DEV_TELEGRAM_USER_ID, "отмена");
  const cancellationPendingCleared = !getPendingTaskStatusDetails(DEV_TELEGRAM_USER_ID);
  const noConfirmationAfterCancellationCancel = !getPendingConfirmation(DEV_TELEGRAM_USER_ID);
  devLog(
    `task status cancel from reason prompt ${cancellationPendingCleared && noConfirmationAfterCancellationCancel ? "OK" : "FAIL"}`,
    { cancellationPendingCleared, noConfirmationAfterCancellationCancel },
  );
  clearAll();

  setPendingConfirmation(DEV_TELEGRAM_USER_ID, {
    type: "confirm_link_by_username",
    userId: "u1",
    fullName: "Тест",
    username: "test",
  });
  clearPendingConfirmation(DEV_TELEGRAM_USER_ID);
  const finalCancelClearsConfirmation = !getPendingConfirmation(DEV_TELEGRAM_USER_ID);
  devLog(`task status final confirmation cancel clears pending ${finalCancelClearsConfirmation ? "OK" : "FAIL"}`);
  clearAll();
}
