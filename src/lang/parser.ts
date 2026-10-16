import { Ability, BinOp, Expr, Secret, Stmt } from "./ast.js";
import { IonError, didYouMean } from "./errors.js";
import { tokenize } from "./lexer.js";
import { Tok } from "./tokens.js";

/** Words that can never be used as a variable name. */
export const RESERVED = new Set([
  "set", "say", "add", "remove", "if", "otherwise", "else", "repeat", "for", "while",
  "stop", "skip", "to", "give", "try", "use", "agent", "team", "tool", "chat", "serve",
  "describe", "ask", "user", "and", "or", "not", "is", "in", "true", "false", "yes",
  "no", "nothing", "contains"
]);

const OPERATOR_WORDS = new Set([
  "is", "and", "or", "contains", "plus", "minus", "times", "divided", "mod", "starts", "ends", "does"
]);

const STATEMENT_WORDS = [
  "set", "say", "add", "remove", "if", "otherwise", "repeat", "for", "while", "stop",
  "skip", "to", "give", "try", "use", "agent", "team", "tool", "chat", "serve", "describe", "ask",
  "test", "assert"
];

const ABILITY_HELP =
  "Abilities you can give an agent:\n" +
  '    can access files in "folder"\n' +
  "    can browse the web\n" +
  "    can run commands\n" +
  '    can read gmail with token from env "GMAIL_TOKEN"\n' +
  "    can use tool_name, other_tool, or an MCP server's name\n" +
  "    can search knowledge_base.vct\n" +
  "    can ask other_agent, some_team";

export function parse(source: string): Stmt[] {
  return new Parser(tokenize(source)).parseProgram();
}

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}

  // ---- token helpers -------------------------------------------------
  private peek(o = 0): Tok {
    return this.toks[Math.min(this.p + o, this.toks.length - 1)];
  }
  private next(): Tok {
    const t = this.peek();
    if (this.p < this.toks.length - 1) this.p++;
    return t;
  }
  private atWord(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.type === "word" && t.value === v;
  }
  private atOp(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.type === "op" && t.value === v;
  }
  private acceptWord(v: string): boolean {
    if (this.atWord(v)) {
      this.next();
      return true;
    }
    return false;
  }
  private acceptOp(v: string): boolean {
    if (this.atOp(v)) {
      this.next();
      return true;
    }
    return false;
  }
  private describe(t: Tok): string {
    if (t.type === "newline") return "the end of the line";
    if (t.type === "eof") return "the end of the file";
    if (t.type === "indent") return "extra indentation";
    if (t.type === "dedent") return "the end of the block";
    if (t.type === "string") return "some text";
    return `'${t.value}'`;
  }
  private fail(msg: string, hint?: string, t: Tok = this.peek()): never {
    throw new IonError(msg, t.line, hint);
  }
  private expectWord(v: string, hint?: string): Tok {
    if (!this.atWord(v)) this.fail(`I expected '${v}' here but found ${this.describe(this.peek())}.`, hint);
    return this.next();
  }
  private expectOp(v: string, hint?: string): Tok {
    if (!this.atOp(v)) this.fail(`I expected '${v}' here but found ${this.describe(this.peek())}.`, hint);
    return this.next();
  }
  private expectName(what: string): string {
    const t = this.peek();
    if (t.type !== "word") this.fail(`I expected ${what} here but found ${this.describe(t)}.`);
    if (RESERVED.has(t.value)) this.fail(`'${t.value}' is a keyword, so it can't be used as ${what}.`, "Pick a different name.");
    return this.next().value;
  }
  private endOfLine(): void {
    const t = this.peek();
    if (t.type === "newline") {
      this.next();
      return;
    }
    if (t.type === "eof" || t.type === "dedent") return;
    this.fail(`I didn't expect ${this.describe(t)} here.`, "Each statement goes on its own line.");
  }
  private skipNewlines(): void {
    while (this.peek().type === "newline") this.next();
  }
  private stringLiteral(what: string): string {
    const t = this.peek();
    if (t.type !== "string" || t.parts!.some((x) => typeof x !== "string")) {
      this.fail(`I expected ${what} in quotes here.`);
    }
    this.next();
    return t.parts!.join("");
  }

  // ---- program & blocks ---------------------------------------------
  parseProgram(): Stmt[] {
    const out: Stmt[] = [];
    this.skipNewlines();
    while (this.peek().type !== "eof") {
      if (this.peek().type === "indent") this.fail("This line is indented but nothing above it asks for a block.");
      out.push(this.parseStatement());
      this.skipNewlines();
    }
    return out;
  }

  private parseBlock(after: string): Stmt[] {
    this.expectOp(":", `Put a ':' at the end of the ${after} line, then indent the lines that belong to it.`);
    if (this.peek().type !== "newline") this.fail(`Put the lines for this ${after} on the next lines, indented.`);
    this.skipNewlines();
    if (this.peek().type !== "indent") this.fail(`I expected an indented block after this ${after}.`, "Indent the next line by 4 spaces.");
    this.next();
    const body: Stmt[] = [];
    this.skipNewlines();
    while (this.peek().type !== "dedent" && this.peek().type !== "eof") {
      body.push(this.parseStatement());
      this.skipNewlines();
    }
    if (this.peek().type === "dedent") this.next();
    return body;
  }

  // ---- statements ----------------------------------------------------
  private parseStatement(): Stmt {
    const t = this.peek();
    if (t.type === "word") {
      switch (t.value) {
        case "set": return this.parseSet();
        case "say": {
          this.next();
          const e = this.parseExpr();
          this.endOfLine();
          return { k: "say", e, line: t.line };
        }
        case "add": {
          this.next();
          const value = this.parseExpr();
          this.expectWord("to", "Like this: add item to my_list");
          const list = this.parsePostfix();
          this.endOfLine();
          return { k: "add", value, list, line: t.line };
        }
        case "remove": {
          this.next();
          const value = this.parseExpr();
          this.expectWord("from", "Like this: remove item from my_list");
          const from = this.parsePostfix();
          this.endOfLine();
          return { k: "remove", value, from, line: t.line };
        }
        case "if": return this.parseIf();
        case "repeat": return this.parseRepeat();
        case "for": {
          this.next();
          this.expectWord("each", "Like this: for each item in my_list:");
          const name = this.expectName("a name for each item");
          this.expectWord("in", "Like this: for each item in my_list:");
          const iter = this.parseExpr();
          return { k: "foreach", name, iter, body: this.parseBlock("'for each'"), line: t.line };
        }
        case "while": {
          this.next();
          const cond = this.parseExpr();
          return { k: "while", cond, body: this.parseBlock("'while'"), line: t.line };
        }
        case "stop":
        case "skip": {
          this.next();
          this.endOfLine();
          return { k: t.value, line: t.line } as Stmt;
        }
        case "to": return this.parseFunction();
        case "give": {
          this.next();
          this.expectWord("back", "Like this: give back result");
          const value = this.peek().type === "newline" ? undefined : this.parseExpr();
          this.endOfLine();
          return { k: "give", value, line: t.line };
        }
        case "try": return this.parseTry();
        case "use": {
          this.next();
          const path = this.stringLiteral("a file name");
          this.endOfLine();
          return { k: "use", path, line: t.line };
        }
        case "agent": return this.parseAgent();
        case "team": return this.parseTeam();
        case "tool": return this.parseTool();
        case "chat": {
          this.next();
          this.acceptWord("with");
          const target = this.expectName("an agent or team name");
          this.endOfLine();
          return { k: "chat", target, line: t.line };
        }
        case "serve": {
          this.next();
          const target = this.expectName("an agent or team name");
          let port: Expr | undefined;
          if (this.acceptWord("on")) {
            this.acceptWord("port");
            port = this.parseAdditive();
          }
          this.endOfLine();
          return { k: "serve", target, port, line: t.line };
        }
        case "describe": {
          this.next();
          const text = this.stringLiteral("a description");
          this.endOfLine();
          return { k: "describe", text, line: t.line };
        }
        // 'mcp' and 'rag' are keywords only in their own forms ("mcp name:", "rag name from ..."),
        // so they stay ordinary names elsewhere.
        case "mcp":
          if (this.peek(1).type === "word" && this.atOp(":", 2)) return this.parseMcp();
          break;
        case "rag":
          if (this.peek(1).type === "word" && (this.atWord("from", 2) || this.atOp(".", 2))) return this.parseRag();
          break;
        // 'test' and 'assert' are only keywords where they start a statement, so a
        // variable can still be called test or assert elsewhere.
        case "test":
          if (this.peek(1).type === "string") {
            this.next();
            const name = this.stringLiteral("a test name");
            return { k: "test", name, body: this.parseBlock("'test'"), line: t.line };
          }
          break;
        case "assert":
          if (this.startsValue(this.peek(1))) {
            this.next();
            const e = this.parseExpr();
            this.endOfLine();
            return { k: "assert", e, line: t.line };
          }
          break;
        case "otherwise":
        case "else":
          this.fail(`'${t.value}' has no 'if' above it.`, "'otherwise' must come right after an 'if' block.");
      }
      if (!RESERVED.has(t.value) && !this.looksLikeExpression()) {
        const guess = didYouMean(t.value, STATEMENT_WORDS);
        this.fail(`I don't know how to start a line with '${t.value}'.`, guess ?? "Lines start with words like: set, say, if, for each, agent, ask.");
      }
    }
    const e = this.parseExpr();
    this.endOfLine();
    return { k: "expr", e, line: t.line };
  }

  /** A name that may contain dots, such as file1.vct. Each part must be a word. */
  private expectDottedName(what: string): string {
    let name = this.expectName(what);
    while (this.atOp(".") && this.peek(1).type === "word") {
      this.next();
      name += "." + this.next().value;
    }
    return name;
  }

  /** mcp notes:
   *      command "npx -y some-server"
   *  An MCP server is a program that offers tools. Agents reach it with `can use notes`. */
  private parseMcp(): Stmt {
    const t = this.next();
    const name = this.expectName("a name for the MCP server");
    this.expectOp(":", "Put a ':' after the server name, then indent its settings.");
    this.skipNewlines();
    if (this.peek().type !== "indent") {
      this.fail("An MCP server needs a command or a url, indented under its name.", 'For example:\n    command "npx -y some-server"\nor:\n    url "https://example.com/mcp"');
    }
    this.next();
    let command: Expr | undefined;
    let url: Expr | undefined;
    let key: Secret | undefined;
    this.skipNewlines();
    while (this.peek().type !== "dedent" && this.peek().type !== "eof") {
      const w = this.next();
      if (w.type === "word" && w.value === "command") {
        this.acceptWord("is");
        command = this.parseAdditive();
      } else if (w.type === "word" && w.value === "url") {
        this.acceptWord("is");
        url = this.parseAdditive();
      } else if (w.type === "word" && (w.value === "key" || w.value === "apikey")) {
        this.acceptWord("is");
        key = this.parseSecret();
      } else {
        this.fail(`I don't know the MCP setting ${this.describe(w)}.`, 'The settings are: command "...", or url "...", and key from env "NAME" for a server that needs a token.', w);
      }
      this.endOfLine();
      this.skipNewlines();
    }
    if (this.peek().type === "dedent") this.next();
    if (!command && !url) this.fail(`MCP server '${name}' needs a command or a url.`, 'Add: command "npx -y some-server"  or  url "https://example.com/mcp"', t);
    if (command && url) this.fail(`MCP server '${name}' has both a command and a url.`, "Keep the one you need.", t);
    return { k: "mcp", name, command, url, key, line: t.line };
  }

  /** rag file1.vct from "file1.pdf"
   *  Builds (or reuses) the searchable index file1.vct from the source, and agents with
   *  `can search file1.vct` can look things up in it. */
  private parseRag(): Stmt {
    const t = this.next();
    const name = this.expectDottedName("a name for the knowledge base");
    this.expectWord("from", 'Like this: rag file1.vct from "file1.pdf"');
    const source = this.parseAdditive();
    this.endOfLine();

    // optional settings, indented under the line:
    //   rag handbook.vct from "handbook.pdf"
    //       embedding model "gemini/gemini-embedding-001"
    let embeddingModel: Expr | undefined;
    if (this.peek().type === "indent") {
      this.next();
      this.skipNewlines();
      while (this.peek().type !== "dedent" && this.peek().type !== "eof") {
        const w = this.next();
        if (w.type === "word" && w.value === "embedding") {
          this.expectWord("model", 'Like this: embedding model "gemini/gemini-embedding-001"');
          this.acceptWord("is");
          embeddingModel = this.parseAdditive();
        } else {
          this.fail(`I don't know the knowledge base setting ${this.describe(w)}.`, 'The setting is: embedding model "provider/model"', w);
        }
        this.endOfLine();
        this.skipNewlines();
      }
      if (this.peek().type === "dedent") this.next();
    }
    return { k: "rag", name, source, embeddingModel, line: t.line };
  }

  /** True when a token could begin a value, such as `assert ok` or `assert (x)`. */
  private startsValue(t: Tok): boolean {
    if (t.type === "string" || t.type === "number") return true;
    if (t.type === "word") return !OPERATOR_WORDS.has(t.value) && t.value !== "to";
    return t.type === "op" && ["(", "[", "{", "-"].includes(t.value);
  }

  /** A line starting with a plain name is fine as an expression (`greet("x")`, `total * 2`).
   *  It is only a probable typo of a command when a word, number or text follows it (`sy 5`). */
  private looksLikeExpression(): boolean {
    const n = this.peek(1);
    if (n.type === "string" || n.type === "number") return false;
    if (n.type === "word") return OPERATOR_WORDS.has(n.value);
    return true;
  }

  private parseSet(): Stmt {
    const t = this.next();
    const target = this.parsePostfix();
    if (target.k !== "var" && target.k !== "index" && target.k !== "prop") {
      this.fail("I can only 'set' a name, a list item, or a field.", "Like this: set total to 5", this.toks[this.p - 1]);
    }
    if (this.atOp("=")) this.fail("Ion uses 'to' instead of '='.", `Write: set ${describeTarget(target)} to ...`);
    this.expectWord("to", `Like this: set ${describeTarget(target)} to 5`);
    const value = this.parseExpr();
    this.endOfLine();
    return { k: "set", target, value, line: t.line };
  }

  private parseIf(): Stmt {
    const t = this.next();
    const branches: { cond: Expr; body: Stmt[] }[] = [];
    const cond = this.parseExpr();
    branches.push({ cond, body: this.parseBlock("'if'") });
    let otherwise: Stmt[] | undefined;
    for (;;) {
      this.skipNewlines();
      if (this.atWord("otherwise") || this.atWord("else")) {
        this.next();
        if (this.acceptWord("if")) {
          const c = this.parseExpr();
          branches.push({ cond: c, body: this.parseBlock("'otherwise if'") });
          continue;
        }
        otherwise = this.parseBlock("'otherwise'");
      }
      break;
    }
    return { k: "if", branches, otherwise, line: t.line };
  }

  private parseRepeat(): Stmt {
    const t = this.next();
    if (this.acceptWord("forever")) return { k: "forever", body: this.parseBlock("'repeat forever'"), line: t.line };
    const count = this.parseExpr();
    this.expectWord("times", "Like this: repeat 3 times:");
    return { k: "repeat", count, body: this.parseBlock("'repeat'"), line: t.line };
  }

  private parseParams(): string[] {
    const params: string[] = [];
    this.expectOp("(", "Put the inputs in brackets, like: to greet(name):");
    if (!this.atOp(")")) {
      do params.push(this.expectName("an input name")); while (this.acceptOp(","));
    }
    this.expectOp(")");
    return params;
  }

  private takeDoc(body: Stmt[]): string | undefined {
    if (body[0]?.k === "describe") return (body.shift() as { text: string }).text;
    return undefined;
  }

  private parseFunction(): Stmt {
    const t = this.next();
    const name = this.expectName("a function name");
    const params = this.parseParams();
    const body = this.parseBlock("function");
    return { k: "fn", name, params, body, doc: this.takeDoc(body), line: t.line };
  }

  private parseTool(): Stmt {
    const t = this.next();
    const name = this.expectName("a tool name");
    const params = this.parseParams();
    const body = this.parseBlock("tool");
    return { k: "tool", name, params, body, doc: this.takeDoc(body), line: t.line };
  }

  private parseTry(): Stmt {
    const t = this.next();
    const body = this.parseBlock("'try'");
    this.skipNewlines();
    this.expectWord("on", "A 'try' block needs a handler. Add: on error:");
    this.expectWord("error", "A 'try' block needs a handler. Add: on error:");
    let errName = "error";
    if (this.acceptWord("as")) errName = this.expectName("a name for the error");
    const handler = this.parseBlock("'on error'");
    return { k: "try", body, errName, handler, line: t.line };
  }

  // ---- agents, teams -------------------------------------------------
  private parseSecret(): Secret {
    // key from env "NAME"   |   key "literal"   |   token from env "NAME"
    if (this.acceptWord("from")) {
      this.expectWord("env", 'Like this: from env "MY_KEY"');
      return { env: this.parseAdditive() };
    }
    return { literal: this.parseAdditive() };
  }

  private parseAgent(): Stmt {
    const t = this.next();
    const name = this.expectName("an agent name");
    this.expectOp(":", "Put a ':' after the agent name, then indent its settings.");
    if (this.peek().type !== "newline") this.fail("Put the agent's settings on the next lines, indented.");
    this.skipNewlines();
    if (this.peek().type !== "indent") this.fail("An agent needs settings, indented under its name.", 'For example:\n    model "gemini/gemini-2.5-flash"');
    this.next();
    const node: Extract<Stmt, { k: "agent" }> = {
      k: "agent", name, abilities: [], fallbacks: [], memory: true, input: [], output: [], line: t.line
    };
    this.skipNewlines();
    while (this.peek().type !== "dedent" && this.peek().type !== "eof") {
      const w = this.peek();
      if (w.type !== "word") this.fail(`I didn't expect ${this.describe(w)} in an agent.`);
      this.next();
      switch (w.value) {
        case "model":
          this.acceptWord("is");
          node.model = this.parseAdditive();
          break;
        case "role":
        case "instructions":
          this.acceptWord("is");
          this.acceptOp(":");
          node.role = this.parseAdditive();
          break;
        case "key":
        case "apikey":
          this.acceptWord("is");
          node.key = this.parseSecret();
          break;
        case "fallback":
          this.acceptWord("model");
          node.fallbacks.push(this.parseAdditive());
          break;
        case "endpoint":
          this.acceptWord("is");
          node.endpoint = this.parseAdditive();
          break;
        case "format": {
          this.acceptWord("is");
          const f = this.peek();
          if (f.type !== "word" || !["openai", "anthropic", "raw"].includes(f.value)) {
            this.fail("I expected openai, anthropic or raw here.", "Like this: format openai");
          }
          node.format = this.next().value as "openai" | "anthropic" | "raw";
          break;
        }
        case "auth":
          this.expectWord("header", 'Like this: auth header "X-Api-Key"');
          this.acceptWord("is");
          node.authHeader = this.parseAdditive();
          break;
        case "header":
          this.acceptWord("is");
          node.authHeader = this.parseAdditive();
          break;
        case "can":
          node.abilities.push(this.parseAbility(w.line));
          break;
        case "remembers":
        case "forgets":
          node.memory = w.value === "remembers";
          while (this.peek().type !== "newline" && this.peek().type !== "eof") this.next();
          break;
        case "input":
        case "output": {
          const list: string[] = [];
          do {
            const m = this.peek();
            if (m.type !== "word" || (m.value !== "text" && m.value !== "voice")) this.fail("I expected 'text' or 'voice' here.", "Like this: input text, voice");
            list.push(this.next().value);
          } while (this.acceptOp(","));
          node[w.value] = list;
          break;
        }
        default: {
          const guess = didYouMean(w.value, ["model", "role", "instructions", "key", "apikey", "fallback", "endpoint", "format", "header", "can", "remembers", "forgets", "input", "output"]);
          this.fail(`I don't know the agent setting '${w.value}'.`, guess ?? "Agent settings: model, role, key, can, remembers/forgets, input, output (custom providers also: endpoint, format, header).", w);
        }
      }
      this.endOfLine();
      this.skipNewlines();
    }
    if (this.peek().type === "dedent") this.next();
    return node;
  }

  private parseAbility(line: number): Ability {
    const w = this.peek();
    if (w.type !== "word") this.fail("I expected an ability after 'can'.", ABILITY_HELP);
    this.next();
    const skipFiller = () => {
      while (this.atWord("the") || this.atWord("a") || this.atWord("an")) this.next();
    };
    switch (w.value) {
      case "access": {
        this.expectWord("files", ABILITY_HELP);
        this.expectWord("in", 'Name the folder, like: can access files in "./docs"');
        return { kind: "files", path: this.parseAdditive(), line };
      }
      case "browse": {
        skipFiller();
        this.expectWord("web", ABILITY_HELP);
        return { kind: "web", line };
      }
      case "run": {
        this.expectWord("commands", ABILITY_HELP);
        return { kind: "shell", line };
      }
      case "read": {
        if (this.atWord("gmail")) {
          this.next();
          this.expectWord("with", 'Like this: can read gmail with token from env "GMAIL_TOKEN"');
          this.expectWord("token", 'Like this: can read gmail with token from env "GMAIL_TOKEN"');
          return { kind: "gmail", token: this.parseSecret(), line };
        }
        this.fail("To let an agent read files, use 'can access files in \"folder\"'.", ABILITY_HELP, w);
      }
      case "write":
        this.fail("To let an agent use files, use 'can access files in \"folder\"'.", ABILITY_HELP, w);
      case "use":
      case "ask": {
        const names: string[] = [];
        do names.push(this.expectName(w.value === "use" ? "a tool or MCP server name" : "an agent or team name")); while (this.acceptOp(","));
        return { kind: w.value === "use" ? "tools" : "ask", names, line };
      }
      case "search": {
        const names: string[] = [];
        do names.push(this.expectDottedName("a knowledge base name")); while (this.acceptOp(","));
        return { kind: "search", names, line };
      }
      default:
        this.fail(`I don't know the ability '${w.value}'.`, ABILITY_HELP, w);
    }
  }

  private parseTeam(): Stmt {
    const t = this.next();
    const name = this.expectName("a team name");
    this.expectOp(":", "Put a ':' after the team name, then indent its settings.");
    this.skipNewlines();
    if (this.peek().type !== "indent") this.fail("A team needs settings, indented under its name.", "For example:\n    lead boss\n    members researcher, writer");
    this.next();
    const node: Extract<Stmt, { k: "team" }> = { k: "team", name, members: [], line: t.line };
    this.skipNewlines();
    while (this.peek().type !== "dedent" && this.peek().type !== "eof") {
      const w = this.next();
      if (w.type === "word" && w.value === "lead") {
        node.lead = this.expectName("the lead agent's name");
      } else if (w.type === "word" && w.value === "members") {
        do node.members.push(this.expectName("a member's name")); while (this.acceptOp(","));
      } else {
        this.fail(`I don't know the team setting ${this.describe(w)}.`, "Team settings: lead, members.", w);
      }
      this.endOfLine();
      this.skipNewlines();
    }
    if (this.peek().type === "dedent") this.next();
    return node;
  }

  // ---- expressions ---------------------------------------------------
  parseExpr(): Expr {
    return this.parseOr();
  }

  private bin(op: BinOp, l: Expr, r: Expr, line: number): Expr {
    return { k: "bin", op, l, r, line };
  }

  private parseOr(): Expr {
    let l = this.parseAnd();
    while (this.atWord("or")) {
      const t = this.next();
      l = this.bin("or", l, this.parseAnd(), t.line);
    }
    return l;
  }

  private parseAnd(): Expr {
    let l = this.parseNot();
    while (this.atWord("and")) {
      const t = this.next();
      l = this.bin("and", l, this.parseNot(), t.line);
    }
    return l;
  }

  private parseNot(): Expr {
    if (this.atWord("not")) {
      const t = this.next();
      return { k: "unary", op: "not", e: this.parseNot(), line: t.line };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    let l = this.parseAdditive();
    for (;;) {
      const t = this.peek();
      let op: BinOp | undefined;
      let swap = false;
      let negate = false;
      if (t.type === "word" && t.value === "is") {
        if (this.atWord("not", 1)) { op = "!="; this.p += 2; }
        else if ((this.atWord("greater", 1) || this.atWord("more", 1) || this.atWord("bigger", 1)) && this.atWord("than", 2)) { op = ">"; this.p += 3; }
        else if ((this.atWord("less", 1) || this.atWord("fewer", 1) || this.atWord("smaller", 1)) && this.atWord("than", 2)) { op = "<"; this.p += 3; }
        else if (this.atWord("at", 1) && this.atWord("least", 2)) { op = ">="; this.p += 3; }
        else if (this.atWord("at", 1) && this.atWord("most", 2)) { op = "<="; this.p += 3; }
        else if (this.atWord("in", 1)) { op = "contains"; swap = true; this.p += 2; }
        else { op = "=="; this.p += 1; }
      } else if (t.type === "word" && t.value === "contains") { op = "contains"; this.p += 1; }
      else if (t.type === "word" && t.value === "does" && this.atWord("not", 1) && this.atWord("contain", 2)) { op = "contains"; negate = true; this.p += 3; }
      else if (t.type === "word" && t.value === "starts" && this.atWord("with", 1)) { op = "startswith"; this.p += 2; }
      else if (t.type === "word" && t.value === "ends" && this.atWord("with", 1)) { op = "endswith"; this.p += 2; }
      else if (t.type === "op" && ["==", "!=", "<", ">", "<=", ">="].includes(t.value)) { op = t.value as BinOp; this.p += 1; }
      else break;
      const r = this.parseAdditive();
      let node: Expr = swap ? this.bin(op, r, l, t.line) : this.bin(op, l, r, t.line);
      if (negate) node = { k: "unary", op: "not", e: node, line: t.line };
      l = node;
    }
    return l;
  }

  private parseAdditive(): Expr {
    let l = this.parseMul();
    for (;;) {
      const t = this.peek();
      if ((t.type === "op" && (t.value === "+" || t.value === "-")) || (t.type === "word" && (t.value === "plus" || t.value === "minus"))) {
        this.next();
        const op: BinOp = t.value === "+" || t.value === "plus" ? "+" : "-";
        l = this.bin(op, l, this.parseMul(), t.line);
      } else break;
    }
    return l;
  }

  private parseMul(): Expr {
    let l = this.parseUnary();
    for (;;) {
      const t = this.peek();
      let op: BinOp | undefined;
      if (t.type === "op" && (t.value === "*" || t.value === "/" || t.value === "%")) { op = t.value as BinOp; this.p += 1; }
      else if (t.type === "word" && t.value === "times" && !this.atOp(":", 1) && this.peek(1).type !== "newline") { op = "*"; this.p += 1; }
      else if (t.type === "word" && t.value === "divided" && this.atWord("by", 1)) { op = "/"; this.p += 2; }
      else if (t.type === "word" && t.value === "mod") { op = "%"; this.p += 1; }
      else break;
      l = this.bin(op, l, this.parseUnary(), t.line);
    }
    return l;
  }

  private parseUnary(): Expr {
    if (this.atOp("-")) {
      const t = this.next();
      return { k: "unary", op: "-", e: this.parseUnary(), line: t.line };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && t.value === "(") {
        this.next();
        const args: Expr[] = [];
        if (!this.atOp(")")) {
          do args.push(this.parseExpr()); while (this.acceptOp(","));
        }
        this.expectOp(")", "Close the brackets with ')'.");
        e = { k: "call", callee: e, args, line: t.line };
      } else if (t.type === "op" && t.value === "[") {
        this.next();
        const idx = this.parseExpr();
        this.expectOp("]", "Close the brackets with ']'.");
        e = { k: "index", obj: e, idx, line: t.line };
      } else if (t.type === "op" && t.value === ".") {
        this.next();
        const n = this.peek();
        if (n.type !== "word") this.fail("I expected a field name after '.'.");
        this.next();
        e = { k: "prop", obj: e, name: n.value, line: t.line };
      } else break;
    }
    return e;
  }

  private parsePrimary(): Expr {
    const t = this.next();
    switch (t.type) {
      case "number":
        return { k: "num", v: parseFloat(t.value), line: t.line };
      case "string":
        return {
          k: "str",
          line: t.line,
          parts: t.parts!.map((part) => (typeof part === "string" ? part : parseEmbedded(part.expr, part.line)))
        };
      case "op":
        if (t.value === "(") {
          const e = this.parseExpr();
          this.expectOp(")", "Close the brackets with ')'.");
          return e;
        }
        if (t.value === "[") {
          const items: Expr[] = [];
          if (!this.atOp("]")) {
            do {
              if (this.atOp("]")) break;
              items.push(this.parseExpr());
            } while (this.acceptOp(","));
          }
          this.expectOp("]", "Close the list with ']'.");
          return { k: "list", items, line: t.line };
        }
        if (t.value === "{") return this.parseMap(t.line);
        break;
      case "word": {
        if (t.value === "true" || t.value === "yes") return { k: "bool", v: true, line: t.line };
        if (t.value === "false" || t.value === "no") return { k: "bool", v: false, line: t.line };
        if (t.value === "nothing") return { k: "nothing", line: t.line };
        if (t.value === "ask") {
          const target = this.peek();
          if (target.type !== "word" || (RESERVED.has(target.value) && target.value !== "user")) {
            this.fail("Ask who? Name an agent, team or 'user'.", 'Like this: ask writer "Write a haiku"');
          }
          this.next();
          if (this.peek().type === "newline") this.fail(`Ask ${target.value} what?`, `Like this: ask ${target.value} "your question"`);
          return { k: "ask", target: target.value, prompt: this.parseAdditive(), line: t.line };
        }
        if (RESERVED.has(t.value)) {
          this.fail(`I didn't expect the word '${t.value}' here.`, undefined, t);
        }
        return { k: "var", name: t.value, line: t.line };
      }
    }
    this.fail(`I expected a value here but found ${this.describe(t)}.`, undefined, t);
  }

  private parseMap(line: number): Expr {
    const entries: { key: string; value: Expr }[] = [];
    while (!this.atOp("}")) {
      const k = this.next();
      let key: string;
      if (k.type === "word") key = k.value;
      else if (k.type === "string" && k.parts!.every((x) => typeof x === "string")) key = k.parts!.join("");
      else this.fail("A field name must be a word or text.", undefined, k);
      this.expectOp(":", 'Like this: {name: "Ada", age: 36}');
      entries.push({ key, value: this.parseExpr() });
      if (!this.acceptOp(",")) break;
    }
    this.expectOp("}", "Close the map with '}'.");
    return { k: "map", entries, line };
  }
}

function describeTarget(e: Expr): string {
  if (e.k === "var") return e.name;
  if (e.k === "prop") return `${describeTarget(e.obj)}.${e.name}`;
  return "thing";
}

function parseEmbedded(src: string, line: number): Expr {
  const toks = tokenize(src).map((t) => ({ ...t, line }));
  const parser = new Parser(toks);
  const e = parser.parseExpr();
  const rest = toks[(parser as unknown as { p: number }).p];
  if (rest && rest.type !== "newline" && rest.type !== "eof") {
    throw new IonError(`I couldn't understand '{${src}}' inside this text.`, line, "Write \\{ for a literal brace.");
  }
  return e;
}
