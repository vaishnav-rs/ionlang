import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/lang/parser.js";
import { Interpreter, IonIO } from "../src/lang/interpreter.js";

/**
 * Every example in the README must be real Ion. Each ```ion block must parse. A block that
 * uses only the offline "mock" model and needs no input or server runs for real, and when a
 * plain output block directly follows it, that output must match what the program prints.
 */
const readme = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "README.md"), "utf-8");
const ionBlocks = [...readme.matchAll(/```ion\n([\s\S]*?)```/g)].map((m) => m[1]);

/** Blocks that need a person, a server, a real model or another file cannot run in a test. */
function runnable(src: string): boolean {
  const models = [...src.matchAll(/model "([^"]*)"/g)].map((m) => m[1]);
  // a PDF, an outside server or another file is needed for these, so they are only checked for syntax
  const needsSomethingElse = /ask user|serve |chat with|use "|^rag |^mcp /m.test(src);
  return models.every((m) => m === "mock") && !needsSomethingElse;
}

async function printed(src: string): Promise<string[]> {
  const out: string[] = [];
  const io: IonIO = {
    say: (t) => void out.push(t),
    note: () => undefined,
    readLine: async () => null,
    confirm: async () => false
  };
  await new Interpreter({ io }).runSource(src);
  return out;
}

describe("README examples", () => {
  it("has examples to check", () => {
    expect(ionBlocks.length).toBeGreaterThan(15);
  });

  it.each(ionBlocks.map((b, i) => [i, b]))("example %i is valid Ion", (_i, block) => {
    expect(() => parse(block as string)).not.toThrow();
  });

  it("the examples that use the offline model run", async () => {
    const runs = ionBlocks.filter(runnable);
    expect(runs.length).toBeGreaterThan(5);
    for (const src of runs) await expect(printed(src)).resolves.toBeDefined();
  });

  it("the printed output shown after an example matches what the program prints", async () => {
    // a ```ion block immediately followed by a plain ``` output block
    // each part stops at the first closing fence, so a match can never run into a later block
    const pairs = [...readme.matchAll(/```ion\n((?:(?!```)[\s\S])*)```\n\n```\n((?:(?!```)[\s\S])*)```/g)];
    let checked = 0;
    for (const [, src, expected] of pairs) {
      if (!runnable(src)) continue;
      const lines = await printed(src);
      expect(lines.join("\n").trim()).toBe(expected.trim());
      checked++;
    }
    expect(checked).toBeGreaterThan(4);
  });
});
