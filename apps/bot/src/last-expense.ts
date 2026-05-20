export type LastExpenseEntry = {
  expenseId: string;
  budgetTitle: string;
  amount: number;
  createdAt: Date;
  uploadedById: string;
};

const EXPIRY_MS = 30 * 60 * 1000;

const lastExpenseByTelegramUser = new Map<number, LastExpenseEntry>();

export function setLastExpense(telegramUserId: number, entry: LastExpenseEntry): void {
  lastExpenseByTelegramUser.set(telegramUserId, entry);
}

export function getLastExpense(telegramUserId: number): LastExpenseEntry | null {
  const entry = lastExpenseByTelegramUser.get(telegramUserId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt.getTime() > EXPIRY_MS) {
    lastExpenseByTelegramUser.delete(telegramUserId);
    return null;
  }
  return entry;
}
