import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/lang/parser.js";
import { Interpreter, IonIO } from "../src/lang/interpreter.js";

const spec = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "SPEC.md"), "utf-8");
const ionBlocks = [...spec.matchAll(/```ion\n([\s\S]*?)```/g)].map((m) => m[1]);

const io: IonIO = {
  say: () => undefined,
  note: () => undefined,
  readLine: async () => null,
  confirm: async () => false
};

describe("SPEC.md", () => {
  it("has example code", () => {
    expect(ionBlocks.length).toBeGreaterThan(10);
  });

  it.each(ionBlocks.map((b, i) => [i, b]))("example %i parses", (_i, block) => {
    expect(() => parse(block as string)).not.toThrow();
  });

  it("its testing example passes and fails as described", async () => {
    const block = ionBlocks.find((b) => b.includes('test "doubling works"'));
    expect(block).toBeDefined();
    const results = await new Interpreter({ io, collectTests: true }).runTests(block!);
    expect(results.map((r) => [r.name, r.ok])).toEqual([
      ["doubling works", true],
      ["a deliberate failure", false]
    ]);
    expect(results[1].message).toBe("I expected 9, but it was 8.");
  });
});
