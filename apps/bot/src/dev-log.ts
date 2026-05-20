/** Dev-логи бота (без токенов). Отключить: BOT_DEV_LOG=0 */
export function devLog(message: string, data?: Record<string, unknown>): void {
  if (process.env.BOT_DEV_LOG === "0") return;
  if (data && Object.keys(data).length > 0) {
    console.log(`[bot] ${message}`, data);
  } else {
    console.log(`[bot] ${message}`);
  }
}

export function devLogApiError(method: string, status: number, body: string): void {
  console.error(`[bot] ${method} failed: status=${status} body=${body}`);
}
