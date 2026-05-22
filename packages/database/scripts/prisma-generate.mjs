import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const maxAttempts = process.platform === "win32" ? 5 : 2;
const retryDelayMs = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGenerate() {
  return spawnSync("pnpm", ["exec", "prisma", "generate"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = runGenerate();
    if (result.status === 0) {
      if (result.stdout) process.stdout.write(result.stdout);
      process.exit(0);
    }

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (attempt === maxAttempts) {
      console.error(
        `[database] prisma generate failed after ${attempt} attempt(s).`,
      );
      if (process.platform === "win32") {
        console.error(
          "[database] Stop API/bot/Prisma Studio (and other Node processes), then run: pnpm build",
        );
      }
      process.exit(result.status ?? 1);
    }

    console.warn(
      `[database] prisma generate failed (attempt ${attempt}/${maxAttempts}), retrying…`,
    );
    await sleep(retryDelayMs * attempt);
  }
}

main();
