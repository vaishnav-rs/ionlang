import * as fs from "node:fs";

/** Parses `KEY=value` lines (.env files and Java-style .properties files alike). */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue; // lines like `sdk.dir=...` (not a valid variable name) are skipped
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/**
 * Loads a file of KEY=value lines into process.env.
 * Variables that are already set win, unless `override` is true.
 * Returns the names that were set (never the values).
 */
export function loadEnvFile(file: string, override = false): string[] {
  const set: string[] = [];
  for (const [k, v] of Object.entries(parseEnv(fs.readFileSync(file, "utf-8")))) {
    if (override || process.env[k] === undefined) {
      process.env[k] = v;
      set.push(k);
    }
  }
  return set;
}
