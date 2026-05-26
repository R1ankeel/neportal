import { sanitizeLogString } from "./log-sanitizer";

export type DownloadTelegramFileInput = {
  filePath: string;
};

export async function downloadTelegramFileBuffer(
  input: DownloadTelegramFileInput,
): Promise<Buffer> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "change_me") {
    throw new Error("telegram_token_not_configured");
  }
  const filePath = input.filePath.trim().replace(/^\/+/, "");
  if (!filePath) {
    throw new Error("telegram_file_path_empty");
  }

  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`telegram_file_download_http_${res.status}`);
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export function safeTelegramFileDownloadError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return sanitizeLogString(text);
}

