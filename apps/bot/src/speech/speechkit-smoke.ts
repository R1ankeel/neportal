import { readFile } from "node:fs/promises";
import { loadRootEnv } from "@neportal/shared";
import { recognizeOggOpus } from "./speechkit-client";

async function main(): Promise<void> {
  loadRootEnv();
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: pnpm --filter @neportal/bot exec tsx src/speech/speechkit-smoke.ts ./voice.ogg");
    process.exit(1);
  }

  const audioBuffer = await readFile(filePath);
  const result = await recognizeOggOpus({ audioBuffer });
  const preview = result.text.slice(0, 120);
  console.log(`provider=${result.provider}`);
  console.log(`durationMs=${result.durationMs}`);
  console.log(`textLength=${result.text.length}`);
  console.log(`textPreview=${preview}`);
}

void main();

