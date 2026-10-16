import { describe, it, expect } from "vitest";
import { Interpreter, IonIO, TestResult } from "../src/lang/interpreter.js";
import { formatSource } from "../src/lang/format.js";

function io(out: string[]): IonIO {
  return {
    say: (t) => void out.push(t),
    note: () => undefined,
    readLine: async () => null,
    confirm: async () => false
  };
}

async function tests(src: string): Promise<TestResult[]> {
  return new Interpreter({ io: io([]), collectTests: true }).runTests(src);
}

describe("test blocks", () => {
  it("passes a test whose asserts hold", async () => {
    const r = await tests(`
test "adds":
    assert 2 plus 2 is 4
    assert "a" is "a"
`);
    expect(r).toEqual([{ name: "adds", ok: true }]);
  });

  it("reports the expected and actual values for 'is'", async () => {
    const r = await tests(`
set total to 5
test "total":
    assert total is 6
`);
    expect(r[0].ok).toBe(false);
    expect(r[0].message).toBe("I expected 6, but it was 5.");
    expect(r[0].line).toBe(4);
  });

  it("shows text values in quotes", async () => {
    const r = await tests(`
test "name":
    assert "Ada" is "Bob"
`);
    expect(r[0].message).toBe('I expected "Bob", but it was "Ada".');
  });

  it("fails a test on a plain false condition and keeps running the others", async () => {
    const r = await tests(`
test "first":
    assert no
test "second":
    assert yes
`);
    expect(r.map((x) => x.ok)).toEqual([false, true]);
    expect(r[0].message).toBe("This check is not true.");
  });

  it("fails a test on any other error inside it", async () => {
    const r = await tests(`
test "broken":
    say missing_name
`);
    expect(r[0].ok).toBe(false);
    expect(r[0].message).toMatch(/missing_name/);
  });

  it("is skipped when the script runs normally", async () => {
    const out: string[] = [];
    await new Interpreter({ io: io(out) }).runSource(`
say "start"
test "never runs":
    say "inside test"
    assert no
say "end"
`);
    expect(out).toEqual(["start", "end"]);
  });

  it("refuses to start a server inside a test", async () => {
    const r = await tests(`
test "serving":
    serve helper
`);
    expect(r[0].message).toMatch(/doesn't run inside 'ion test'/);
  });

  it("can use the mock agent", async () => {
    const r = await tests(`
agent helper:
    model "mock"
test "agent replies":
    assert ask helper "hi" is "mock reply: hi"
`);
    expect(r[0].ok).toBe(true);
  });
});

describe("test and assert stay ordinary names elsewhere", () => {
  it("lets a variable be called test or assert", async () => {
    const out: string[] = [];
    await new Interpreter({ io: io(out) }).runSource(`
set test to 3
set assert to test plus 1
say assert
say test
`);
    expect(out).toEqual(["4", "3"]);
  });
});

describe("formatSource", () => {
  it("re-indents to 4 spaces per level", () => {
    const src = "if yes:\n  say 1\n  if no:\n    say 2\n";
    expect(formatSource(src)).toBe("if yes:\n    say 1\n    if no:\n        say 2\n");
  });

  it("leaves a list that spans lines as written", () => {
    const src = "set xs to [\n      1,\n   2\n]\n";
    expect(formatSource(src)).toBe(src);
  });

  it("keeps triple-quoted text exactly", () => {
    const src = 'set p to """\n      keep   me\n# not a comment\n\n\n    """\n';
    expect(formatSource(src)).toBe(src);
  });

  it("indents comments with the code after them and collapses blank lines", () => {
    const src = "if yes:\n    say 1\n\n\n\n# note\n    say 2\n";
    expect(formatSource(src)).toBe("if yes:\n    say 1\n\n    # note\n    say 2\n");
  });

  it("removes trailing spaces, normalises line endings, and ends with one newline", () => {
    expect(formatSource("say 1   \r\n\r\n")).toBe("say 1\n");
  });

  it("refuses a script with errors instead of tidying it", () => {
    expect(() => formatSource("set  x to   1\n  say x\n")).toThrow(/indented but nothing above/);
  });

  it("is stable when run twice", () => {
    const once = formatSource("to f(x):\n  give back x times 2\n\n\n\nsay f(3)  \n");
    expect(formatSource(once)).toBe(once);
  });
});
