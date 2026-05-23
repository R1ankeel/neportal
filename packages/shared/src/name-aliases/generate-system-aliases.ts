import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeniedAlias } from "./alias-denylist";
import {
  normalizeNameAliasesDictionary,
  type NameAliasesDictionary,
} from "./normalize-dictionary";
import { normalizeAliasToken, splitUserName } from "./normalize-name";
import {
  simpleRussianLastNameForms,
  simpleRussianNameForms,
} from "./simple-russian-forms";

const MAX_ALIAS_LENGTH = 60;
const MIN_ALIAS_LENGTH = 2;
const MAX_COMBINATIONS = 28;

let cachedDictionary: NameAliasesDictionary | null = null;

function dictionaryPath(): string {
  return join(__dirname, "name_aliases.json");
}

export function loadNameAliasesDictionary(): NameAliasesDictionary {
  if (cachedDictionary) return cachedDictionary;
  const raw = JSON.parse(readFileSync(dictionaryPath(), "utf-8")) as unknown;
  cachedDictionary = normalizeNameAliasesDictionary(raw);
  return cachedDictionary;
}

/** Сброс кэша (для тестов). */
export function resetNameAliasesDictionaryCache(): void {
  cachedDictionary = null;
}

function cleanAliases(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of values) {
    const alias = normalizeAliasToken(raw);
    if (alias.length < MIN_ALIAS_LENGTH || alias.length > MAX_ALIAS_LENGTH) continue;
    if (isDeniedAlias(alias)) continue;
    if (seen.has(alias)) continue;
    seen.add(alias);
    out.push(alias);
  }

  return out;
}

function findNameFormsInDictionary(
  first: string,
  dict: NameAliasesDictionary,
): string[] | undefined {
  if (!first) return undefined;

  const direct = dict.get(first);
  if (direct) return [...direct];

  for (const aliases of dict.values()) {
    if (aliases.includes(first)) return [...aliases];
  }

  return undefined;
}

export function generateSystemAliases(fullName: string): string[] {
  const { firstName, lastName } = splitUserName(fullName);
  const first = normalizeAliasToken(firstName);
  const last = normalizeAliasToken(lastName);

  const collected = new Set<string>();
  const dict = loadNameAliasesDictionary();

  let nameForms: string[] = [];
  const dictEntry = findNameFormsInDictionary(first, dict);
  if (dictEntry) {
    nameForms = dictEntry;
  } else if (first) {
    nameForms = simpleRussianNameForms(first);
  }

  for (const form of nameForms) collected.add(form);

  let lastNameForms: string[] = [];
  if (last) {
    lastNameForms = simpleRussianLastNameForms(last);
    for (const form of lastNameForms) collected.add(form);
  }

  const combinations: string[] = [];
  if (first && last) {
    combinations.push(`${first} ${last}`, `${last} ${first}`);

    const topNames = nameForms.slice(0, 8);
    const topLasts = lastNameForms.slice(0, 4);

    for (const nf of topNames) {
      combinations.push(`${nf} ${last}`);
      for (const lf of topLasts) {
        if (combinations.length >= MAX_COMBINATIONS) break;
        combinations.push(`${nf} ${lf}`);
      }
      if (combinations.length >= MAX_COMBINATIONS) break;
    }
  }

  for (const combo of combinations.slice(0, MAX_COMBINATIONS)) {
    collected.add(combo);
  }

  return cleanAliases(collected);
}

export function systemAliasesToString(aliases: string[]): string {
  return aliases.join(", ");
}

export function parseSystemAliasesString(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return cleanAliases(value.split(",").map((part) => part.trim()).filter(Boolean));
}

/** Короткий список aliases для YandexGPT (5–8 штук). */
export function pickPromptAliases(
  systemAliases: string | null | undefined,
  max = 8,
): string[] {
  const parsed = parseSystemAliasesString(systemAliases);
  return parsed.slice(0, max);
}
