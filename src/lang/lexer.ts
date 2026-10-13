import { IonError } from "./errors.js";
import { StrPart, Tok } from "./tokens.js";

const OPS2 = new Set(["==", "!=", "<=", ">="]);
const OPS1 = new Set(["(", ")", "[", "]", "{", "}", ",", ":", ".", "+", "-", "*", "/", "%", "<", ">", "="]);

const isLetter = (c: string | undefined) => !!c && /[A-Za-z_]/.test(c);
const isDigit = (c: string | undefined) => !!c && c >= "0" && c <= "9";
const isWordChar = (c: string | undefined) => isLetter(c) || isDigit(c);

export function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const indents = [0];
  const n = src.length;
  let i = 0;
  let line = 1;
  let depth = 0; // ( [ { nesting: newlines/indentation are ignored inside
  let atLineStart = true;

  const push = (type: Tok["type"], value: string, extra: Partial<Tok> = {}) =>
    toks.push({ type, value, line, ...extra });
  const last = () => toks[toks.length - 1];

  while (i < n) {
    if (atLineStart && depth === 0) {
      let col = 0;
      let j = i;
      while (j < n && (src[j] === " " || src[j] === "\t")) {
        col += src[j] === "\t" ? 4 : 1;
        j++;
      }
      if (j >= n) break;
      if (src[j] === "\n" || src[j] === "\r" || src[j] === "#") {
        while (j < n && src[j] !== "\n") j++;
        i = j + 1;
        line++;
        continue;
      }
      i = j;
      const top = indents[indents.length - 1];
      if (col > top) {
        indents.push(col);
        push("indent", "");
      } else if (col < top) {
        while (col < indents[indents.length - 1]) {
          indents.pop();
          push("dedent", "");
        }
        if (col !== indents[indents.length - 1]) {
          throw new IonError(
            "This line is indented differently from the lines above it.",
            line,
            "Use the same number of spaces for every line in a block."
          );
        }
      }
      atLineStart = false;
    }

    const c = src[i];

    if (c === "\n") {
      if (depth === 0) {
        if (last() && last().type !== "newline") push("newline", "\n");
        atLineStart = true;
      }
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }

    if (c === '"' || c === "'") {
      const triple = src.startsWith(c.repeat(3), i);
      const startLine = line;
      const open = triple ? 3 : 1;
      const { raw, end } = readRawString(src, i + open, c, triple, startLine);
      const text = triple ? dedentBlock(raw) : raw;
      push("string", "", { parts: processString(text, startLine), line: startLine });
      for (const ch of raw) if (ch === "\n") line++;
      i = end + open;
      continue;
    }

    if (isDigit(c)) {
      let j = i;
      while (isDigit(src[j])) j++;
      if (src[j] === "." && isDigit(src[j + 1])) {
        j++;
        while (isDigit(src[j])) j++;
      }
      push("number", src.slice(i, j));
      i = j;
      continue;
    }

    if (isLetter(c)) {
      let j = i;
      while (isWordChar(src[j])) j++;
      push("word", src.slice(i, j));
      i = j;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (OPS2.has(two)) {
      push("op", two);
      i += 2;
      continue;
    }
    if (OPS1.has(c)) {
      if (c === "(" || c === "[" || c === "{") depth++;
      if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
      push("op", c);
      i++;
      continue;
    }

    throw new IonError(`I don't understand the character '${c}'.`, line);
  }

  if (last() && last().type !== "newline") push("newline", "\n");
  while (indents.length > 1) {
    indents.pop();
    push("dedent", "");
  }
  push("eof", "");
  return toks;
}

/** Reads up to the closing quote. A `{` only opens an interpolation when it is
 *  directly followed by a letter, so JSON like {"a": 1} stays literal text. */
function readRawString(
  src: string,
  start: number,
  quote: string,
  triple: boolean,
  line: number
): { raw: string; end: number } {
  let j = start;
  let depth = 0;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") {
      j += 2;
      continue;
    }
    if (triple ? depth === 0 && src.startsWith(quote.repeat(3), j) : depth === 0 && ch === quote) {
      return { raw: src.slice(start, j), end: j };
    }
    if (!triple && ch === "\n") break;
    if (ch === "{" && (depth > 0 || isLetter(src[j + 1]))) depth++;
    else if (ch === "}" && depth > 0) depth--;
    else if ((ch === '"' || ch === "'") && depth > 0) {
      j++;
      while (j < src.length && src[j] !== ch) j++;
    }
    j++;
  }
  throw new IonError(
    "This piece of text is never closed.",
    line,
    `Add a closing ${triple ? quote.repeat(3) : quote} at the end.`
  );
}

function dedentBlock(raw: string): string {
  let text = raw.replace(/^[ \t]*\r?\n/, "");
  const lines = text.split(/\r?\n/);
  const indent = Math.min(
    ...lines.filter((l) => l.trim() !== "").map((l) => l.match(/^[ \t]*/)![0].length),
    Infinity
  );
  if (Number.isFinite(indent) && indent > 0) text = lines.map((l) => l.slice(indent)).join("\n");
  return text.replace(/\s+$/, "");
}

function processString(raw: string, line: number): StrPart[] {
  const parts: StrPart[] = [];
  let buf = "";
  let curLine = line;
  const flush = () => {
    if (buf) parts.push(buf);
    buf = "";
  };
  for (let j = 0; j < raw.length; j++) {
    const ch = raw[j];
    if (ch === "\n") curLine++;
    if (ch === "\\") {
      const nx = raw[j + 1];
      j++;
      if (nx === "n") buf += "\n";
      else if (nx === "t") buf += "\t";
      else if (nx === undefined) buf += "\\";
      // these escapes drop the backslash; any other keeps it, so patterns like "\s+" just work
      else if (nx === '"' || nx === "'" || nx === "\\" || nx === "{" || nx === "}") buf += nx;
      else buf += "\\" + nx;
      continue;
    }
    if (ch === "{" && isLetter(raw[j + 1])) {
      let depth = 1;
      let k = j + 1;
      while (k < raw.length && depth > 0) {
        const d = raw[k];
        if (d === "{") depth++;
        else if (d === "}") depth--;
        else if (d === '"' || d === "'") {
          k++;
          while (k < raw.length && raw[k] !== d) k++;
        }
        if (depth > 0) k++;
      }
      if (depth > 0) throw new IonError("A '{' in this text is never closed.", curLine, "Write \\{ for a literal brace.");
      flush();
      parts.push({ expr: raw.slice(j + 1, k).trim(), line: curLine });
      j = k;
      continue;
    }
    buf += ch;
  }
  flush();
  return parts;
}
