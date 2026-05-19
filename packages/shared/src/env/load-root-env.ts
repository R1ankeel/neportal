import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const MAX_PARENT_LEVELS = 8;

/**
 * Loads environment variables from a single root `.env` file.
 *
 * Resolution order:
 * 1. If `NEPORTAL_ENV_PATH` is set and that file exists — load it (absolute or relative path).
 * 2. Otherwise walk up from `startDir` (default `process.cwd()`), at most {@link MAX_PARENT_LEVELS} levels,
 *    and load the first `.env` found.
 *
 * Does not print secret values.
 *
 * @returns Absolute path to the loaded file, or `null` if none was found.
 */
export function loadRootEnv(startDir: string = process.cwd()): string | null {
  const explicit = process.env.NEPORTAL_ENV_PATH?.trim();
  if (explicit) {
    const resolvedExplicit = path.resolve(explicit);
    if (fs.existsSync(resolvedExplicit)) {
      dotenv.config({ path: resolvedExplicit });
      return resolvedExplicit;
    }
  }

  let dir = path.resolve(startDir);
  for (let i = 0; i < MAX_PARENT_LEVELS; i++) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return envPath;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return null;
}
