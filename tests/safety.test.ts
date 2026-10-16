import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { audit, BudgetExceededError } from "../src/runtime/audit.js";
import { FileHistoryStore, isValidSessionId } from "../src/runtime/history-store.js";
import { openai } from "../src/runtime/providers/openai.js";
import { anthropic } from "../src/runtime/providers/anthropic.js";
import { gemini } from "../src/runtime/providers/gemini.js";
import { tokenize } from "../src/lexer/lexer.js";
import { parse } from "../src/parser/parser.js";
import { analyze } from "../src/semantic/semantic.js";
import { buildProgramConfig } from "../src/interpreter/program.js";
import { startServer } from "../src/runtime/server.js";
import { Interpreter } from "../src/lang/interpreter.js";

const originalFetch = globalThis.fetch;
let tmp: string;

beforeEach(() => {
  audit.reset();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ion-safety-"));
});

afterEach(() => {
  audit.reset();
  globalThis.fetch = originalFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("audit: secrets", () => {
  it("replaces known secrets everywhere it writes", () => {
    audit.addSecret("sk-live-abcdef123456");
    const logFile = path.join(tmp, "run.jsonl");
    audit.configure({ logFile, logContent: true });
    audit.record("tool.call", { agent: "a", tool: "fetch", args: '{"url":"https://x?q=sk-live-abcdef123456"}' });
    const text = fs.readFileSync(logFile, "utf-8");
    expect(text).not.toContain("sk-live-abcdef123456");
    expect(text).toContain("[hidden]");
  });

  it("hides fields whose names look like credentials", () => {
    const logFile = path.join(tmp, "run.jsonl");
    audit.configure({ logFile });
    audit.record("grant", { agent: "a", grant: "gmail-access", apiToken: "anything-at-all" });
    expect(fs.readFileSync(logFile, "utf-8")).not.toContain("anything-at-all");
  });

  it("ignores very short values, which would redact ordinary words", () => {
    audit.addSecret("abc");
    expect(audit.redact("abc is fine")).toBe("abc is fine");
  });
});

describe("audit: content", () => {
  it("leaves message and result text out of the log by default", () => {
    const logFile = path.join(tmp, "run.jsonl");
    audit.configure({ logFile });
    audit.record("message", { agent: "a", role: "user", text: "my private note" });
    audit.record("tool.result", { agent: "a", tool: "read_file", result: "secret file contents", ok: true });
    const text = fs.readFileSync(logFile, "utf-8");
    expect(text).not.toContain("my private note");
    expect(text).not.toContain("secret file contents");
    expect(text).toContain('"type":"tool.result"');
  });

  it("includes text when logContent is on", () => {
    const logFile = path.join(tmp, "run.jsonl");
    audit.configure({ logFile, logContent: true });
    audit.record("message", { agent: "a", role: "user", text: "hello there" });
    expect(fs.readFileSync(logFile, "utf-8")).toContain("hello there");
  });

  it("prints a short trace line only when tracing is on", () => {
    const lines: string[] = [];
    audit.configure({ trace: (l) => lines.push(l) });
    audit.record("tool.call", { agent: "a", tool: "fetch" }, "a · calls fetch");
    audit.record("tool.call", { agent: "a", tool: "fetch" });
    expect(lines).toEqual(["a · calls fetch"]);
  });
});

describe("audit: budget", () => {
  it("counts input and output tokens", () => {
    audit.spend({ inputTokens: 100, outputTokens: 25 });
    audit.spend(undefined);
    expect(audit.tokensUsed).toBe(125);
  });

  it("stops the next model call once the budget is spent", () => {
    audit.configure({ budgetTokens: 100 });
    audit.checkBudget();
    audit.spend({ inputTokens: 80, outputTokens: 20 });
    expect(() => audit.checkBudget()).toThrow(BudgetExceededError);
    expect(() => audit.checkBudget()).toThrow(/token budget of 100/);
  });

  it("still applies when the provider reports no usage (the mock does not)", async () => {
    audit.configure({ budgetTokens: 5 });
    const io = { say: () => undefined, note: () => undefined, readLine: async () => null, confirm: async () => false };
    const src = 'agent a:\n    model "mock"\nset first to ask a "hello there, this is a longer message"\nset second to ask a "again"';
    await expect(new Interpreter({ io }).runSource(src)).rejects.toThrow(/token budget of 5/);
    expect(audit.tokensUsed).toBeGreaterThan(5);
  });

  it("does nothing without a budget", () => {
    audit.spend({ inputTokens: 1e9, outputTokens: 1e9 });
    expect(() => audit.checkBudget()).not.toThrow();
  });
});

describe("provider token usage", () => {
  const reply = (body: unknown) => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as any;
  };
  const msgs = [{ role: "user" as const, content: "hi" }];

  it("reads OpenAI-style usage", async () => {
    reply({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
    const r = await openai.sendMessage({ messages: msgs, apiKey: "k" });
    expect(r.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it("reads Anthropic-style usage", async () => {
    reply({ content: [{ type: "text", text: "ok" }], usage: { input_tokens: 7, output_tokens: 9 } });
    const r = await anthropic.sendMessage({ messages: msgs, apiKey: "k" });
    expect(r.usage).toEqual({ inputTokens: 7, outputTokens: 9 });
  });

  it("reads Gemini-style usage", async () => {
    reply({ candidates: [{ content: { parts: [{ text: "ok" }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } });
    const r = await gemini.sendMessage({ messages: msgs, apiKey: "k" });
    expect(r.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });

  it("reports no usage when the provider sends none", async () => {
    reply({ choices: [{ message: { content: "ok" } }] });
    const r = await openai.sendMessage({ messages: msgs, apiKey: "k" });
    expect(r.usage).toBeUndefined();
  });
});

describe("history store", () => {
  it("saves and loads a session", () => {
    const store = new FileHistoryStore(tmp);
    store.save("abc", { writer: [{ role: "user", content: "hi" }] });
    expect(store.load("abc")).toEqual({ writer: [{ role: "user", content: "hi" }] });
  });

  it("starts empty for a session it has never seen", () => {
    expect(new FileHistoryStore(tmp).load("nobody")).toEqual({});
  });

  it("keeps each file inside its folder, whatever the session id", () => {
    const store = new FileHistoryStore(tmp);
    store.save("../../escape", { a: [] });
    const files = fs.readdirSync(tmp);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^[0-9a-f]{40}\.json$/);
  });

  it("accepts only simple session ids", () => {
    expect(isValidSessionId("abc-123_X")).toBe(true);
    expect(isValidSessionId("../etc")).toBe(false);
    expect(isValidSessionId("")).toBe(false);
    expect(isValidSessionId("a".repeat(129))).toBe(false);
  });
});

describe("REST sessions", () => {
  const SRC = `ion init
type == single
agentdef assistant{
ai-provider == openai
ai-apikey == "test-key-123456"
input == text
output == text}
`;

  /** Starts a headless server, runs `fn`, and stops it. Returns the request bodies the model received. */
  async function withServer(port: number, historyStore: FileHistoryStore | undefined, fn: (url: string) => Promise<void>) {
    const bodies: any[] = [];
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "reply" } }] }), { status: 200 });
    }) as any;
    const config = buildProgramConfig(analyze(parse(tokenize(SRC))));
    const { close } = startServer({ program: config, port, headless: true, autoYes: true, historyStore });
    try {
      await fn(`http://localhost:${port}/message`);
    } finally {
      await close();
    }
    return bodies;
  }

  const post = (url: string, body: unknown) =>
    originalFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("gives callers without a session_id separate conversations", async () => {
    const bodies = await withServer(4471, undefined, async (url) => {
      await post(url, { text: "my secret plan" });
      await post(url, { text: "what is my plan?" });
    });
    // the second request must not contain the first caller's message
    expect(JSON.stringify(bodies[1].messages)).not.toContain("my secret plan");
  });

  it("rejects a session_id with unsafe characters", async () => {
    await withServer(4472, undefined, async (url) => {
      const res = await post(url, { text: "hi", session_id: "../../x" });
      expect(res.status).toBe(400);
    });
  });

  it("remembers a named session across server restarts when a store is given", async () => {
    const store = new FileHistoryStore(tmp);
    await withServer(4473, store, async (url) => {
      await post(url, { text: "remember the word pineapple", session_id: "user-1" });
    });
    const bodies = await withServer(4474, store, async (url) => {
      await post(url, { text: "what word did I ask you to remember?", session_id: "user-1" });
    });
    expect(JSON.stringify(bodies[0].messages)).toContain("pineapple");
  });
});

describe("data stays where it should", () => {
  it("sends the Gemini key in a header, never in the URL", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      seenUrl = String(url);
      seenHeaders = init.headers;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });
    }) as any;
    await gemini.sendMessage({ messages: [{ role: "user", content: "hi" }], apiKey: "AIzaSECRETKEY123456" });
    expect(seenUrl).not.toContain("AIzaSECRETKEY123456");
    expect(seenHeaders["x-goog-api-key"]).toBe("AIzaSECRETKEY123456");
  });

  it("keeps permission details, error text and fallback reasons out of the log by default", () => {
    const logFile = path.join(tmp, "run.jsonl");
    audit.configure({ logFile });
    audit.record("grant", { agent: "a", grant: "web-browsing", detail: "fetch 'https://x.test/?token=pri-vate-999'" });
    audit.record("error", { agent: "a", message: "the prompt was: my bank pin is 4321" });
    audit.record("fallback", { agent: "a", from: "x", to: "y", reason: "rate limited: pri-vate-999" });
    const text = fs.readFileSync(logFile, "utf-8");
    expect(text).not.toContain("pri-vate-999");
    expect(text).not.toContain("4321");
    expect(text).toContain('"type":"grant"');
  });

  it("registers a key from an old-style file so it is redacted too", async () => {
    const { buildProgramConfig: build } = await import("../src/interpreter/program.js");
    const legacy = `ion init
type == single
agentdef assistant{
ai-provider == openai
ai-apikey == "legacy-key-987654"
input == text
output == text}
`;
    build(analyze(parse(tokenize(legacy))));
    expect(audit.redact("token legacy-key-987654 leaked")).toBe("token [hidden] leaked");
  });

  it("refuses a request from another website, and one addressed to another host", async () => {
    const http = await import("node:http");
    const config = buildProgramConfig(analyze(parse(tokenize(`ion init
type == single
agentdef assistant{
ai-provider == openai
ai-apikey == "test-key-123456"
input == text
output == text}
`))));
    const { close } = startServer({ program: config, port: 4475, headless: true, autoYes: true });
    const send = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const req = http.request(
          { host: "127.0.0.1", port: 4475, path: "/message", method: "POST", headers: { "Content-Type": "application/json", ...headers } },
          (res) => { res.resume(); resolve(res.statusCode ?? 0); }
        );
        req.on("error", reject);
        req.end(JSON.stringify({ text: "hello" }));
      });
    try {
      expect(await send({ Origin: "https://evil.example", Host: "localhost:4475" })).toBe(403);
      expect(await send({ Host: "evil.example" })).toBe(421);
    } finally {
      await close();
    }
  });
});

describe("agents can't reach secret files", () => {
  it("refuses to read, write or list .env files, but still reads ordinary files", async () => {
    const { runFileAccessTool, isSecretPath } = await import("../src/runtime/grants/file-access.js");
    const { GrantManager } = await import("../src/runtime/grants/grant-manager.js");
    fs.writeFileSync(path.join(tmp, ".env"), "GEMINI_API_KEY=AIzaSECRET123456\n");
    fs.writeFileSync(path.join(tmp, "notes.txt"), "plain notes");
    fs.writeFileSync(path.join(tmp, "api_key_backup.json"), "{}");
    const gm = new GrantManager("reader", [{ kind: "file-access", scope: tmp, line: 1 }] as any, async () => true, true);

    await expect(runFileAccessTool("read_file", { path: ".env" }, gm)).rejects.toThrow(/looks like it holds secrets/);
    await expect(runFileAccessTool("read_file", { path: ".env.production" }, gm)).rejects.toThrow(/secrets/);
    await expect(runFileAccessTool("write_file", { path: ".env", content: "x" }, gm)).rejects.toThrow(/secrets/);
    await expect(runFileAccessTool("read_file", { path: "api_key_backup.json" }, gm)).rejects.toThrow(/secrets/);
    expect(await runFileAccessTool("read_file", { path: "notes.txt" }, gm)).toBe("plain notes");

    const listing = JSON.parse(await runFileAccessTool("list_files", { path: "." }, gm));
    expect(listing).toContain("notes.txt");
    expect(listing).not.toContain(".env");
    expect(listing).not.toContain("api_key_backup.json");
    expect(isSecretPath("config/.env")).toBe(true);
    expect(isSecretPath("docs/readme.md")).toBe(false);
  });

  it("follows a link out of the folder to a secret file, and refuses it", async () => {
    const { runFileAccessTool } = await import("../src/runtime/grants/file-access.js");
    const { GrantManager } = await import("../src/runtime/grants/grant-manager.js");
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ion-outside-"));
    fs.writeFileSync(path.join(outside, ".env"), "KEY=abc\n");
    try {
      fs.symlinkSync(path.join(outside, ".env"), path.join(tmp, "innocent.txt"));
    } catch {
      fs.rmSync(outside, { recursive: true, force: true });
      return; // creating links needs a privilege some Windows accounts don't have
    }
    const gm = new GrantManager("reader", [{ kind: "file-access", scope: tmp, line: 1 }] as any, async () => true, true);
    await expect(runFileAccessTool("read_file", { path: "innocent.txt" }, gm)).rejects.toThrow(/link/);
    fs.rmSync(outside, { recursive: true, force: true });
  });
});
