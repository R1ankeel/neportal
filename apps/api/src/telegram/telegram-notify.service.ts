import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class TelegramNotifyService {
  private readonly logger = new Logger(TelegramNotifyService.name);

  async sendMessage(chatId: string, text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token || token === "change_me") {
      this.logger.warn("TELEGRAM_BOT_TOKEN not set, skip sendMessage");
      return;
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
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`sendMessage error: ${msg}`);
    }
  }
}
