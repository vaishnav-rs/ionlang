import { Stmt } from "./ast.js";

export class Env {
  private vars = new Map<string, unknown>();
  constructor(readonly parent?: Env) {}

  has(name: string): boolean {
    return this.vars.has(name) || (this.parent?.has(name) ?? false);
  }
  get(name: string): unknown {
    if (this.vars.has(name)) return this.vars.get(name);
    return this.parent?.get(name);
  }
  define(name: string, value: unknown): void {
    this.vars.set(name, value);
  }
  /** Update the nearest existing variable, otherwise create it here. */
  assign(name: string, value: unknown): void {
    for (let e: Env | undefined = this; e; e = e.parent) {
      if (e.vars.has(name)) {
        e.vars.set(name, value);
        return;
      }
    }
    this.vars.set(name, value);
  }
  names(): string[] {
    return [...this.vars.keys(), ...(this.parent?.names() ?? [])];
  }
}

export interface BuiltinCtx {
  line: number;
  /** Folder of the script being run, for resolving relative paths. */
  baseDir: string;
  call(fn: unknown, args: unknown[]): Promise<unknown>;
  askAll(agents: unknown[], prompt: string): Promise<string[]>;
}

export class IonFunction {
  constructor(
    readonly name: string,
    readonly params: string[],
    readonly body: Stmt[],
    readonly closure: Env,
    readonly doc?: string
  ) {}
}

export class Builtin {
  constructor(
    readonly name: string,
    readonly fn: (args: unknown[], ctx: BuiltinCtx) => unknown | Promise<unknown>
  ) {}
}

export class AgentRef {
  constructor(readonly kind: "agent" | "team", readonly name: string) {}
}

export class ReturnSignal {
  constructor(readonly value: unknown) {}
}
export class BreakSignal {}
export class ContinueSignal {}

export type IonMap = Record<string, unknown>;
export const newMap = (): IonMap => Object.create(null) as IonMap;

export const isMap = (v: unknown): v is IonMap =>
  typeof v === "object" && v !== null && !Array.isArray(v) &&
  !(v instanceof IonFunction) && !(v instanceof Builtin) && !(v instanceof AgentRef);

export function fromJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(fromJson);
  if (v && typeof v === "object") {
    const m = newMap();
    for (const [k, x] of Object.entries(v)) m[k] = fromJson(x);
    return m;
  }
  return v === undefined ? null : v;
}

export function toJson(v: unknown, pretty = false): string {
  const plain = (x: unknown): unknown => {
    if (x instanceof IonFunction || x instanceof Builtin || x instanceof AgentRef) return toText(x);
    if (Array.isArray(x)) return x.map(plain);
    if (isMap(x)) return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, plain(y)]));
    return x;
  };
  return JSON.stringify(plain(v), null, pretty ? 2 : undefined) ?? "null";
}

export function toText(v: unknown): string {
  if (v === null || v === undefined) return "nothing";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toFixed(10));
  if (Array.isArray(v)) return `[${v.map((x) => (typeof x === "string" ? JSON.stringify(x) : toText(x))).join(", ")}]`;
  if (v instanceof IonFunction || v instanceof Builtin) return `<function ${v.name}>`;
  if (v instanceof AgentRef) return `<${v.kind} ${v.name}>`;
  return toJson(v);
}

export function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isMap(v)) return Object.keys(v).length > 0;
  return true;
}

export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => isEqual(x, b[i]));
  if (isMap(a) && isMap(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && isEqual(a[k], b[k]));
  }
  return false;
}

export function typeName(v: unknown): string {
  if (v === null || v === undefined) return "nothing";
  if (typeof v === "string") return "text";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "yes/no";
  if (Array.isArray(v)) return "list";
  if (v instanceof IonFunction || v instanceof Builtin) return "function";
  if (v instanceof AgentRef) return v.kind;
  return "map";
}
