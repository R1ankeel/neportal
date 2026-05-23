import { normalizeAliasToken } from "./normalize-name";

export type NameAliasesDictionary = Map<string, readonly string[]>;

type DictionaryFormatA = Record<string, string[]>;
type DictionaryFormatB = Array<{ name: string; aliases: string[] }>;

function dedupeNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const n = normalizeAliasToken(raw);
    if (!n || n.length < 2 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Поддерживает объект { "антон": [...] } и массив [{ name, aliases }]. */
export function normalizeNameAliasesDictionary(raw: unknown): NameAliasesDictionary {
  const map = new Map<string, readonly string[]>();

  if (Array.isArray(raw)) {
    for (const entry of raw as DictionaryFormatB) {
      if (!entry || typeof entry.name !== "string" || !Array.isArray(entry.aliases)) continue;
      const key = normalizeAliasToken(entry.name);
      if (!key) continue;
      const aliases = dedupeNormalized([entry.name, ...entry.aliases]);
      if (aliases.length > 0) map.set(key, aliases);
    }
    return map;
  }

  if (raw && typeof raw === "object") {
    for (const [name, aliases] of Object.entries(raw as DictionaryFormatA)) {
      if (!Array.isArray(aliases)) continue;
      const key = normalizeAliasToken(name);
      if (!key) continue;
      const normalized = dedupeNormalized([name, ...aliases]);
      if (normalized.length > 0) map.set(key, normalized);
    }
  }

  return map;
}
