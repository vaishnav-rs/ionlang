import { describe, it, expect } from "vitest";
import { riskyCombination } from "../src/lang/risk.js";
import { check } from "../src/lang/check.js";
import { parse } from "../src/lang/parser.js";
import { Interpreter, IonIO } from "../src/lang/interpreter.js";

const io: IonIO = { say: () => undefined, note: () => undefined, readLine: async () => null, confirm: async () => false };

describe("which ability combinations are refused", () => {
  it.each([
    [["files", "web"]],
    [["gmail", "web"]],
    [["search", "web"]],
    [["files", "shell"]],
    [["shell", "web"]],
  ])("refuses %j", (kinds) => {
    expect(riskyCombination(kinds as any)).toMatch(/Split it into two agents/);
  });

  it.each([
    [["files"]],
    [["web"]],
    [["shell"]],
    [["files", "search"]],
    [["gmail", "files"]],
    [[]],
  ])("allows %j", (kinds) => {
    expect(riskyCombination(kinds as any)).toBeUndefined();
  });
});

describe("the rule in scripts", () => {
  const reader = `agent reader:
    model "mock"
    can access files in "./notes"

agent browser:
    model "mock"
    can browse web
`;

  it("allows two agents that split the work", () => {
    expect(check(parse(reader + '\nteam both:\n    lead reader\n    members browser\n'))).toEqual([]);
  });

  it("the checker refuses one agent that reads files and browses", () => {
    const problems = check(parse('agent both:\n    model "mock"\n    can access files in "./notes"\n    can browse web\n'));
    expect(problems.map((p) => p.message).join("\n")).toMatch(/can read private things/);
  });

  it("the interpreter refuses it too, before anything runs", async () => {
    await expect(
      new Interpreter({ io }).runSource('agent both:\n    model "mock"\n    can access files in "./notes"\n    can browse web\n')
    ).rejects.toThrow(/Split it into two agents/);
  });

  it("refuses an agent that can run commands and browse the web", async () => {
    await expect(
      new Interpreter({ io }).runSource('agent both:\n    model "mock"\n    can run commands\n    can browse web\n')
    ).rejects.toThrow(/send data out/);
  });
});
