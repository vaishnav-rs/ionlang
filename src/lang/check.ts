import { Expr, Stmt } from "./ast.js";
import { didYouMean } from "./errors.js";

export interface Diagnostic {
  line: number;
  message: string;
  hint?: string;
}

const PROVIDERS = ["gemini", "openai", "anthropic", "openrouter", "groq", "cerebras", "custom", "mock", "demo"];

function literal(e: Expr | undefined): string | undefined {
  if (e?.k === "str" && e.parts.every((p) => typeof p === "string")) return (e.parts as string[]).join("");
  return undefined;
}

/**
 * Finds mistakes without running anything (no API keys or network needed):
 * unknown agents/tools/models, teams with missing leads, duplicate names, and
 * `ask` targets that don't exist. Files that `use` other files are checked
 * more leniently, since names may come from the imported file.
 */
export function check(program: Stmt[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const add = (line: number, message: string, hint?: string) => out.push({ line, message, hint });

  const agents = new Map<string, Extract<Stmt, { k: "agent" }>>();
  const teams = new Map<string, Extract<Stmt, { k: "team" }>>();
  const tools = new Set<string>();
  const assigned = new Set<string>(["user"]);
  let hasImports = false;

  const forEachStmt = (stmts: Stmt[], fn: (s: Stmt) => void) => {
    for (const s of stmts) {
      fn(s);
      if (s.k === "if") { s.branches.forEach((b) => forEachStmt(b.body, fn)); if (s.otherwise) forEachStmt(s.otherwise, fn); }
      else if (s.k === "repeat" || s.k === "forever" || s.k === "foreach" || s.k === "while" || s.k === "fn" || s.k === "tool" || s.k === "test") forEachStmt(s.body, fn);
      else if (s.k === "try") { forEachStmt(s.body, fn); forEachStmt(s.handler, fn); }
    }
  };

  // pass 1: declarations
  const seen = new Map<string, number>();
  const declare = (name: string, line: number, what: string) => {
    if (seen.has(name)) add(line, `The name '${name}' is already used by a ${what} on line ${seen.get(name)}.`);
    else seen.set(name, line);
  };
  forEachStmt(program, (s) => {
    if (s.k === "agent") { declare(s.name, s.line, "definition"); agents.set(s.name, s); assigned.add(s.name); }
    else if (s.k === "team") { declare(s.name, s.line, "definition"); teams.set(s.name, s); assigned.add(s.name); }
    else if (s.k === "tool") { declare(s.name, s.line, "definition"); tools.add(s.name); assigned.add(s.name); s.params.forEach((p) => assigned.add(p)); }
    else if (s.k === "fn") { assigned.add(s.name); s.params.forEach((p) => assigned.add(p)); }
    else if (s.k === "set" && s.target.k === "var") assigned.add(s.target.name);
    else if (s.k === "foreach") assigned.add(s.name);
    else if (s.k === "try") assigned.add(s.errName);
    else if (s.k === "use") hasImports = true;
  });

  const known = () => [...agents.keys(), ...teams.keys()];

  // pass 2: validate
  for (const a of agents.values()) {
    if (!a.model) add(a.line, `Agent '${a.name}' needs a model.`, 'Add a line inside the agent, like: model "gemini/gemini-2.5-flash"');
    const m = literal(a.model);
    if (m !== undefined) {
      const provider = m.split("/")[0];
      if (!PROVIDERS.includes(provider)) {
        add(a.line, `Agent '${a.name}': I don't know the AI provider '${provider}'.`, didYouMean(provider, PROVIDERS) ?? `Providers: ${PROVIDERS.join(", ")}`);
      }
    }
    if (m !== undefined && m.split("/")[0] === "custom") {
      if (!a.endpoint) add(a.line, `Agent '${a.name}' uses a custom provider, so it needs an endpoint.`, 'Add: endpoint "http://localhost:11434/v1/chat/completions"');
      if (!m.includes("/")) add(a.line, `Agent '${a.name}' needs a model name after "custom/".`, 'Write it like: model "custom/llama3"');
    } else if (a.endpoint || a.format || a.authHeader) {
      add(a.line, `Agent '${a.name}': 'endpoint', 'format' and 'header' only work with model "custom/...".`);
    }
    for (const f of a.fallbacks) {
      const fm = literal(f);
      if (fm === undefined) continue;
      const fp = fm.split("/")[0];
      if (!PROVIDERS.includes(fp) || fp === "custom") {
        add(a.line, `Agent '${a.name}': I can't use "${fm}" as a fallback model.`, didYouMean(fp, PROVIDERS) ?? 'Write it like: fallback "gemini/gemini-2.5-flash-lite"');
      }
    }
    for (const ab of a.abilities) {
      if (ab.kind === "ask" && !hasImports) {
        for (const n of ab.names) if (!agents.has(n) && !teams.has(n)) add(ab.line, `Agent '${a.name}' can ask '${n}', but there is no agent or team with that name.`, didYouMean(n, known()));
      }
      if (ab.kind === "tools" && !hasImports) {
        for (const n of ab.names) if (!tools.has(n)) add(ab.line, `Agent '${a.name}' can use '${n}', but there is no tool with that name.`, didYouMean(n, tools) ?? `Define it with: tool ${n}(input):`);
      }
      if (ab.kind === "ask" && ab.names.includes(a.name)) add(ab.line, `Agent '${a.name}' can't ask itself.`);
    }
  }
  for (const t of teams.values()) {
    if (!t.lead) add(t.line, `Team '${t.name}' needs a lead.`, "Add a line inside the team, like: lead boss");
    if (t.lead && !hasImports && !agents.has(t.lead)) add(t.line, `Team '${t.name}' has lead '${t.lead}', but there is no agent with that name.`, didYouMean(t.lead, agents.keys()));
    if (!hasImports) for (const m of t.members) if (!agents.has(m) && !teams.has(m)) add(t.line, `Team '${t.name}' has member '${m}', but there is no agent or team with that name.`, didYouMean(m, known()));
  }

  // pass 3: `ask`, `chat`, `serve` targets inside code
  const checkTarget = (name: string, line: number) => {
    if (hasImports || assigned.has(name)) return;
    add(line, `I don't know anything called '${name}'.`, didYouMean(name, [...known(), ...assigned]));
  };
  const walkExpr = (e: Expr | undefined) => {
    if (!e) return;
    switch (e.k) {
      case "ask": checkTarget(e.target, e.line); walkExpr(e.prompt); break;
      case "str": e.parts.forEach((p) => typeof p !== "string" && walkExpr(p)); break;
      case "list": e.items.forEach(walkExpr); break;
      case "map": e.entries.forEach((x) => walkExpr(x.value)); break;
      case "unary": walkExpr(e.e); break;
      case "bin": walkExpr(e.l); walkExpr(e.r); break;
      case "call": walkExpr(e.callee); e.args.forEach(walkExpr); break;
      case "index": walkExpr(e.obj); walkExpr(e.idx); break;
      case "prop": walkExpr(e.obj); break;
    }
  };
  forEachStmt(program, (s) => {
    switch (s.k) {
      case "set": walkExpr(s.target); walkExpr(s.value); break;
      case "say": case "expr": walkExpr(s.e); break;
      case "add": walkExpr(s.value); walkExpr(s.list); break;
      case "remove": walkExpr(s.value); walkExpr(s.from); break;
      case "if": s.branches.forEach((b) => walkExpr(b.cond)); break;
      case "repeat": walkExpr(s.count); break;
      case "while": walkExpr(s.cond); break;
      case "foreach": walkExpr(s.iter); break;
      case "give": walkExpr(s.value); break;
      case "chat": checkTarget(s.target, s.line); break;
      case "serve": checkTarget(s.target, s.line); walkExpr(s.port); break;
    }
  });

  return out.sort((a, b) => a.line - b.line);
}
