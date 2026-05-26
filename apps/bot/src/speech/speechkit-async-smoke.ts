import { readFile } from "node:fs/promises";
import { uploadTempObject, deleteObjectBestEffort } from "../storage/yandex-object-storage";
import { recognizeOggOpusAsyncFromObject } from "./speechkit-async-client";

function preview(text: string, max = 120): string {
  return text.slice(0, max);
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: pnpm --filter @neportal/bot exec tsx src/speech/speechkit-async-smoke.ts ./long.ogg");
    process.exit(1);
  }

  const buffer = await readFile(filePath);
  let uploaded: { bucket: string; key: string; objectUri: string } | null = null;

  try {
    uploaded = await uploadTempObject({
      buffer,
      contentType: "audio/ogg",
      extension: "ogg",
      source: "telegram-voice",
    });

    const result = await recognizeOggOpusAsyncFromObject({
      objectUri: uploaded.objectUri,
    });

    console.log("provider:", result.provider);
    console.log("durationMs:", result.durationMs);
    console.log("textLength:", result.text.length);
    console.log("textPreview:", preview(result.text));
  } finally {
    if (uploaded) {
      await deleteObjectBestEffort(uploaded.bucket, uploaded.key);
    }
  }
}

void main();
