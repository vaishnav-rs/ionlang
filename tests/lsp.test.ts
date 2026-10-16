import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { completionsFor, namesDefinedIn, problemsIn } from "../src/lsp/language.js";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("language server: problems", () => {
  it("reports nothing for a good script", () => {
    expect(problemsIn('to hi(name):\n    give back "hi " + name\nsay hi("Ada")\n')).toEqual([]);
  });

  it("reports a syntax error with its line and hint", () => {
    const [p] = problemsIn('say "ok"\nsay "oops\n');
    expect(p.line).toBe(2);
    expect(p.message).toMatch(/never closed/);
  });

  it("reports an unknown agent the way ion check does", () => {
    const problems = problemsIn('ask ghost "hello"\n');
    expect(problems.length).toBeGreaterThan(0);
  });

  it("never throws, even on text that is not Ion at all", () => {
    expect(() => problemsIn("\u0000 ::: ((((")).not.toThrow();
  });
});

describe("language server: completions", () => {
  it("offers keywords, built-ins and the script's own names", () => {
    const labels = completionsFor('to greet(name):\n    give back name\nset total to 3\n').map((c) => c.label);
    expect(labels).toContain("otherwise");
    expect(labels).toContain("model");
    expect(labels).toContain("upper");
    expect(labels).toContain("greet");
    expect(labels).toContain("total");
  });

  it("finds names even when the script is half typed", () => {
    expect(namesDefinedIn("agent writer:\n    model ")).toContain("writer");
  });
});

describe("language server: over stdio", () => {
  it("publishes diagnostics and answers completion requests", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli/index.ts", "lsp"], { cwd: repo });
    const messages: any[] = [];
    let buffer = Buffer.alloc(0);
    child.stdout.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;
        const length = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, headerEnd).toString())![1]);
        if (buffer.length < headerEnd + 4 + length) return;
        messages.push(JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString("utf-8")));
        buffer = buffer.subarray(headerEnd + 4 + length);
      }
    });

    const send = (msg: unknown) => {
      const body = JSON.stringify({ jsonrpc: "2.0", ...(msg as object) });
      child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    };
    const waitFor = async (pred: (m: any) => boolean) => {
      for (let i = 0; i < 300; i++) {
        const found = messages.find(pred);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("timed out waiting for the language server");
    };

    try {
      send({ id: 1, method: "initialize", params: { processId: null, rootUri: null, capabilities: {} } });
      await waitFor((m) => m.id === 1);
      send({ method: "initialized", params: {} });
      const uri = "file:///scratch/demo.ion";
      send({
        method: "textDocument/didOpen",
        params: { textDocument: { uri, languageId: "ion", version: 1, text: 'say "ok"\nsay "oops\n' } }
      });
      const diags = await waitFor((m) => m.method === "textDocument/publishDiagnostics" && m.params.uri === uri);
      expect(diags.params.diagnostics[0].range.start.line).toBe(1);
      expect(diags.params.diagnostics[0].message).toMatch(/never closed/);

      send({ id: 2, method: "textDocument/completion", params: { textDocument: { uri }, position: { line: 0, character: 0 } } });
      const completion = await waitFor((m) => m.id === 2);
      expect(completion.result.map((c: any) => c.label)).toContain("say");
    } finally {
      child.kill();
    }
  }, 20000);
});
