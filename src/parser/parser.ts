import { Token, TokenType } from "../lexer/tokens.js";
import {
  AgentDefNode,
  GrantKind,
  GrantNode,
  Modality,
  ModelRef,
  Program,
  ProviderRef
} from "./ast.js";

export class ParseError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Parse error at line ${line}: ${message}`);
    this.line = line;
  }
}

const GRANT_KINDS = new Set([
  "file-access",
  "web-browsing",
  "shell-exec",
  "orchestration-powers",
  "gmail-access",
  "user-admin"
]);

export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private at(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private expect(type: TokenType, context: string): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new ParseError(
        `expected ${type} ${context}, got ${t.type} '${t.value}'`,
        t.line
      );
    }
    return this.advance();
  }

  private expectIdent(value: string, context: string): Token {
    const t = this.peek();
    if (t.type !== "IDENT" || t.value !== value) {
      throw new ParseError(
        `expected '${value}' ${context}, got ${t.type} '${t.value}'`,
        t.line
      );
    }
    return this.advance();
  }

  private skipNewlines(): void {
    while (this.at("NEWLINE")) this.advance();
  }

  // A line inside a brace-delimited block may end with a NEWLINE, or (for the
  // last field before the closing brace) directly abut the '}' with no newline
  // in between, matching the user's example shape (e.g. `output == text}`).
  private endLine(context: string): void {
    if (this.at("RBRACE")) return;
    this.expect("NEWLINE", context);
  }

  parseProgram(): Program {
    this.expectIdent("ion", "as first token of program");
    this.expectIdent("init", "after 'ion'");
    this.expect("NEWLINE", "after 'ion init' header");
    this.skipNewlines();

    const program: Program = { kind: "Program", agents: [] };

    while (!this.at("EOF")) {
      if (this.at("IDENT") && this.peek().value === "type") {
        program.typeDecl = this.parseTypeDecl();
      } else if (this.at("IDENT") && this.peek().value === "agentdef") {
        program.agents.push(this.parseAgentDef());
      } else {
        const t = this.peek();
        throw new ParseError(
          `expected 'type' or 'agentdef', got ${t.type} '${t.value}'`,
          t.line
        );
      }
      this.skipNewlines();
    }

    return program;
  }

  private parseTypeDecl(): { value: "team" | "single"; line: number } {
    const line = this.peek().line;
    this.advance(); // 'type'
    this.expect("EQEQ", "after 'type'");
    const valTok = this.expect("IDENT", "as value of 'type'");
    if (valTok.value !== "team" && valTok.value !== "single") {
      throw new ParseError(
        `'type' must be 'team' or 'single', got '${valTok.value}'`,
        valTok.line
      );
    }
    this.expect("NEWLINE", "after type declaration");
    return { value: valTok.value as "team" | "single", line };
  }

  private parseAgentDef(): AgentDefNode {
    const line = this.peek().line;
    this.advance(); // 'agentdef'
    const nameTok = this.expect("IDENT", "as agent name");
    this.expect("LBRACE", "to open agentdef block");
    this.skipNewlines();

    const agent: AgentDefNode = {
      kind: "AgentDef",
      name: nameTok.value,
      grants: [],
      line
    };

    while (!this.at("RBRACE")) {
      if (this.at("EOF")) {
        throw new ParseError("unterminated agentdef block, expected '}'", this.peek().line);
      }
      this.parseAgentLine(agent);
      this.skipNewlines();
    }
    this.expect("RBRACE", "to close agentdef block");
    this.expect("NEWLINE", "after agentdef block");
    return agent;
  }

  private parseAgentLine(agent: AgentDefNode): void {
    const t = this.peek();
    if (t.type !== "IDENT") {
      throw new ParseError(`unexpected token '${t.value}' inside agentdef block`, t.line);
    }

    switch (t.value) {
      case "ai-provider":
        this.parseProviderLine(agent);
        return;
      case "ai-apikey":
        this.parseApiKeyLine(agent);
        return;
      case "ai-model":
        this.parseModelLine(agent);
        return;
      case "grant":
        agent.grants.push(this.parseGrantLine());
        return;
      case "input":
        agent.input = this.parseModalityLine("input");
        return;
      case "output":
        agent.output = this.parseModalityLine("output");
        return;
      default:
        throw new ParseError(`unknown agentdef field '${t.value}'`, t.line);
    }
  }

  private parseProviderLine(agent: AgentDefNode): void {
    const line = this.peek().line;
    this.advance(); // 'ai-provider'
    this.expect("EQEQ", "after 'ai-provider'");
    const valTok = this.expect("IDENT", "as provider name");
    this.endLine("after ai-provider line");

    if (valTok.value === "custom") {
      const provider: ProviderRef = this.parseCustomProviderBlock(line);
      agent.provider = provider;
    } else {
      agent.provider = { kind: "builtin", name: valTok.value, line };
    }
  }

  private parseCustomProviderBlock(line: number): ProviderRef {
    this.skipNewlines();
    this.expectIdent("endpoint", "in custom provider block");
    this.expect("EQEQ", "after 'endpoint'");
    const endpointTok = this.expect("STRING", "as endpoint value");
    this.endLine("after endpoint line");
    this.skipNewlines();

    this.expectIdent("auth-header", "in custom provider block");
    this.expect("EQEQ", "after 'auth-header'");
    const authTok = this.expect("STRING", "as auth-header value");
    this.endLine("after auth-header line");
    this.skipNewlines();

    this.expectIdent("request-format", "in custom provider block");
    this.expect("EQEQ", "after 'request-format'");
    const fmtTok = this.expect("IDENT", "as request-format value");
    if (!["openai", "anthropic", "raw"].includes(fmtTok.value)) {
      throw new ParseError(
        `request-format must be one of openai|anthropic|raw, got '${fmtTok.value}'`,
        fmtTok.line
      );
    }
    this.endLine("after request-format line");

    return {
      kind: "custom",
      endpoint: endpointTok.value,
      authHeader: authTok.value,
      requestFormat: fmtTok.value as "openai" | "anthropic" | "raw",
      line
    };
  }

  private parseApiKeyLine(agent: AgentDefNode): void {
    const line = this.peek().line;
    this.advance(); // 'ai-apikey'
    this.expect("EQEQ", "after 'ai-apikey'");
    const t = this.peek();
    if (t.type === "ENV_REF") {
      this.advance();
      agent.apiKey = { envVar: t.value, line };
    } else if (t.type === "STRING") {
      this.advance();
      agent.apiKey = { literal: t.value, line };
    } else if (t.type === "IDENT") {
      // unquoted literal key value
      this.advance();
      agent.apiKey = { literal: t.value, line };
    } else {
      throw new ParseError(
        `expected string, env:VAR, or bare value for ai-apikey, got ${t.type} '${t.value}'`,
        t.line
      );
    }
    this.endLine("after ai-apikey line");
  }

  private parseModelLine(agent: AgentDefNode): void {
    this.advance(); // 'ai-model'
    this.expect("EQEQ", "after 'ai-model'");
    const t = this.peek();
    let ref: ModelRef;
    if (t.type === "MODEL_REF") {
      this.advance();
      const [provider, ...rest] = t.value.split("/");
      ref = { provider, modelId: rest.join("/") };
    } else if (t.type === "IDENT") {
      this.advance();
      ref = { provider: "", modelId: t.value };
    } else {
      throw new ParseError(
        `expected provider/model-id for ai-model, got ${t.type} '${t.value}'`,
        t.line
      );
    }
    this.endLine("after ai-model line");
    agent.model = ref;
  }

  private parseGrantLine(): GrantNode {
    const line = this.peek().line;
    this.advance(); // 'grant'
    const kindTok = this.expect("IDENT", "as grant kind");
    if (!GRANT_KINDS.has(kindTok.value)) {
      throw new ParseError(`unknown grant kind '${kindTok.value}'`, kindTok.line);
    }
    let scope: string | undefined;
    if (this.at("STRING")) {
      scope = this.advance().value;
    }
    this.endLine("after grant line");
    return { kind: kindTok.value as GrantKind, scope, line };
  }

  private parseModalityLine(field: "input" | "output"): Modality[] {
    const line = this.peek().line;
    this.advance(); // 'input' | 'output'
    this.expect("EQEQ", `after '${field}'`);
    const modalities: Modality[] = [];
    modalities.push(this.parseModality());
    while (this.at("COMMA")) {
      this.advance();
      modalities.push(this.parseModality());
    }
    this.endLine(`after ${field} line`);
    void line;
    return modalities;
  }

  private parseModality(): Modality {
    const t = this.expect("IDENT", "as modality");
    if (t.value !== "text" && t.value !== "voice") {
      throw new ParseError(`modality must be 'text' or 'voice', got '${t.value}'`, t.line);
    }
    return t.value as Modality;
  }
}

export function parse(tokens: Token[]): Program {
  return new Parser(tokens).parseProgram();
}
