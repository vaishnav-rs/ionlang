import { describe, it, expect, vi, afterEach } from "vitest";
import { gemini } from "../src/runtime/providers/gemini.js";
import { openai } from "../src/runtime/providers/openai.js";
import { anthropic } from "../src/runtime/providers/anthropic.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("gemini adapter", () => {
  it("sends contents and parses text + function calls", async () => {
    const fetchMock = vi.fn(async (url: any) => {
      expect(String(url)).toContain("generativelanguage.googleapis.com");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "hello " },
                  { functionCall: { name: "read_file", args: { path: "a.txt" } } }
                ]
              }
            }
          ]
        }),
        { status: 200 }
      );
    });
    globalThis.fetch = fetchMock as any;

    const result = await gemini.sendMessage({
      messages: [{ role: "user", content: "hi" }],
      apiKey: "key"
    });

    expect(result.text).toBe("hello ");
    expect(result.toolCalls).toEqual([
      { id: "read_file-0", name: "read_file", arguments: { path: "a.txt" } }
    ]);
  });

  it("throws on non-ok response", async () => {
    globalThis.fetch = vi.fn(async () => new Response("bad key", { status: 401 })) as any;
    await expect(
      gemini.sendMessage({ messages: [{ role: "user", content: "hi" }], apiKey: "bad" })
    ).rejects.toThrow(/Gemini API error 401/);
  });
});

describe("openai adapter", () => {
  it("sends chat messages and parses tool calls", async () => {
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toContain("api.openai.com");
      expect(init.headers.Authorization).toBe("Bearer key");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  { id: "call_1", function: { name: "fetch_url", arguments: '{"url":"https://x"}' } }
                ]
              }
            }
          ]
        }),
        { status: 200 }
      );
    });
    globalThis.fetch = fetchMock as any;

    const result = await openai.sendMessage({
      messages: [{ role: "user", content: "hi" }],
      apiKey: "key"
    });

    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "fetch_url", arguments: { url: "https://x" } }
    ]);
  });
});

describe("anthropic adapter", () => {
  it("sends messages with x-api-key and parses tool_use blocks", async () => {
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toContain("api.anthropic.com");
      expect(init.headers["x-api-key"]).toBe("key");
      return new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "answer" },
            { type: "tool_use", id: "t1", name: "run_command", input: { command: "ls" } }
          ]
        }),
        { status: 200 }
      );
    });
    globalThis.fetch = fetchMock as any;

    const result = await anthropic.sendMessage({
      messages: [{ role: "user", content: "hi" }],
      apiKey: "key"
    });

    expect(result.text).toBe("answer");
    expect(result.toolCalls).toEqual([{ id: "t1", name: "run_command", arguments: { command: "ls" } }]);
  });
});
