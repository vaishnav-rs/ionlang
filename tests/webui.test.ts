import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { renderMarkdown, renderInline, highlight } from "../src/runtime/webui/markdown.js";
import { Interpreter } from "../src/lang/interpreter.js";
import { startServer } from "../src/runtime/server.js";
import type { ProgramConfig } from "../src/interpreter/program.js";

describe("markdown renderer", () => {
  it("escapes raw HTML and script injection", () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("only allows safe link schemes", () => {
    expect(renderInline("[x](javascript:alert(1))")).not.toContain("href");
    expect(renderInline("[ok](https://example.com)")).toContain('href="https://example.com"');
    expect(renderInline("[ok](https://example.com)")).toContain('rel="noopener noreferrer"');
    expect(renderInline("[bad](data:text/html;base64,AAA)")).not.toContain("href");
  });

  it("does not let attribute-breaking quotes escape a link", () => {
    const html = renderInline('[a](https://x.com/"onmouseover="alert(1))');
    expect(html).not.toMatch(/onmouseover="/);
  });

  it("renders emphasis, code spans and auto-links without touching code contents", () => {
    expect(renderInline("**bold** and *em* and `a*b*c`")).toBe("<strong>bold</strong> and <em>em</em> and <code>a*b*c</code>");
    expect(renderInline("see https://example.com/a.")).toContain('href="https://example.com/a"');
  });

  it("renders fenced code with a language label, copy button and highlighting", () => {
    const html = renderMarkdown('```ts\nconst x = "hi"; // note\n```');
    expect(html).toContain('class="code-lang">ts<');
    expect(html).toContain("data-copy");
    expect(html).toContain('<span class="tok-k">const</span>');
    expect(html).toContain('<span class="tok-s">&quot;hi&quot;</span>');
    expect(html).toContain('<span class="tok-c">// note</span>');
  });

  it("handles an unterminated code fence", () => {
    expect(renderMarkdown("```py\nprint(1)")).toContain('print(<span class="tok-n">1</span>)');
  });

  it("renders lists, nested lists, task lists and ordered lists", () => {
    const html = renderMarkdown("- a\n  - b\n- c\n\n1. one\n2. two\n\n- [x] done\n- [ ] todo");
    expect(html).toContain("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
    expect(html).toContain("<ol><li>one</li><li>two</li></ol>");
    expect(html).toContain('<li class="task"><input type="checkbox" disabled checked />');
    expect(html).toContain('<input type="checkbox" disabled /> todo');
  });

  it("renders tables with alignment", () => {
    const html = renderMarkdown("| A | B |\n|:--|--:|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<th style="text-align:right">B</th>');
    expect(html).toContain('<td style="text-align:right">2</td>');
  });

  it("renders tables whose separators use short or centered dashes", () => {
    const html = renderMarkdown("| A | B |\n|:-|:-:|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain('<td style="text-align:center">2</td>');
  });

  it("renders headings, quotes, rules and paragraphs", () => {
    const html = renderMarkdown("# Title\n\nHello\nworld\n\n> quoted\n\n---");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<p>Hello<br />world</p>");
    expect(html).toContain("<blockquote><p>quoted</p></blockquote>");
    expect(html).toContain("<hr />");
  });

  it("highlights Ion code", () => {
    const html = highlight('set name to "Ada" # hi', "ion");
    expect(html).toContain('<span class="tok-k">set</span>');
    expect(html).toContain('<span class="tok-c"># hi</span>');
  });
});

describe("web server events and metadata", () => {
  const port = 4388;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const out: string[] = [];
    let program: ProgramConfig | undefined;
    const interp = new Interpreter({
      io: { say: (t) => void out.push(t), note: () => {}, readLine: async () => null, confirm: async () => true },
      serve: async (p) => { program = p; }
    });
    await interp.runSource(`
tool shout(text):
    describe "Makes text loud"
    give back upper(text)
agent boss:
    model "mock"
    role "You lead."
    can ask helper
agent helper:
    model "mock"
    can use shout
serve boss
`);
    close = startServer({ program: program!, port, headless: false, autoYes: true }).close;
  });
  afterAll(async () => close());

  it("describes agents (role, tools, teammates, entry) for the sidebar", async () => {
    const agents = (await (await fetch(`http://localhost:${port}/agents`)).json()) as any[];
    const boss = agents.find((a) => a.name === "boss");
    expect(boss).toMatchObject({ entry: true, isOrchestrator: true, role: "You lead.", teammates: ["helper"] });
    expect(agents.find((a) => a.name === "helper").tools).toEqual(["shout"]);
    const cfg = (await (await fetch(`http://localhost:${port}/config`)).json()) as any;
    expect(cfg.entry).toBe("boss");
  });

  it("serves the UI files, including ES modules, and ignores query strings", async () => {
    const page = await fetch(`http://localhost:${port}/?x=1`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>Ion</title>");
    const mod = await fetch(`http://localhost:${port}/markdown.js`);
    expect(mod.headers.get("content-type")).toContain("javascript");
    expect((await fetch(`http://localhost:${port}/..%2f..%2fpackage.json`)).status).toBe(403);
  });

  it("streams tool_call, tool_result and final events over the WebSocket", async () => {
    const events: any[] = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/stream`);
      const seen: any[] = [];
      ws.on("open", () =>
        ws.send(JSON.stringify({ type: "message", text: 'CALL delegate_to_helper {"task": "CALL shout {\\"text\\": \\"hi\\"}"}' }))
      );
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        seen.push(msg);
        if (msg.type === "final") { ws.close(); resolve(seen); }
      });
      ws.on("error", reject);
    });
    const types = events.map((e) => e.type);
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    const handoff = events.find((e) => e.type === "tool_result" && e.tool === "delegate_to_helper");
    expect(handoff).toMatchObject({ agent: "boss", isError: false });
    expect(typeof handoff.ms).toBe("number");
    const shout = events.find((e) => e.type === "tool_result" && e.tool === "shout");
    expect(shout).toMatchObject({ agent: "helper", result: "HI" });
    expect(events.at(-1).type).toBe("final");
  });
});

describe("server hardening: hostile web pages and DNS rebinding", () => {
  const port = 4391;
  let close: () => Promise<void>;
  const base = `http://127.0.0.1:${port}`;

  beforeAll(async () => {
    let program: ProgramConfig | undefined;
    await new Interpreter({
      io: { say() {}, note() {}, readLine: async () => null, confirm: async () => true },
      serve: async (p) => { program = p; }
    }).runSource('agent a:\n    model "mock"\nserve a');
    close = startServer({ program: program!, port, headless: false, autoYes: true, allowedOrigins: ["http://localhost:5173"] }).close;
  });
  afterAll(async () => close());

  const post = (origin?: string) =>
    fetch(`${base}/message`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify({ text: "hi" })
    });

  it("refuses a request from another website, but allows tools that send no Origin", async () => {
    expect((await post("https://evil.example")).status).toBe(403);
    expect((await post("http://localhost:9999")).status).toBe(403); // right host, wrong port
    expect((await post("null")).status).toBe(403);
    expect((await post()).status).toBe(200);
  });

  it("allows the server's own page and origins you opted into", async () => {
    expect((await post(base)).status).toBe(200);
    expect((await post("http://localhost:5173")).status).toBe(200);
  });

  it("refuses a WebSocket handshake from another website", async () => {
    const result = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/stream`, { headers: { Origin: "https://evil.example" } });
      ws.on("open", () => { ws.close(); resolve("opened"); });
      ws.on("error", (e) => resolve(`blocked: ${e.message}`));
      ws.on("unexpected-response", (_req, res) => resolve(`blocked: ${res.statusCode}`));
    });
    expect(result).toMatch(/^blocked/);
    const ok = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/stream`);
      ws.on("open", () => { ws.close(); resolve("opened"); });
      ws.on("error", (e) => resolve(`blocked: ${e.message}`));
    });
    expect(ok).toBe("opened");
  });

  it("refuses a Host header that isn't localhost (DNS rebinding)", async () => {
    const http = await import("node:http");
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/agents", headers: { Host: `attacker.example:${port}` } }, (res) => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(421);
  });
});
