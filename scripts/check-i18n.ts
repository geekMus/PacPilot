import fs from "node:fs";
import path from "node:path";
import en_US from "../shared/i18n/en_US";
import zh_CN from "../shared/i18n/zh_CN";

function flattenCatalog(
  catalog: Record<string, unknown>,
  prefix = "",
  result = new Map<string, string>()
): Map<string, string> {
  for (const [key, value] of Object.entries(catalog)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(fullKey, value);
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenCatalog(value as Record<string, unknown>, fullKey, result);
    }
  }
  return result;
}

function assertLocaleParity(): void {
  const chinese = flattenCatalog(zh_CN);
  const english = flattenCatalog(en_US);
  const keys = new Set([...chinese.keys(), ...english.keys()]);
  const placeholders = (text: string) =>
    [...text.matchAll(/\{([^{}]+)\}/g)]
      .map((match) => match[1])
      .sort()
      .join(",");

  for (const key of keys) {
    const zh = chinese.get(key);
    const en = english.get(key);
    if (zh === undefined || en === undefined) {
      throw new Error(`Locale catalog is missing key: ${key}`);
    }
    if (placeholders(zh) !== placeholders(en)) {
      throw new Error(`Locale placeholders differ for key: ${key}`);
    }
  }
}

function assertTranslationReferences(): void {
  const catalogs = [flattenCatalog(zh_CN), flattenCatalog(en_US)];
  const sourceRoot = path.resolve(import.meta.dir, "../client/src");
  const sourceFiles: string[] = [];

  function collectSourceFiles(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) collectSourceFiles(entryPath);
      else if (/\.(?:vue|ts)$/.test(entry.name)) sourceFiles.push(entryPath);
    }
  }

  collectSourceFiles(sourceRoot);
  const missing = new Set<string>();
  const translationCall = /(?:\bt|\$t)\s*\(\s*["']([^"']+)["']/g;
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(translationCall)) {
      const key = match[1];
      if (!catalogs.every((catalog) => catalog.has(key))) {
        missing.add(`${path.relative(sourceRoot, file)}: ${key}`);
      }
    }
  }

  if (missing.size > 0) {
    throw new Error(
      `Client references missing translation keys:\n${[...missing].sort().join("\n")}`
    );
  }
}

assertLocaleParity();
assertTranslationReferences();
console.log("Static translation checks passed.");
