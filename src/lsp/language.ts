import { check } from "../lang/check.js";
import { IonError } from "../lang/errors.js";
import { Interpreter } from "../lang/interpreter.js";
import { parse } from "../lang/parser.js";

/** A problem in a script. `line` is 1-based, as in the terminal. */
export interface Problem {
  line: number;
  message: string;
  hint?: string;
}

/** Everything the editor should underline in this script. Never throws. */
export function problemsIn(text: string): Problem[] {
  try {
    return check(parse(text)).map((d) => ({ line: d.line, message: d.message, hint: d.hint }));
  } catch (e) {
    if (e instanceof IonError) return [{ line: Math.max(1, e.line), message: e.message, hint: e.hint }];
    return [{ line: 1, message: `Ion couldn't check this file: ${e instanceof Error ? e.message : String(e)}` }];
  }
}

/** Words that start a statement or a setting, offered as completions. */
const KEYWORDS = [
  "set", "say", "add", "remove", "if", "otherwise", "repeat", "forever", "for each", "while",
  "stop", "skip", "to", "give back", "try", "on error", "use", "agent", "team", "tool",
  "chat with", "serve", "describe", "ask", "test", "assert", "yes", "no", "nothing",
  "and", "or", "not", "is", "contains", "starts with", "ends with"
];

/** Settings inside an agent or team block. */
const SETTINGS = [
  "model", "role", "instructions", "key", "fallback", "endpoint", "format", "header",
  "can", "remembers", "forgets", "input", "output", "lead", "members"
];

export type CompletionKind = "keyword" | "function" | "variable";

export interface Completion {
  label: string;
  kind: CompletionKind;
  detail?: string;
}

/** Names the script itself defines (functions, tools, agents, teams, variables). Works on half-typed code too. */
export function namesDefinedIn(text: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /^\s*(?:to|tool|agent|team)\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
    /^\s*set\s+([A-Za-z_][A-Za-z0-9_]*)\s+to\b/gm,
    /^\s*for\s+each\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/gm
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) names.add(m[1]);
  return [...names];
}

/** Everything worth offering at the cursor: keywords, settings, built-in functions and the script's own names. */
export function completionsFor(text: string): Completion[] {
  const builtins = new Interpreter({
    io: { say: () => undefined, note: () => undefined, readLine: async () => null, confirm: async () => false }
  }).globals.names();
  const out: Completion[] = [];
  for (const k of KEYWORDS) out.push({ label: k, kind: "keyword" });
  for (const s of SETTINGS) out.push({ label: s, kind: "keyword", detail: "agent or team setting" });
  for (const b of builtins) out.push({ label: b, kind: "function", detail: "built-in" });
  for (const n of namesDefinedIn(text)) out.push({ label: n, kind: "variable", detail: "defined in this file" });
  return out;
}
