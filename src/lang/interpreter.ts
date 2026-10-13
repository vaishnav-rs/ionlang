import * as fs from "node:fs";
import * as path from "node:path";
import { Expr, Stmt } from "./ast.js";
import { installBuiltins } from "./builtins.js";
import { IonError, didYouMean } from "./errors.js";
import { parse } from "./parser.js";
import {
  AgentRef, Builtin, BreakSignal, BuiltinCtx, ContinueSignal, Env, IonFunction, IonMap, ReturnSignal,
  isEqual, isMap, newMap, toJson, toText, truthy, typeName
} from "./values.js";
import { AgentConfig, ProgramConfig } from "../interpreter/program.js";
import { GrantKind, GrantNode } from "../parser/ast.js";
import { runTurn } from "../runtime/agent-loop.js";
import { GrantManager } from "../runtime/grants/grant-manager.js";
import { ChatMessage, ToolSpec } from "../runtime/providers/types.js";

export interface IonIO {
  /** Output of `say`. */
  say(text: string): void;
  /** Progress notices, e.g. "researcher used fetch_url". */
  note(text: string): void;
  /** Read one line from the user; null at end of input. */
  readLine(prompt: string): Promise<string | null>;
  /** Ask permission before an agent uses a risky ability. */
  confirm(d: { agent: string; grant: GrantKind; detail: string }): Promise<boolean>;
}

export interface InterpreterOptions {
  io: IonIO;
  /** Path of the main script; `use` paths and error messages resolve against it. */
  file?: string;
  autoYes?: boolean;
  /** Start the web/API server for `serve`. Resolves when the server is stopped. */
  serve?: (program: ProgramConfig, port: number) => Promise<void>;
}

type Secret = { env?: string; literal?: string };
type ResolvedAbility =
  | { kind: "files"; path: string }
  | { kind: "web" }
  | { kind: "shell" }
  | { kind: "gmail"; token: Secret }
  | { kind: "tools"; names: string[] }
  | { kind: "ask"; names: string[] };

interface AgentSpec {
  name: string;
  provider: string;
  modelId?: string;
  role?: string;
  key?: Secret;
  custom?: { endpoint: string; requestFormat: "openai" | "anthropic" | "raw"; authHeader: string };
  abilities: ResolvedAbility[];
  memory: boolean;
  input: string[];
  output: string[];
  line: number;
}
interface TeamSpec { name: string; lead: string; members: string[]; line: number }

const PROVIDERS = ["gemini", "openai", "anthropic", "openrouter", "groq", "cerebras", "custom", "mock", "demo"];
const DEFAULT_KEY_ENV: Record<string, string> = {
  gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY", groq: "GROQ_API_KEY", cerebras: "CEREBRAS_API_KEY"
};
const BUILTIN_TOOL_NAMES = new Set([
  "read_file", "write_file", "list_files", "fetch_url", "browse_page", "run_command", "search_gmail", "read_gmail_message"
]);
const MAX_CALL_DEPTH = 200;
const MAX_DELEGATION_DEPTH = 6;

export class Interpreter {
  readonly globals = new Env();
  private agents = new Map<string, AgentSpec>();
  private teams = new Map<string, TeamSpec>();
  private tools = new Map<string, IonFunction>();
  private configs = new Map<string, AgentConfig>();
  private histories = new Map<string, ChatMessage[]>();
  private grantManagers = new Map<string, GrantManager>();
  private imported = new Set<string>();
  private fileStack: string[] = [];
  private callDepth = 0;
  private served = false;

  constructor(private opts: InterpreterOptions) {
    installBuiltins(this.globals);
    if (opts.file) this.fileStack.push(path.resolve(opts.file));
  }

  /** Parse and run a whole script. */
  async runSource(source: string): Promise<void> {
    await this.run(parse(source));
  }

  /** For the REPL: run a snippet, returning the value if it was a single expression. */
  async runSnippet(source: string): Promise<{ isValue: boolean; value?: unknown }> {
    const stmts = parse(source);
    if (stmts.length === 1 && stmts[0].k === "expr") {
      try {
        return { isValue: true, value: await this.evalExpr(stmts[0].e, this.globals) };
      } catch (e) {
        if (e instanceof IonError && e.line === 0) e.line = stmts[0].line;
        throw e;
      }
    }
    await this.run(stmts);
    return { isValue: false };
  }

  async run(program: Stmt[]): Promise<void> {
    try {
      await this.execBlock(program, this.globals);
    } catch (e) {
      if (e instanceof BreakSignal || e instanceof ContinueSignal) {
        throw new IonError("'stop' and 'skip' only work inside a loop.");
      }
      if (e instanceof ReturnSignal) return;
      throw e;
    }
  }

  // =====================================================================
  // statements
  // =====================================================================
  private async execBlock(stmts: Stmt[], env: Env): Promise<void> {
    for (const s of stmts) await this.execStmt(s, env);
  }

  private async execStmt(s: Stmt, env: Env): Promise<void> {
    try {
      await this.execStmtInner(s, env);
    } catch (e) {
      if (e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal) throw e;
      const err = e instanceof IonError ? e : new IonError(e instanceof Error ? e.message : String(e), s.line);
      if (err.line === 0) err.line = s.line;
      if (!err.file && this.fileStack.length > 1) err.file = this.fileStack[this.fileStack.length - 1];
      throw err;
    }
  }

  private async loopBody(body: Stmt[], env: Env): Promise<"break" | "next"> {
    try {
      await this.execBlock(body, env);
    } catch (e) {
      if (e instanceof BreakSignal) return "break";
      if (e instanceof ContinueSignal) return "next";
      throw e;
    }
    return "next";
  }

  private async execStmtInner(s: Stmt, env: Env): Promise<void> {
    switch (s.k) {
      case "set":
        return this.assign(s.target, await this.evalExpr(s.value, env), env);
      case "say":
        return this.opts.io.say(toText(await this.evalExpr(s.e, env)));
      case "add": {
        const list = await this.evalExpr(s.list, env);
        if (!Array.isArray(list)) throw new IonError(`I can only add to a list, but this is ${typeName(list)}.`, s.line, "Make a list first: set items to []");
        list.push(await this.evalExpr(s.value, env));
        return;
      }
      case "remove": {
        const target = await this.evalExpr(s.from, env);
        const value = await this.evalExpr(s.value, env);
        if (Array.isArray(target)) {
          const i = target.findIndex((x) => isEqual(x, value));
          if (i >= 0) target.splice(i, 1);
        } else if (isMap(target)) delete target[toText(value)];
        else throw new IonError(`I can only remove from a list or map, but this is ${typeName(target)}.`, s.line);
        return;
      }
      case "if": {
        for (const b of s.branches) {
          if (truthy(await this.evalExpr(b.cond, env))) return this.execBlock(b.body, env);
        }
        if (s.otherwise) return this.execBlock(s.otherwise, env);
        return;
      }
      case "repeat": {
        const n = await this.evalExpr(s.count, env);
        if (typeof n !== "number") throw new IonError(`'repeat' needs a number, but got ${typeName(n)}.`, s.line);
        for (let i = 0; i < n; i++) if ((await this.loopBody(s.body, env)) === "break") break;
        return;
      }
      case "forever":
        while ((await this.loopBody(s.body, env)) !== "break");
        return;
      case "while":
        while (truthy(await this.evalExpr(s.cond, env))) if ((await this.loopBody(s.body, env)) === "break") break;
        return;
      case "foreach": {
        const it = await this.evalExpr(s.iter, env);
        const items = Array.isArray(it) ? [...it] : typeof it === "string" ? [...it] : isMap(it) ? Object.keys(it) : undefined;
        if (!items) throw new IonError(`'for each' needs a list, text or map, but got ${typeName(it)}.`, s.line);
        for (const item of items) {
          env.define(s.name, item);
          if ((await this.loopBody(s.body, env)) === "break") break;
        }
        return;
      }
      case "stop": throw new BreakSignal();
      case "skip": throw new ContinueSignal();
      case "fn":
        env.define(s.name, new IonFunction(s.name, s.params, s.body, env, s.doc));
        return;
      case "give":
        throw new ReturnSignal(s.value ? await this.evalExpr(s.value, env) : null);
      case "try":
        try {
          await this.execBlock(s.body, env);
        } catch (e) {
          if (e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal) throw e;
          env.assign(s.errName, e instanceof Error ? e.message : String(e));
          await this.execBlock(s.handler, env);
        }
        return;
      case "use":
        return this.importFile(s.path, s.line);
      case "describe":
        return;
      case "tool":
        return this.defineTool(s, env);
      case "agent":
        return this.defineAgent(s, env);
      case "team":
        return this.defineTeam(s, env);
      case "chat":
        return this.chat(s.target, s.line, env);
      case "serve":
        return this.serve(s.target, s.port ? await this.evalExpr(s.port, env) : 4310, s.line, env);
      case "expr":
        await this.evalExpr(s.e, env);
        return;
    }
  }

  private async assign(target: Expr, value: unknown, env: Env): Promise<void> {
    if (target.k === "var") return env.assign(target.name, value);
    if (target.k === "index") {
      const obj = await this.evalExpr(target.obj, env);
      const idx = await this.evalExpr(target.idx, env);
      if (Array.isArray(obj)) {
        if (typeof idx !== "number" || !Number.isInteger(idx)) throw new IonError("A list position must be a whole number.", target.line);
        const i = idx < 0 ? obj.length + idx : idx;
        if (i < 0 || i >= obj.length) throw new IonError(`This list has ${obj.length} items, so there is no position ${idx}.`, target.line, "Use 'add' to put a new item at the end.");
        obj[i] = value;
      } else if (isMap(obj)) obj[toText(idx)] = value;
      else throw new IonError(`I can't set a position inside ${typeName(obj)}.`, target.line);
      return;
    }
    if (target.k === "prop") {
      const obj = await this.evalExpr(target.obj, env);
      if (!isMap(obj)) throw new IonError(`I can't set a field on ${typeName(obj)}.`, target.line);
      obj[target.name] = value;
      return;
    }
    throw new IonError("I can't set that.", target.line);
  }

  private async importFile(rel: string, line: number): Promise<void> {
    const base = this.fileStack.length ? path.dirname(this.fileStack[this.fileStack.length - 1]) : process.cwd();
    const full = path.resolve(base, rel);
    if (this.imported.has(full)) return;
    this.imported.add(full);
    let source: string;
    try {
      source = fs.readFileSync(full, "utf-8");
    } catch {
      throw new IonError(`I couldn't open '${rel}'.`, line, `I looked for ${full}`);
    }
    this.fileStack.push(full);
    try {
      let stmts: Stmt[];
      try {
        stmts = parse(source);
      } catch (e) {
        if (e instanceof IonError && !e.file) e.file = full;
        throw e;
      }
      await this.execBlock(stmts, this.globals);
    } finally {
      this.fileStack.pop();
    }
  }

  // =====================================================================
  // expressions
  // =====================================================================
  private lookup(name: string, env: Env, line: number): unknown {
    if (env.has(name)) return env.get(name);
    throw new IonError(
      `I don't know anything called '${name}'.`,
      line,
      didYouMean(name, env.names()) ?? `Create it first, like: set ${name} to ...`
    );
  }

  private async evalExpr(e: Expr, env: Env): Promise<unknown> {
    switch (e.k) {
      case "num": return e.v;
      case "bool": return e.v;
      case "nothing": return null;
      case "str": {
        let out = "";
        for (const p of e.parts) out += typeof p === "string" ? p : toText(await this.evalExpr(p, env));
        return out;
      }
      case "list": {
        const out: unknown[] = [];
        for (const x of e.items) out.push(await this.evalExpr(x, env));
        return out;
      }
      case "map": {
        const m = newMap();
        for (const { key, value } of e.entries) m[key] = await this.evalExpr(value, env);
        return m;
      }
      case "var": return this.lookup(e.name, env, e.line);
      case "unary": {
        const v = await this.evalExpr(e.e, env);
        if (e.op === "not") return !truthy(v);
        if (typeof v !== "number") throw new IonError(`I can't make ${typeName(v)} negative.`, e.line);
        return -v;
      }
      case "bin": return this.evalBin(e, env);
      case "index": {
        const obj = await this.evalExpr(e.obj, env);
        const idx = await this.evalExpr(e.idx, env);
        if (Array.isArray(obj) || typeof obj === "string") {
          if (typeof idx !== "number" || !Number.isInteger(idx)) throw new IonError("A position must be a whole number.", e.line);
          const i = idx < 0 ? obj.length + idx : idx;
          if (i < 0 || i >= obj.length) throw new IonError(`This has ${obj.length} items, so there is no position ${idx}. (Positions start at 0.)`, e.line);
          return obj[i];
        }
        if (isMap(obj)) return obj[toText(idx)] ?? null;
        throw new IonError(`I can't look inside ${typeName(obj)} with [ ].`, e.line);
      }
      case "prop": {
        const obj = await this.evalExpr(e.obj, env);
        if (isMap(obj)) return obj[e.name] ?? null;
        if ((typeof obj === "string" || Array.isArray(obj)) && e.name === "length") return obj.length;
        if (obj instanceof AgentRef && e.name === "name") return obj.name;
        throw new IonError(`I can't find '.${e.name}' on ${typeName(obj)}.`, e.line);
      }
      case "call": {
        const fn = await this.evalExpr(e.callee, env);
        const args: unknown[] = [];
        for (const a of e.args) args.push(await this.evalExpr(a, env));
        if (!(fn instanceof IonFunction || fn instanceof Builtin)) {
          const what = e.callee.k === "var" ? `'${e.callee.name}'` : "that";
          throw new IonError(`${what} isn't a function, so I can't call it.`, e.line);
        }
        return this.callFunction(fn, args, e.line);
      }
      case "ask": return this.evalAsk(e, env);
    }
  }

  private async evalAsk(e: Extract<Expr, { k: "ask" }>, env: Env): Promise<unknown> {
    const prompt = toText(await this.evalExpr(e.prompt, env));
    if (e.target === "user") return this.opts.io.readLine(`${prompt} `);
    const ref = this.lookup(e.target, env, e.line);
    if (!(ref instanceof AgentRef)) {
      throw new IonError(`'${e.target}' isn't an agent or team, so I can't ask it.`, e.line, `Define it first: agent ${e.target}:`);
    }
    return this.askNamed(ref.name, prompt, e.line);
  }

  private async evalBin(e: Extract<Expr, { k: "bin" }>, env: Env): Promise<unknown> {
    if (e.op === "and") {
      const l = await this.evalExpr(e.l, env);
      return truthy(l) ? this.evalExpr(e.r, env) : l;
    }
    if (e.op === "or") {
      const l = await this.evalExpr(e.l, env);
      return truthy(l) ? l : this.evalExpr(e.r, env);
    }
    const l = await this.evalExpr(e.l, env);
    const r = await this.evalExpr(e.r, env);
    switch (e.op) {
      case "==": return isEqual(l, r);
      case "!=": return !isEqual(l, r);
      case "contains":
        if (typeof l === "string") return l.includes(toText(r));
        if (Array.isArray(l)) return l.some((x) => isEqual(x, r));
        if (isMap(l)) return toText(r) in l;
        throw new IonError(`'contains' needs text, a list or a map on the left, not ${typeName(l)}.`, e.line);
      case "startswith":
        return typeof l === "string" && l.startsWith(toText(r));
      case "endswith":
        return typeof l === "string" && l.endsWith(toText(r));
      case "<": case ">": case "<=": case ">=": {
        const ok = (typeof l === "number" && typeof r === "number") || (typeof l === "string" && typeof r === "string");
        if (!ok) throw new IonError(`I can't compare ${typeName(l)} with ${typeName(r)}.`, e.line, "Both sides must be numbers, or both text.");
        const a = l as number, b = r as number;
        return e.op === "<" ? a < b : e.op === ">" ? a > b : e.op === "<=" ? a <= b : a >= b;
      }
      case "+":
        if (typeof l === "string" || typeof r === "string") return toText(l) + toText(r);
        if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
        break;
    }
    if (typeof l !== "number" || typeof r !== "number") {
      const verb = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide", "%": "take the remainder of" }[e.op as string] ?? "combine";
      throw new IonError(`I can't ${verb} ${typeName(l)} and ${typeName(r)}.`, e.line, "Use number(x) to turn text into a number.");
    }
    switch (e.op) {
      case "+": return l + r;
      case "-": return l - r;
      case "*": return l * r;
      case "/":
        if (r === 0) throw new IonError("You can't divide by zero.", e.line);
        return l / r;
      case "%":
        if (r === 0) throw new IonError("You can't divide by zero.", e.line);
        return l % r;
    }
    throw new IonError("I don't know how to do that.", e.line);
  }

  private ctx(line: number): BuiltinCtx {
    return {
      line,
      call: (fn, args) => {
        if (!(fn instanceof IonFunction || fn instanceof Builtin)) throw new IonError(`${typeName(fn)} isn't a function.`, line);
        return this.callFunction(fn, args, line);
      },
      askAll: (agents, prompt) => Promise.all(agents.map((a) => this.askNamed((a as AgentRef).name, prompt, line)))
    };
  }

  async callFunction(fn: IonFunction | Builtin, args: unknown[], line: number): Promise<unknown> {
    if (fn instanceof Builtin) {
      try {
        return await fn.fn(args, this.ctx(line));
      } catch (e) {
        if (e instanceof IonError && e.line === 0) e.line = line;
        throw e;
      }
    }
    if (args.length !== fn.params.length) {
      throw new IonError(
        `${fn.name}(${fn.params.join(", ")}) needs ${fn.params.length} input${fn.params.length === 1 ? "" : "s"} but got ${args.length}.`,
        line
      );
    }
    if (this.callDepth >= MAX_CALL_DEPTH) {
      throw new IonError(`'${fn.name}' keeps calling itself too deeply.`, line, "Check that it has a way to stop.");
    }
    const local = new Env(fn.closure);
    fn.params.forEach((p, i) => local.define(p, args[i]));
    this.callDepth++;
    try {
      await this.execBlock(fn.body, local);
      return null;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof BreakSignal || e instanceof ContinueSignal) throw new IonError("'stop' and 'skip' only work inside a loop.", line);
      throw e;
    } finally {
      this.callDepth--;
    }
  }

  // =====================================================================
  // agents, teams, tools
  // =====================================================================
  private async secret(s: { env?: Expr; literal?: Expr } | undefined, env: Env): Promise<Secret | undefined> {
    if (!s) return undefined;
    return {
      env: s.env ? toText(await this.evalExpr(s.env, env)) : undefined,
      literal: s.literal ? toText(await this.evalExpr(s.literal, env)) : undefined
    };
  }

  private declare(name: string, line: number): void {
    if (this.agents.has(name) || this.teams.has(name) || this.tools.has(name)) {
      throw new IonError(`There is already an agent, team or tool called '${name}'.`, line);
    }
    this.configs.clear();
  }

  private async defineAgent(s: Extract<Stmt, { k: "agent" }>, env: Env): Promise<void> {
    this.declare(s.name, s.line);
    if (!s.model) {
      throw new IonError(`Agent '${s.name}' needs a model.`, s.line, 'Add a line inside the agent, like: model "gemini/gemini-2.5-flash"');
    }
    const modelText = toText(await this.evalExpr(s.model, env)).trim();
    const slash = modelText.indexOf("/");
    const provider = slash < 0 ? modelText : modelText.slice(0, slash);
    const modelId = slash < 0 ? undefined : modelText.slice(slash + 1);
    if (!PROVIDERS.includes(provider)) {
      throw new IonError(
        `I don't know the AI provider '${provider}' in model "${modelText}".`,
        s.line,
        didYouMean(provider, PROVIDERS) ?? `Providers: ${PROVIDERS.join(", ")}. Write the model like "gemini/gemini-2.5-flash".`
      );
    }
    let custom: AgentSpec["custom"];
    if (provider === "custom") {
      if (!s.endpoint) {
        throw new IonError(`Agent '${s.name}' uses a custom provider, so it needs an endpoint.`, s.line, 'Add a line inside the agent, like: endpoint "http://localhost:11434/v1/chat/completions"');
      }
      if (!modelId) {
        throw new IonError(`Agent '${s.name}' needs a model name after "custom/".`, s.line, 'Write it like: model "custom/llama3"');
      }
      const requestFormat = s.format ?? "openai";
      custom = {
        endpoint: toText(await this.evalExpr(s.endpoint, env)).trim(),
        requestFormat,
        authHeader: s.authHeader ? toText(await this.evalExpr(s.authHeader, env)).trim() : requestFormat === "anthropic" ? "x-api-key" : "Authorization"
      };
    } else if (s.endpoint || s.format || s.authHeader) {
      throw new IonError(`'endpoint', 'format' and 'header' only work with a custom provider.`, s.line, `Use model "custom/your-model-name" if you want to point at your own server.`);
    }
    const abilities: ResolvedAbility[] = [];
    for (const a of s.abilities) {
      if (a.kind === "files") abilities.push({ kind: "files", path: toText(await this.evalExpr(a.path, env)) });
      else if (a.kind === "gmail") abilities.push({ kind: "gmail", token: (await this.secret(a.token, env))! });
      else abilities.push(a.kind === "tools" || a.kind === "ask" ? { kind: a.kind, names: a.names } : { kind: a.kind });
    }
    this.agents.set(s.name, {
      name: s.name,
      provider,
      modelId,
      role: s.role ? toText(await this.evalExpr(s.role, env)) : undefined,
      key: await this.secret(s.key, env),
      custom,
      abilities,
      memory: s.memory,
      input: s.input,
      output: s.output,
      line: s.line
    });
    env.define(s.name, new AgentRef("agent", s.name));
  }

  private defineTeam(s: Extract<Stmt, { k: "team" }>, env: Env): void {
    this.declare(s.name, s.line);
    if (!s.lead) throw new IonError(`Team '${s.name}' needs a lead.`, s.line, "Add a line inside the team, like: lead boss");
    this.teams.set(s.name, { name: s.name, lead: s.lead, members: s.members, line: s.line });
    env.define(s.name, new AgentRef("team", s.name));
  }

  private defineTool(s: Extract<Stmt, { k: "tool" }>, env: Env): void {
    this.declare(s.name, s.line);
    if (BUILTIN_TOOL_NAMES.has(s.name)) {
      throw new IonError(`'${s.name}' is already the name of a built-in agent tool.`, s.line, "Pick a different name.");
    }
    const fn = new IonFunction(s.name, s.params, s.body, env, s.doc);
    this.tools.set(s.name, fn);
    env.define(s.name, fn); // tools are also ordinary functions you can call yourself
  }

  private grantsOf(spec: AgentSpec): GrantNode[] {
    const grants: GrantNode[] = [];
    for (const a of spec.abilities) {
      if (a.kind === "files") grants.push({ kind: "file-access", scope: a.path, line: spec.line });
      else if (a.kind === "web") grants.push({ kind: "web-browsing", line: spec.line });
      else if (a.kind === "shell") grants.push({ kind: "shell-exec", line: spec.line });
      else if (a.kind === "gmail") grants.push({ kind: "gmail-access", scope: this.resolveSecret(a.token, spec, undefined), line: spec.line });
    }
    return grants;
  }

  private resolveSecret(s: Secret | undefined, spec: AgentSpec, fallbackEnv: string | undefined): string {
    if (s?.literal !== undefined) return s.literal;
    const name = s?.env ?? fallbackEnv;
    if (!name) throw new IonError(`Agent '${spec.name}' needs a secret but none was given.`, spec.line);
    const v = process.env[name];
    if (!v) {
      throw new IonError(
        `Agent '${spec.name}' needs the environment variable ${name}, but it isn't set.`,
        spec.line,
        `Set it in your terminal, or put ${name}=... in a file called .env next to your script.`
      );
    }
    return v;
  }

  private delegatedNames(): Set<string> {
    const out = new Set<string>();
    for (const a of this.agents.values()) for (const ab of a.abilities) if (ab.kind === "ask") ab.names.forEach((n) => out.add(n));
    for (const t of this.teams.values()) t.members.forEach((n) => out.add(n));
    return out;
  }

  private configFor(name: string, line: number): AgentConfig {
    const cached = this.configs.get(name);
    if (cached) return cached;

    const team = this.teams.get(name);
    const leadName = team ? team.lead : name;
    const spec = this.agents.get(leadName);
    if (!spec) {
      throw new IonError(
        team ? `Team '${name}' has a lead called '${leadName}', but no such agent exists.` : `I don't know an agent or team called '${name}'.`,
        team?.line ?? line,
        didYouMean(name, [...this.agents.keys(), ...this.teams.keys()])
      );
    }

    const asks = spec.abilities.flatMap((a) => (a.kind === "ask" ? a.names : []));
    const delegates = [...new Set([...asks, ...(team?.members ?? [])])].filter((n) => n !== name);
    for (const d of delegates) {
      if (!this.agents.has(d) && !this.teams.has(d)) {
        throw new IonError(`'${name}' is set up to work with '${d}', but there is no agent or team with that name.`, spec.line, didYouMean(d, [...this.agents.keys(), ...this.teams.keys()]));
      }
    }

    const toolNames = spec.abilities.flatMap((a) => (a.kind === "tools" ? a.names : []));
    const extraTools: ToolSpec[] = toolNames.map((t) => {
      const fn = this.tools.get(t);
      if (!fn) throw new IonError(`Agent '${spec.name}' can use a tool called '${t}', but no such tool exists.`, spec.line, didYouMean(t, this.tools.keys()) ?? `Define it with: tool ${t}(input):`);
      return {
        name: fn.name,
        description: fn.doc ?? `The ${fn.name} tool.`,
        parameters: {
          type: "object",
          properties: Object.fromEntries(fn.params.map((p) => [p, { type: "string", description: p }])),
          required: fn.params
        }
      };
    });

    const grants = this.grantsOf(spec);
    const infoFor = (n: string) => {
      const target = this.agents.get(this.teams.get(n)?.lead ?? n)!;
      return { name: n, grants: this.grantsOf(target).map((g) => g.kind) };
    };

    const config: AgentConfig = {
      name,
      provider: spec.custom
        ? { kind: "custom", ...spec.custom, line: spec.line }
        : { kind: "builtin", name: spec.provider, line: spec.line },
      // mock, demo and custom servers (such as a local model) may need no key at all
      apiKey: spec.provider === "mock" || spec.provider === "demo" || (spec.custom && !spec.key)
        ? ""
        : this.resolveSecret(spec.key, spec, DEFAULT_KEY_ENV[spec.provider]),
      model: spec.modelId ? { provider: spec.provider, modelId: spec.modelId } : undefined,
      grants,
      input: spec.input as AgentConfig["input"],
      output: spec.output as AgentConfig["output"],
      isOrchestrator: delegates.length > 0,
      teammates: delegates,
      teammateInfo: delegates.map(infoFor),
      role: spec.role,
      team: !!team,
      standalone: !this.delegatedNames().has(name) && !team,
      memory: spec.memory,
      extraTools: extraTools.length ? extraTools : undefined,
      runExtraTool: extraTools.length
        ? async (toolName, args) => {
            const fn = this.tools.get(toolName)!;
            const result = await this.callFunction(fn, fn.params.map((p) => args[p] ?? null), spec.line);
            return typeof result === "string" ? result : toJson(result);
          }
        : undefined
    };
    this.configs.set(name, config);
    return config;
  }

  private grantManagerFor(cfg: AgentConfig): GrantManager {
    let gm = this.grantManagers.get(cfg.name);
    if (!gm) {
      gm = new GrantManager(cfg.name, cfg.grants, (d) => this.opts.io.confirm(d), !!this.opts.autoYes);
      this.grantManagers.set(cfg.name, gm);
    }
    return gm;
  }

  /** Send one message to an agent or team and wait for its final answer. */
  async askNamed(name: string, prompt: string, line = 0, session = "main", depth = 0): Promise<string> {
    if (depth > MAX_DELEGATION_DEPTH) {
      throw new IonError("Agents are asking each other too many levels deep.", line, "Check that your agents don't delegate to each other in a circle.");
    }
    const cfg = this.configFor(name, line);
    const key = `${session}|${name}`;
    const remembers = cfg.memory !== false;
    const history = remembers ? this.histories.get(key) ?? [] : [];
    try {
      const { finalText, history: updated } = await runTurn(history, prompt, {
        agent: cfg,
        grantManager: this.grantManagerFor(cfg),
        onToolCall: (agent, tool, detail) => this.opts.io.note(`${agent} used ${tool} ${detail.length > 80 ? detail.slice(0, 77) + "..." : detail}`),
        delegate: cfg.isOrchestrator ? (n, task) => this.askNamed(n, task, line, session, depth + 1) : undefined
      });
      if (remembers) this.histories.set(key, updated);
      return finalText;
    } catch (e) {
      if (e instanceof IonError) throw e;
      throw new IonError(`Asking '${name}' failed: ${e instanceof Error ? e.message : String(e)}`, line);
    }
  }

  /** Used by `ion preview`: if the script never called `serve`, serve its last team (or first agent). */
  async serveDefault(port: number): Promise<boolean> {
    if (this.served) return true;
    const target = [...this.teams.keys()].at(-1) ?? [...this.agents.keys()][0];
    if (!target) return false;
    await this.serve(target, port, 0, this.globals);
    return true;
  }

  private async chat(target: string, line: number, env: Env): Promise<void> {
    const ref = this.lookup(target, env, line);
    if (!(ref instanceof AgentRef)) throw new IonError(`'${target}' isn't an agent or team, so I can't chat with it.`, line);
    this.configFor(ref.name, line); // fail fast on missing keys before the first prompt
    this.opts.io.say(`Chatting with ${ref.name}. Type "exit" to stop.`);
    for (;;) {
      const text = await this.opts.io.readLine("you> ");
      if (text === null) break;
      const msg = text.trim();
      if (!msg) continue;
      if (["exit", "quit", "bye"].includes(msg.toLowerCase())) break;
      try {
        this.opts.io.say(`${ref.name}> ${await this.askNamed(ref.name, msg, line, "chat")}`);
      } catch (e) {
        this.opts.io.say(`(error) ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private async serve(target: string, port: unknown, line: number, env: Env): Promise<void> {
    if (!this.opts.serve) throw new IonError("'serve' isn't available here.", line);
    this.served = true;
    const ref = this.lookup(target, env, line);
    if (!(ref instanceof AgentRef)) throw new IonError(`'${target}' isn't an agent or team, so I can't serve it.`, line);
    if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new IonError(`'${toText(port)}' isn't a valid port number.`, line, "Use a number from 1 to 65535, like: serve " + target + " on port 4310");
    }
    const names = [...this.agents.keys(), ...this.teams.keys()];
    const agents = names.map((n) => this.configFor(n, line));
    const entry = agents.find((a) => a.name === ref.name)!;
    if (entry.input.length === 0) entry.input = ["text"];
    if (entry.output.length === 0) entry.output = ["text"];
    await this.opts.serve({ type: "team", agents, entryPoints: [ref.name] }, port);
  }
}

export type { IonMap };
