import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { tokenize } from "../src/lexer/lexer.js";
import { parse } from "../src/parser/parser.js";
import { analyze } from "../src/semantic/semantic.js";
import { buildProgramConfig } from "../src/interpreter/program.js";
import { startServer } from "../src/runtime/server.js";

const originalFetch = globalThis.fetch;

const SRC = `ion init
type == single
agentdef assistant{
ai-provider == openai
ai-apikey == env:OPENAI_API_KEY
input == text
output == text}
`;

describe("server (headless REST)", () => {
  let close: () => Promise<void>;
  const port = 4399;

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "the answer", tool_calls: [] } }] }),
        { status: 200 }
      )
    ) as any;

    const config = buildProgramConfig(analyze(parse(tokenize(SRC))));
    const server = startServer({ program: config, port, headless: true, autoYes: true });
    close = server.close;
  });

  afterAll(async () => {
    await close();
    globalThis.fetch = originalFetch;
  });

  it("responds to POST /message with the agent's final text", async () => {
    const res = await originalFetch(`http://localhost:${port}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hi there" })
    });
    const data = await res.json();
    expect(data.result).toBe("the answer");
  });

  it("does not serve the web UI in headless mode", async () => {
    const res = await originalFetch(`http://localhost:${port}/`);
    expect(res.status).toBe(404);
  });
});
