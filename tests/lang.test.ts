import { describe, it, expect } from "vitest";
import { tokenize } from "../src/lang/lexer.js";
import { parse } from "../src/lang/parser.js";
import { check } from "../src/lang/check.js";
import { Interpreter, IonIO } from "../src/lang/interpreter.js";
import { IonError } from "../src/lang/errors.js";

interface Result { out: string[]; notes: string[]; confirms: string[] }

async function run(src: string, opts: { inputs?: string[]; yes?: boolean; confirm?: boolean } = {}): Promise<Result> {
  const out: string[] = [];
  const notes: string[] = [];
  const confirms: string[] = [];
  const inputs = [...(opts.inputs ?? [])];
  const io: IonIO = {
    say: (t) => void out.push(t),
    note: (t) => void notes.push(t),
    readLine: async () => inputs.shift() ?? null,
    confirm: async (d) => (confirms.push(`${d.agent}:${d.grant}`), opts.confirm ?? true)
  };
  await new Interpreter({ io, autoYes: opts.yes }).runSource(src);
  return { out, notes, confirms };
}

async function err(src: string): Promise<IonError> {
  try {
    await run(src);
  } catch (e) {
    if (e instanceof IonError) return e;
    throw e;
  }
  throw new Error("expected an IonError but the program succeeded");
}

describe("lexer", () => {
  it("emits indent/dedent and ignores comments and blank lines", () => {
    const types = tokenize("if x:\n    # note\n\n    say 1\nsay 2\n").map((t) => t.type);
    expect(types).toEqual(["word", "word", "op", "newline", "indent", "word", "number", "newline", "dedent", "word", "number", "newline", "eof"]);
  });

  it("splits interpolation parts only when { is followed by a letter", () => {
    const [str] = tokenize('"Hi {name}! {\\"a\\": 1} \\{x}"');
    expect(str.parts).toEqual(["Hi ", { expr: "name", line: 1 }, '! {"a": 1} {x}']);
  });

  it("reads triple-quoted text and removes common indentation", () => {
    const [str] = tokenize('"""\n    line one\n      line two\n    """');
    expect(str.parts).toEqual(["line one\n  line two"]);
  });

  it("ignores newlines inside brackets", () => {
    const types = tokenize("set x to [\n  1,\n  2\n]\n").map((t) => t.type);
    expect(types).not.toContain("indent");
  });

  it("rejects bad indentation and unclosed text", () => {
    expect(() => tokenize("if x:\n        a\n    b\n")).toThrow(/indented differently/);
    expect(() => tokenize('say "oops\n')).toThrow(/never closed/);
  });
});

describe("language basics", () => {
  it("variables, arithmetic and text", async () => {
    const r = await run(`
set a to 2
set b to 3
say a + b * 2
say "{a} plus {b} is {a + b}"
say a plus b times 2
say 10 divided by 4
say 7 mod 3
say "ab" + 1
`);
    expect(r.out).toEqual(["8", "2 plus 3 is 5", "8", "2.5", "1", "ab1"]);
  });

  it("comparisons in plain English", async () => {
    const r = await run(`
set n to 5
say n is 5
say n is not 5
say n is greater than 3
say n is less than 3
say n is at least 5
say n is at most 4
say "hello" contains "ell"
say "hello" starts with "he"
say "hello" ends with "lo"
say 2 is in [1, 2, 3]
say [1, 2] does not contain 3
say not (n is 5)
say nothing or "fallback"
`);
    expect(r.out).toEqual(["yes", "no", "yes", "no", "yes", "no", "yes", "yes", "yes", "yes", "yes", "no", "fallback"]);
  });

  it("if / otherwise if / otherwise", async () => {
    const r = await run(`
to grade(score):
    if score is at least 90:
        give back "A"
    otherwise if score is at least 80:
        give back "B"
    otherwise:
        give back "C"
say grade(95)
say grade(85)
say grade(10)
`);
    expect(r.out).toEqual(["A", "B", "C"]);
  });

  it("loops: repeat, for each, while, stop, skip", async () => {
    const r = await run(`
set total to 0
repeat 3 times:
    set total to total + 1
say total
for each n in [1, 2, 3, 4, 5]:
    if n is 2:
        skip
    if n is 5:
        stop
    say n
set i to 0
while i is less than 2:
    set i to i + 1
say i
repeat forever:
    set i to i + 1
    if i is 10:
        stop
say i
`);
    expect(r.out).toEqual(["3", "1", "3", "4", "2", "10"]);
  });

  it("lists, maps, indexing, add and remove", async () => {
    const r = await run(`
set xs to [10, 20]
add 30 to xs
remove 10 from xs
say xs
say xs[0]
say xs[-1]
set person to {name: "Ada", age: 36}
set person.age to 37
set person["city"] to "London"
say person.name + " " + person.age + " " + person.city
say keys(person)
say length(xs)
set xs[0] to 99
say xs
say person.missing
`);
    expect(r.out).toEqual(["[20, 30]", "20", "30", "Ada 37 London", '["name", "age", "city"]', "2", "[99, 30]", "nothing"]);
  });

  it("functions, recursion and closures over globals", async () => {
    const r = await run(`
set base to 100
to fact(n):
    if n is at most 1:
        give back 1
    give back n * fact(n - 1)
to add_base(x):
    give back x + base
say fact(5)
say add_base(1)
`);
    expect(r.out).toEqual(["120", "101"]);
  });

  it("try / on error", async () => {
    const r = await run(`
try:
    say 1 / 0
on error:
    say "caught: " + error
try:
    say number("abc")
on error as problem:
    say "bad: " + problem
`);
    expect(r.out[0]).toBe("caught: You can't divide by zero.");
    expect(r.out[1]).toMatch(/^bad: I can't turn "abc" into a number/);
  });

  it("builtins: map, filter, sort, join, split, json", async () => {
    const r = await run(`
to double(x):
    give back x * 2
to big(x):
    give back x is greater than 2
say map([1, 2, 3], double)
say filter([1, 2, 3, 4], big)
say sort([3, 1, 2])
say join(["a", "b"], "-")
say split("a b  c")
say json('{"a": [1, 2]}').a[1]
say to_json({x: 1})
say upper("abc") + lower("DEF")
say round(2.567, 2)
say sum([1, 2, 3])
say range(3)
`);
    expect(r.out).toEqual(["[2, 4, 6]", "[3, 4]", "[1, 2, 3]", "a-b", '["a", "b", "c"]', "2", '{"x":1}', "ABCdef", "2.57", "6", "[0, 1, 2]"]);
  });

  it("ask user reads input", async () => {
    const r = await run(`set name to ask user "Name?"\nsay "Hi " + name`, { inputs: ["Ada"] });
    expect(r.out).toEqual(["Hi Ada"]);
  });
});

describe("friendly errors", () => {
  it("suggests the closest name for a typo", async () => {
    const e = await err("set total to 1\nsay totl");
    expect(e.message).toMatch(/don't know anything called 'totl'/);
    expect(e.hint).toBe("Did you mean 'total'?");
    expect(e.line).toBe(2);
  });

  it("explains wrong types", async () => {
    const e = await err('say "a" - 1');
    expect(e.message).toMatch(/can't subtract text and number/);
  });

  it("points at the right line inside functions", async () => {
    const e = await err("to f(x):\n    say 1\n    say x.y.z\nf(5)");
    expect(e.line).toBe(3);
  });

  it("checks function arity", async () => {
    expect((await err("to f(a, b):\n    give back a\nf(1)")).message).toMatch(/needs 2 inputs but got 1/);
  });

  it("parse errors are readable", () => {
    expect(() => parse("if x\n    say 1")).toThrow(/I expected ':'/);
    expect(() => parse("set x = 5")).toThrow(/uses 'to' instead of '='/);
    expect(() => parse("sy 5")).toThrow(/don't know how to start a line with 'sy'/);
    expect(() => parse("agent a:\n    modle \"x\"")).toThrow(/agent setting 'modle'/);
    expect(() => parse("agent a:\n    can fly")).toThrow(/ability 'fly'/);
    expect(() => parse("say 1 +")).toThrow(/expected a value/);
  });

  it("reports stop outside a loop", async () => {
    expect((await err("stop")).message).toMatch(/only work inside a loop/);
  });

  it("guards against runaway recursion", async () => {
    expect((await err("to f():\n    f()\nf()")).message).toMatch(/too deeply/);
  });
});

describe("agents", () => {
  it("asks an agent and keeps conversation memory per agent", async () => {
    const r = await run(`
agent a:
    model "mock"
say ask a "one"
say ask a "two"
`);
    expect(r.out).toEqual(["mock reply: one", "mock reply: two"]);
  });

  it("rejects unknown providers and missing models", async () => {
    expect((await err('agent a:\n    model "gemni/x"')).hint).toMatch(/gemini/);
    expect((await err("agent a:\n    role \"hi\"")).message).toMatch(/needs a model/);
  });

  it("explains a missing API key", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const e = await err('agent a:\n    model "openai/gpt-4o-mini"\nsay ask a "hi"');
      expect(e.message).toMatch(/needs the environment variable OPENAI_API_KEY/);
      expect(e.hint).toMatch(/\.env/);
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });

  it("agents can use custom tools written in Ion", async () => {
    const r = await run(`
tool shout(text):
    describe "Makes text loud"
    give back upper(text) + "!"
agent a:
    model "mock"
    can use shout
say ask a 'CALL shout {"text": "hey"}'
say shout("direct call works too")
`);
    expect(r.out).toEqual(["Done: HEY!", "DIRECT CALL WORKS TOO!"]);
    expect(r.notes[0]).toMatch(/a used shout/);
  });

  it("a lead agent can delegate to a teammate", async () => {
    const r = await run(`
agent boss:
    model "mock"
    can ask worker
agent worker:
    model "mock"
say ask boss 'CALL delegate_to_worker {"task": "do it"}'
`);
    expect(r.out).toEqual(["Done: mock reply: do it"]);
    expect(r.notes.some((n) => n.includes("delegate_to_worker"))).toBe(true);
  });

  it("teams delegate from the lead to members", async () => {
    const r = await run(`
agent boss:
    model "mock"
agent a:
    model "mock"
agent b:
    model "mock"
team crew:
    lead boss
    members a, b
say ask crew 'CALL delegate_to_b {"task": "ping"}'
`);
    expect(r.out).toEqual(["Done: mock reply: ping"]);
  });

  it("ask_all runs several agents and returns a list", async () => {
    const r = await run(`
agent a:
    model "mock"
agent b:
    model "mock"
say ask_all([a, b], "hi")
`);
    expect(r.out).toEqual(['["mock reply: hi", "mock reply: hi"]']);
  });

  it("'forgets' turns memory off", async () => {
    const r = await run(`
agent a:
    model "mock"
    forgets everything between asks
say ask a "x"
say ask a "y"
`);
    expect(r.out).toEqual(["mock reply: x", "mock reply: y"]);
  });

  it("prompts can be built from multi-line text and variables", async () => {
    const r = await run(`
set topic to "cats"
agent a:
    model "mock"
    role """
        You are an expert.
        Topic: {topic}
        """
say ask a "Tell me about " + topic
`);
    expect(r.out).toEqual(["mock reply: Tell me about cats"]);
  });

  it("'chat with' loops until exit", async () => {
    const r = await run(`
agent a:
    model "mock"
chat with a
`, { inputs: ["hello", "", "exit", "never read"] });
    expect(r.out).toEqual(['Chatting with a. Type "exit" to stop.', "a> mock reply: hello"]);
  });

  it("asks permission before an agent runs commands, and honours a no", async () => {
    const src = `
agent a:
    model "mock"
    can run commands
say ask a 'CALL run_command {"command": "echo hi"}'
`;
    const denied = await run(src, { confirm: false });
    expect(denied.confirms).toEqual(["a:shell-exec"]);
    expect(denied.out[0]).toMatch(/denied/);
    const approved = await run(src, { yes: true });
    expect(approved.confirms).toEqual([]);
    expect(approved.out[0]).toMatch(/hi/);
  });
});

describe("check", () => {
  const problems = (src: string) => check(parse(src)).map((d) => d.message);

  it("passes a good program", () => {
    expect(problems('agent a:\n    model "mock"\nsay ask a "hi"')).toEqual([]);
  });

  it("finds unknown abilities, teams and ask targets", () => {
    const msgs = problems(`
agent boss:
    model "mock"
    can ask wrker
    can use missing_tool
agent worker:
    model "gemni/x"
team t:
    lead nobody
    members worker
say ask wrker "x"
`);
    expect(msgs.join("\n")).toMatch(/can ask 'wrker'/);
    expect(msgs.join("\n")).toMatch(/can use 'missing_tool'/);
    expect(msgs.join("\n")).toMatch(/provider 'gemni'/);
    expect(msgs.join("\n")).toMatch(/lead 'nobody'/);
    expect(msgs.join("\n")).toMatch(/anything called 'wrker'/);
  });

  it("flags duplicate names", () => {
    expect(problems('agent a:\n    model "mock"\nagent a:\n    model "mock"').join()).toMatch(/already used/);
  });
});

describe("inline API keys", () => {
  it("parses key, key is, apikey and key from env", () => {
    for (const line of ['key "k1"', 'key is "k2"', 'apikey "k3"', 'apikey is "k4"', 'key from env "X"']) {
      expect(() => parse(`agent a:\n    model "openai/x"\n    ${line}`)).not.toThrow();
    }
  });

  it("uses a key written in the program, with no environment variable needed", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const realFetch = globalThis.fetch;
    let auth = "";
    globalThis.fetch = (async (_url: unknown, init: any) => {
      auth = init.headers.Authorization;
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi back", tool_calls: [] } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const r = await run('agent a:\n    model "openai/gpt-4o-mini"\n    apikey is "sk-inline-123"\nsay ask a "hi"');
      expect(r.out).toEqual(["hi back"]);
      expect(auth).toBe("Bearer sk-inline-123");
    } finally {
      globalThis.fetch = realFetch;
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });

  it("accepts a key held in a variable", async () => {
    const r = await run('set secret to "abc"\nagent a:\n    model "mock"\n    key secret\nsay ask a "ok"');
    expect(r.out).toEqual(["mock reply: ok"]);
  });
});

describe("http, encoding, time and env built-ins", () => {
  it("encodes and decodes base64 and URLs (including URL-safe base64)", async () => {
    const r = await run(`
say base64_encode("héllo ✓")
say base64_decode(base64_encode("héllo ✓"))
say base64_decode("aGk_Pz8-")
say url_encode("a b&c=d/é")
`);
    expect(r.out).toEqual(["aMOpbGxvIOKckw==", "héllo ✓", "hi???>", "a%20b%26c%3Dd%2F%C3%A9"]);
  });

  it("date helpers", async () => {
    const r = await run(`
say weekday("2026-10-13")
say add_days("2026-10-31", 1)
say add_days("2026-03-01", -1)
say day_start("2026-10-13") starts with "2026-10-13T00:00:00"
say length(now_local()) is 25
say type_of(timezone())
say time() is greater than 1700000000
`);
    expect(r.out).toEqual(["Tuesday", "2026-11-01", "2026-02-28", "yes", "yes", "text", "yes"]);
  });

  it("load_env reads .env and .properties files without overriding or leaking values", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ion-env-"));
    fs.writeFileSync(path.join(dir, "a.properties"), "# comment\nsdk.dir=C\:\\x\nION_T_ONE=1\nexport ION_T_TWO='two words'\nION_T_KEEP=file\n");
    process.env.ION_T_KEEP = "shell";
    try {
      const r = await run(`say load_env(${JSON.stringify(path.join(dir, "a.properties"))})\nsay env("ION_T_ONE")\nsay env("ION_T_TWO")\nsay env("ION_T_KEEP")`);
      expect(r.out).toEqual(["2", "1", "two words", "shell"]);
      const e = await err('say load_env("/definitely/not/here.env")');
      expect(e.message).toMatch(/couldn't read/);
    } finally {
      delete process.env.ION_T_ONE; delete process.env.ION_T_TWO; delete process.env.ION_T_KEEP;
    }
  });

  it("http: methods, headers, bearer, query, JSON and form bodies, parsed JSON, non-2xx without throwing", async () => {
    const http = await import("node:http");
    const seen: any[] = [];
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, ct: req.headers["content-type"], x: req.headers["x-test"], body });
        if (req.url!.startsWith("/missing")) { res.writeHead(404); res.end("nope"); return; }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ hello: "world", n: [1, 2] }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(srv.address() as any).port}`;
    try {
      const r = await run(`
set a to http("GET", "${base}/x", {query: {q: "a b", n: 2}, headers: {"X-Test": "yes"}, bearer: "tok"})
say a.status
say a.ok
say a.json.hello + " " + a.json.n[1]
set b to http("POST", "${base}/y", {body: {k: "v"}})
say b.status
set c to http("POST", "${base}/z", {form: {grant_type: "refresh_token", code: "a b"}})
say c.json.hello
set d to http("GET", "${base}/missing")
say d.status
say d.ok
say d.text
say d.json
`);
      expect(r.out).toEqual(["200", "yes", "world 2", "200", "world", "404", "no", "nope", "nothing"]);
      expect(seen[0]).toMatchObject({ method: "GET", url: "/x?q=a+b&n=2", auth: "Bearer tok", x: "yes" });
      expect(seen[1]).toMatchObject({ method: "POST", ct: "application/json", body: '{"k":"v"}' });
      expect(seen[2]).toMatchObject({ ct: "application/x-www-form-urlencoded", body: "grant_type=refresh_token&code=a+b" });
      expect((await err('http("GET", "http://127.0.0.1:1/nothing-listens")')).message).toMatch(/couldn't reach/);
      expect((await err('http("GET", "http://x", {nope: 1})')).message).toMatch(/doesn't know the option 'nope'/);
    } finally {
      srv.close();
    }
  });
});

describe("fail and regex_replace", () => {
  it("fail raises an error you can catch, with your own message", async () => {
    const r = await run(`
to checked(n):
    if n is less than 0:
        fail("negative numbers are not allowed: {n}")
    give back n
try:
    say checked(-5)
on error:
    say "caught: " + error
say checked(3)
`);
    expect(r.out).toEqual(["caught: negative numbers are not allowed: -5", "3"]);
    expect((await err('fail("boom")')).message).toBe("boom");
  });

  it("regex_replace replaces every match", async () => {
    const r = await run(`say regex_replace("<p>Hi <b>there</b></p>", "<[^>]+>", "")\nsay regex_replace("a  b   c", "\\s+", " ")`);
    expect(r.out).toEqual(["Hi there", "a b c"]);
    expect((await err('say regex_replace("x", "(", "")')).message).toMatch(/valid pattern/);
  });
});

describe("file-system, pattern and safe-http built-ins", () => {
  async function tmpTree() {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ion-fs-"));
    fs.mkdirSync(path.join(dir, "docs", "deep", "deeper"), { recursive: true });
    fs.mkdirSync(path.join(dir, "node_modules"));
    fs.writeFileSync(path.join(dir, "a.txt"), "hello world, héllo ✓");
    fs.writeFileSync(path.join(dir, "docs", "b.md"), "# b");
    fs.writeFileSync(path.join(dir, "docs", "deep", "c.txt"), "c");
    fs.writeFileSync(path.join(dir, "docs", "deep", "deeper", "d.txt"), "d");
    fs.writeFileSync(path.join(dir, "node_modules", "x.js"), "x");
    return { dir: dir.replace(/\\/g, "/"), fs, path };
  }

  it("list_dir: folders first, with type, size and modified time", async () => {
    const { dir } = await tmpTree();
    const r = await run(`
set items to list_dir("${dir}")
for each e in items:
    say e.type + " " + e.name + " " + e.size
say length(items[0].modified) is greater than 10
`);
    expect(r.out).toEqual(["folder docs 0", "folder node_modules 0", "file a.txt 23", "yes"]);
    expect((await err('list_dir("/definitely/not/here")')).message).toMatch(/couldn't list/);
  });

  it("walk_dir: depth first with limits, skips named entries, reports truncation", async () => {
    const { dir } = await tmpTree();
    const r = await run(`
set all to walk_dir("${dir}", {skip: ["node_modules"]})
say length(all.entries)
say all.truncated
set shallow to walk_dir("${dir}", {max_depth: 2})
say length(shallow.entries)
set capped to walk_dir("${dir}", {max_entries: 3})
say length(capped.entries)
say capped.truncated
say all.entries[0].path starts with "${dir}"
`);
    expect(r.out).toEqual(["7", "no", "6", "3", "yes", "yes"]);
  });

  it("walk_dir never follows symbolic links out of the folder", async () => {
    const { dir, fs, path } = await tmpTree();
    const outside = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "ion-outside-"));
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
    try { fs.symlinkSync(outside, path.join(dir, "link"), "junction"); } catch { return; } // cannot create links here: nothing to test
    const r = await run(`
set all to walk_dir("${dir}")
set names to map(all.entries, to_name)
to to_name(e):
    give back e.name
say names contains "secret.txt"
say names contains "link"
`).catch(async () => run(`
to to_name(e):
    give back e.name
set all to walk_dir("${dir}")
set names to map(all.entries, to_name)
say names contains "secret.txt"
say names contains "link"
`));
    expect(r.out).toEqual(["no", "yes"]); // the link itself is listed (as "other") but never entered
  });

  it("file_info, real_path and a limited read_file", async () => {
    const { dir } = await tmpTree();
    const r = await run(`
say file_info("${dir}/a.txt").size
say file_info("${dir}/nope").exists
say file_info("${dir}/docs").type
say real_path("${dir}/docs/../a.txt") is "${dir}/a.txt"
say read_file("${dir}/a.txt", 5)
say read_file("${dir}/a.txt", 100)
`);
    expect(r.out[0]).toBe("23");
    expect(r.out.slice(1, 4)).toEqual(["no", "folder", "yes"]);
    expect(r.out[4]).toBe("hello");
    expect(r.out[5]).toBe("hello world, héllo ✓");
    expect((await err(`say real_path("${dir}/missing")`)).message).toMatch(/doesn't exist/);
  });

  it("regex_matches returns matches, or the capture groups of each match", async () => {
    const r = await run(`
say regex_matches("a1 b22 c333", "[0-9]+")
say regex_matches("k=v; x=y", "(\\w+)=(\\w+)")
say regex_matches("Hello hello", "hello", "i")
say regex_matches("none", "[0-9]+")
say url_decode("a%20b+c%26d%C3%A9")
`);
    expect(r.out).toEqual(['["1", "22", "333"]', '[["k", "v"], ["x", "y"]]', '["Hello", "hello"]', "[]", "a b c&dé"]);
  });

  it("http public_only refuses this computer, private networks, and redirects into them", async () => {
    const http = await import("node:http");
    const srv = http.createServer((req, res) => {
      if (req.url === "/redirect") { res.writeHead(302, { Location: "http://127.0.0.1:1/secret" }); return res.end(); }
      res.writeHead(200); res.end("local");
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(srv.address() as any).port}`;
    try {
      for (const target of [`${base}/`, "http://localhost:1/", "http://[::1]:1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data", "http://0.0.0.0/", "file:///etc/passwd"]) {
        expect((await err(`http("GET", "${target}", {public_only: yes})`)).message).toMatch(/won't fetch|only http|private|local/i);
      }
      // the same request without public_only still works (it is the script author's choice)
      expect((await run(`say http("GET", "${base}/").text`)).out).toEqual(["local"]);
    } finally { srv.close(); }
  });

  it("http max_bytes stops a huge response early", async () => {
    const http = await import("node:http");
    const srv = http.createServer((_req, res) => { res.writeHead(200); res.end("x".repeat(100000)); });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(srv.address() as any).port}`;
    try {
      const r = await run(`
set a to http("GET", "${base}", {max_bytes: 1000})
say length(a.text)
say a.truncated
set b to http("GET", "${base}")
say length(b.text)
say b.truncated
`);
      expect(r.out).toEqual(["1000", "yes", "100000", "no"]);
    } finally { srv.close(); }
  });
});

import { isPrivateAddress } from "../src/runtime/safe-http.js";
describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", true], ["10.1.2.3", true], ["172.16.0.1", true], ["172.31.255.255", true], ["192.168.0.1", true],
    ["169.254.169.254", true], ["100.64.0.1", true], ["0.0.0.0", true], ["224.0.0.1", true], ["::1", true], ["fd00::1", true],
    ["fe80::1", true], ["::ffff:127.0.0.1", true], ["not-an-ip", true],
    ["8.8.8.8", false], ["172.32.0.1", false], ["172.15.0.1", false], ["93.184.216.34", false], ["2606:4700::1111", false]
  ])("%s -> private? %s", (addr, expected) => {
    expect(isPrivateAddress(addr)).toBe(expected);
  });
});
