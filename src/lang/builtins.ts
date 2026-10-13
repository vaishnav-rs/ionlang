import * as fs from "node:fs";
import { IonError } from "./errors.js";
import {
  AgentRef, Builtin, BuiltinCtx, Env, fromJson, isEqual, isMap, toJson, toText, truthy, typeName
} from "./values.js";

type Fn = (args: unknown[], ctx: BuiltinCtx) => unknown | Promise<unknown>;

function str(name: string, args: unknown[], i: number): string {
  const v = args[i];
  if (typeof v !== "string") throw new IonError(`${name}() needs text as input ${i + 1}, but got ${typeName(v)}.`, 0, "Use text(x) to turn a value into text.");
  return v;
}
function num(name: string, args: unknown[], i: number): number {
  const v = args[i];
  if (typeof v !== "number") throw new IonError(`${name}() needs a number as input ${i + 1}, but got ${typeName(v)}.`, 0, "Use number(x) to turn text into a number.");
  return v;
}
function list(name: string, args: unknown[], i: number): unknown[] {
  const v = args[i];
  if (!Array.isArray(v)) throw new IonError(`${name}() needs a list as input ${i + 1}, but got ${typeName(v)}.`);
  return v;
}
function arity(name: string, args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    const want = min === max ? `${min}` : `${min} to ${max}`;
    throw new IonError(`${name}() needs ${want} input${max === 1 ? "" : "s"} but got ${args.length}.`);
  }
}

const compare = (a: unknown, b: unknown): number =>
  typeof a === "number" && typeof b === "number" ? a - b : toText(a) < toText(b) ? -1 : toText(a) > toText(b) ? 1 : 0;

export function installBuiltins(env: Env): void {
  const def = (name: string, fn: Fn) => env.define(name, new Builtin(name, fn));

  // ---- text ----
  def("length", (a) => {
    arity("length", a, 1);
    const v = a[0];
    if (typeof v === "string" || Array.isArray(v)) return v.length;
    if (isMap(v)) return Object.keys(v).length;
    throw new IonError(`length() works on text, lists and maps, not ${typeName(v)}.`);
  });
  def("upper", (a) => (arity("upper", a, 1), str("upper", a, 0).toUpperCase()));
  def("lower", (a) => (arity("lower", a, 1), str("lower", a, 0).toLowerCase()));
  def("trim", (a) => (arity("trim", a, 1), str("trim", a, 0).trim()));
  def("split", (a) => {
    arity("split", a, 1, 2);
    const s = str("split", a, 0);
    return a.length === 2 ? s.split(str("split", a, 1)) : s.split(/\s+/).filter(Boolean);
  });
  def("lines", (a) => (arity("lines", a, 1), str("lines", a, 0).split(/\r?\n/)));
  def("join", (a) => {
    arity("join", a, 1, 2);
    return list("join", a, 0).map(toText).join(a.length === 2 ? str("join", a, 1) : ", ");
  });
  def("replace", (a) => (arity("replace", a, 3), str("replace", a, 0).split(str("replace", a, 1)).join(str("replace", a, 2))));
  def("text", (a) => (arity("text", a, 1), toText(a[0])));
  def("number", (a) => {
    arity("number", a, 1);
    if (typeof a[0] === "number") return a[0];
    const n = Number(String(a[0]).trim());
    if (String(a[0]).trim() === "" || Number.isNaN(n)) throw new IonError(`I can't turn ${JSON.stringify(toText(a[0]))} into a number.`);
    return n;
  });
  def("type_of", (a) => (arity("type_of", a, 1), typeName(a[0])));

  // ---- math ----
  def("round", (a) => {
    arity("round", a, 1, 2);
    const p = 10 ** (a.length === 2 ? num("round", a, 1) : 0);
    return Math.round(num("round", a, 0) * p) / p;
  });
  def("floor", (a) => (arity("floor", a, 1), Math.floor(num("floor", a, 0))));
  def("ceil", (a) => (arity("ceil", a, 1), Math.ceil(num("ceil", a, 0))));
  def("abs", (a) => (arity("abs", a, 1), Math.abs(num("abs", a, 0))));
  const numbersOf = (name: string, a: unknown[]): number[] => {
    const xs = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
    xs.forEach((x) => { if (typeof x !== "number") throw new IonError(`${name}() only works on numbers, but got ${typeName(x)}.`); });
    return xs as number[];
  };
  def("min", (a) => Math.min(...numbersOf("min", a)));
  def("max", (a) => Math.max(...numbersOf("max", a)));
  def("sum", (a) => numbersOf("sum", a).reduce((x, y) => x + y, 0));
  def("random", (a) => {
    arity("random", a, 2);
    const lo = num("random", a, 0), hi = num("random", a, 1);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  });

  // ---- lists & maps ----
  def("range", (a) => {
    arity("range", a, 1, 2);
    const [lo, hi] = a.length === 1 ? [0, num("range", a, 0)] : [num("range", a, 0), num("range", a, 1)];
    return Array.from({ length: Math.max(0, hi - lo) }, (_, i) => lo + i);
  });
  def("keys", (a) => (arity("keys", a, 1), Object.keys(isMap(a[0]) ? a[0] : {})));
  def("values", (a) => (arity("values", a, 1), Object.values(isMap(a[0]) ? a[0] : {})));
  def("first", (a) => (arity("first", a, 1), list("first", a, 0)[0] ?? null));
  def("last", (a) => (arity("last", a, 1), list("last", a, 0).at(-1) ?? null));
  def("sort", (a) => (arity("sort", a, 1), [...list("sort", a, 0)].sort(compare)));
  def("reverse", (a) => (arity("reverse", a, 1), [...list("reverse", a, 0)].reverse()));
  def("unique", (a) => (arity("unique", a, 1), list("unique", a, 0).filter((x, i, xs) => xs.findIndex((y) => isEqual(x, y)) === i)));
  def("slice", (a) => {
    arity("slice", a, 2, 3);
    const end = a.length === 3 ? num("slice", a, 2) : undefined;
    const v = a[0];
    if (typeof v === "string" || Array.isArray(v)) return v.slice(num("slice", a, 1), end);
    throw new IonError(`slice() works on text and lists, not ${typeName(v)}.`);
  });
  def("map", async (a, ctx) => {
    arity("map", a, 2);
    const out: unknown[] = [];
    for (const x of list("map", a, 0)) out.push(await ctx.call(a[1], [x]));
    return out;
  });
  def("filter", async (a, ctx) => {
    arity("filter", a, 2);
    const out: unknown[] = [];
    for (const x of list("filter", a, 0)) if (truthy(await ctx.call(a[1], [x]))) out.push(x);
    return out;
  });

  // ---- data ----
  def("json", (a) => {
    arity("json", a, 1);
    const s = str("json", a, 0);
    try {
      return fromJson(JSON.parse(s));
    } catch {
      // models often wrap JSON in a ```json fence or add chatter around it
      const m = s.match(/```(?:json)?\s*([\s\S]*?)```/) ?? s.match(/([\[{][\s\S]*[\]}])/);
      if (m) {
        try { return fromJson(JSON.parse(m[1])); } catch { /* fall through */ }
      }
      throw new IonError("That text isn't valid JSON.", 0, "json() reads text like {\"a\": 1}.");
    }
  });
  def("to_json", (a) => (arity("to_json", a, 1, 2), toJson(a[0], a.length === 2 && truthy(a[1]))));

  // ---- world ----
  def("now", () => new Date().toISOString());
  def("today", () => new Date().toISOString().slice(0, 10));
  def("env", (a) => (arity("env", a, 1), process.env[str("env", a, 0)] ?? null));
  def("sleep", (a) => new Promise((r) => setTimeout(() => r(null), num("sleep", a, 0) * 1000)));
  def("read_file", (a) => {
    arity("read_file", a, 1);
    try { return fs.readFileSync(str("read_file", a, 0), "utf-8"); }
    catch (e) { throw new IonError(`I couldn't read '${a[0]}': ${(e as Error).message}`); }
  });
  def("write_file", (a) => {
    arity("write_file", a, 2);
    try { fs.writeFileSync(str("write_file", a, 0), toText(a[1])); return null; }
    catch (e) { throw new IonError(`I couldn't write '${a[0]}': ${(e as Error).message}`); }
  });
  def("fetch", async (a) => {
    arity("fetch", a, 1);
    const url = str("fetch", a, 0);
    const res = await fetch(url);
    if (!res.ok) throw new IonError(`Fetching ${url} failed with status ${res.status}.`);
    return res.text();
  });

  // ---- agents ----
  def("ask_all", async (a, ctx) => {
    arity("ask_all", a, 2);
    const targets = list("ask_all", a, 0);
    targets.forEach((t) => { if (!(t instanceof AgentRef)) throw new IonError(`ask_all() needs a list of agents or teams, but got ${typeName(t)} in it.`); });
    return ctx.askAll(targets, toText(a[1]));
  });
}
