import { parse } from "./parser.js";
import { tokenize } from "./lexer.js";

const INDENT = "    ";

/**
 * Rewrites an Ion script in the standard style: 4 spaces per block level, no trailing
 * spaces, and at most one blank line in a row. It only re-indents the first line of each
 * statement and comment lines. Text it can't change safely is left exactly as written:
 * lines that continue a statement inside brackets, and lines inside triple-quoted text.
 *
 * A script with errors is refused, so the formatter never tidies code that is still broken.
 */
export function formatSource(source: string): string {
  const text = source.replace(/\r\n?/g, "\n");
  parse(text); // throws the usual Ion error for a broken script
  const lines = text.split("\n");
  const toks = tokenize(text);

  // Block depth of the statement that starts on each line, and how many brackets are
  // still open just before each token. Brackets inside text are part of the text token,
  // so only real bracket tokens are counted here.
  const depthAt = new Map<number, number>();
  const openBefore: number[] = [];
  let depth = 0;
  let open = 0;
  let atStart = true;
  for (const t of toks) {
    openBefore.push(open);
    if (t.type === "eof") break;
    if (t.type === "indent") { depth++; continue; }
    if (t.type === "dedent") { depth--; continue; }
    if (t.type === "newline") { atStart = true; continue; }
    if (atStart) { depthAt.set(t.line, depth); atStart = false; }
    if (t.type === "op" && "([{".includes(t.value)) open++;
    if (t.type === "op" && ")]}".includes(t.value)) open--;
  }

  const n = lines.length;
  // Depth of the next statement at or after each line, for indenting comment lines.
  const nextDepth = new Array<number>(n + 2).fill(0);
  for (let i = n; i >= 1; i--) nextDepth[i] = depthAt.get(i) ?? nextDepth[i + 1];
  // Bracket depth at the start of each line, so comments inside a multi-line list stay put.
  const openAtLine = new Array<number>(n + 2).fill(0);
  let k = 0;
  for (let i = 1; i <= n; i++) {
    while (k < toks.length && toks[k].line <= i) k++;
    openAtLine[i] = k < toks.length ? openBefore[k] : 0;
  }

  const out: { text: string; protectedLine: boolean }[] = [];
  let inTriple = false;
  for (let i = 1; i <= n; i++) {
    const raw = lines[i - 1];
    const wasInTriple = inTriple;
    const quotes = raw.split('"""').length - 1;
    if (quotes % 2 === 1) inTriple = !inTriple;
    const trimmed = raw.trim();

    if (wasInTriple) {
      // Inside triple-quoted text: every character is content, so keep the line as it is.
      out.push({ text: raw, protectedLine: true });
    } else if (depthAt.has(i)) {
      const body = quotes % 2 === 1 ? raw.trimStart() : trimmed;
      out.push({ text: INDENT.repeat(depthAt.get(i)!) + body, protectedLine: false });
    } else if (trimmed === "") {
      out.push({ text: "", protectedLine: false });
    } else if (trimmed.startsWith("#") && openAtLine[i] === 0) {
      out.push({ text: INDENT.repeat(nextDepth[i]) + trimmed, protectedLine: false });
    } else {
      out.push({ text: raw.replace(/\s+$/, ""), protectedLine: false });
    }
  }

  // Collapse runs of blank lines, drop leading and trailing ones.
  const result: string[] = [];
  for (const line of out) {
    const blank = line.text === "" && !line.protectedLine;
    if (blank && (result.length === 0 || result[result.length - 1] === "")) continue;
    result.push(line.text);
  }
  while (result.length > 0 && result[result.length - 1] === "") result.pop();
  return result.length === 0 ? "" : result.join("\n") + "\n";
}
