import { Injectable, Logger } from "@nestjs/common";

type TelegramSentMessage = { message_id: number; chat: { id: number } };

@Injectable()
export class TelegramNotifyService {
  private readonly logger = new Logger(TelegramNotifyService.name);

  async sendMessage(chatId: string, text: string): Promise<TelegramSentMessage | null> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token || token === "change_me") {
      this.logger.warn("TELEGRAM_BOT_TOKEN not set, skip sendMessage");
      return null;
    }

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.error(`sendMessage failed: HTTP ${res.status} ${body}`);
        return null;
      }
      const json = await res.json() as { ok: boolean; result: TelegramSentMessage };
      return json.result ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`sendMessage error: ${msg}`);
      return null;
    }
  }
}
