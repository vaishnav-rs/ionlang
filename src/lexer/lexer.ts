import { Token, TokenType } from "./tokens.js";

export class LexError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Lex error at line ${line}: ${message}`);
    this.line = line;
  }
}

const isWordChar = (c: string) => /[a-zA-Z0-9_\-./:]/.test(c);
const isSpace = (c: string) => c === " " || c === "\t" || c === "\r";

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;
  let atLineStart = true;
  let lastMeaningful: TokenType | null = null;

  const push = (type: TokenType, value: string) => {
    if (type === "NEWLINE") {
      if (lastMeaningful === null || lastMeaningful === "NEWLINE") return;
    }
    tokens.push({ type, value, line });
    lastMeaningful = type;
  };

  while (i < n) {
    const c = source[i];

    if (c === "\n") {
      push("NEWLINE", "\n");
      line++;
      i++;
      atLineStart = true;
      continue;
    }

    if (isSpace(c)) {
      i++;
      continue;
    }

    if (c === "#") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    if (c === "{") {
      push("LBRACE", "{");
      i++;
      atLineStart = false;
      continue;
    }

    if (c === "}") {
      push("RBRACE", "}");
      i++;
      atLineStart = false;
      continue;
    }

    if (c === ",") {
      push("COMMA", ",");
      i++;
      atLineStart = false;
      continue;
    }

    if (c === "=" && source[i + 1] === "=") {
      push("EQEQ", "==");
      i += 2;
      atLineStart = false;
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      const startLine = line;
      let j = i + 1;
      let value = "";
      while (j < n && source[j] !== quote) {
        if (source[j] === "\n") {
          throw new LexError("unterminated string literal", startLine);
        }
        value += source[j];
        j++;
      }
      if (j >= n) {
        throw new LexError("unterminated string literal", startLine);
      }
      push("STRING", value);
      i = j + 1;
      atLineStart = false;
      continue;
    }

    if (isWordChar(c)) {
      let j = i;
      let value = "";
      while (j < n && isWordChar(source[j])) {
        value += source[j];
        j++;
      }
      if (value.startsWith("env:")) {
        push("ENV_REF", value.slice(4));
      } else if (isModelRef(value)) {
        push("MODEL_REF", value);
      } else {
        push("IDENT", value);
      }
      i = j;
      atLineStart = false;
      continue;
    }

    throw new LexError(`unexpected character '${c}'`, line);
  }

  push("NEWLINE", "\n");
  tokens.push({ type: "EOF", value: "", line });
  return tokens;
}

function isModelRef(value: string): boolean {
  const slashCount = (value.match(/\//g) || []).length;
  return slashCount === 1 && !value.startsWith("/") && !value.endsWith("/");
}
