/**
 * Запуск Prisma CLI с .env из корня репозитория (работает в cmd.exe и PowerShell).
 * Usage: node scripts/prisma-with-root-env.mjs migrate deploy
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const databaseDir = path.join(repoRoot, "packages", "database");

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return false;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

const envPath = path.join(repoRoot, ".env");
if (!loadEnvFile(envPath)) {
  console.error(`[prisma] .env not found at ${envPath}`);
  console.error("[prisma] Create .env in the repository root (copy from .env.example).");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error("[prisma] DATABASE_URL is missing in .env");
  process.exit(1);
}

const prismaArgs = process.argv.slice(2);
if (prismaArgs.length === 0) {
  console.error("[prisma] Usage: node scripts/prisma-with-root-env.mjs <prisma-args...>");
  console.error("[prisma] Example: node scripts/prisma-with-root-env.mjs migrate deploy");
  process.exit(1);
}

console.log(`[prisma] loaded env from ${envPath}`);

const result = spawnSync("pnpm", ["exec", "prisma", ...prismaArgs], {
  cwd: databaseDir,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
