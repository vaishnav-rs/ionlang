import { describe, it, expect, afterEach, vi } from "vitest";
import { tokenize } from "../src/lexer/lexer.js";
import { parse } from "../src/parser/parser.js";
import { analyze } from "../src/semantic/semantic.js";
import { buildProgramConfig } from "../src/interpreter/program.js";
import { OrchestratorSession } from "../src/runtime/orchestrator-loop.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const TEAM_SRC = `ion init
type == team

agentdef orchestrator{
ai-provider == gemini
ai-apikey == env:GEMINI_API_KEY
grant orchestration-powers
input == text
output == text}

agentdef researcher{
ai-provider == openai
ai-apikey == env:OPENAI_API_KEY}
`;

describe("end-to-end orchestration", () => {
  it("orchestrator delegates to a teammate and returns a synthesized final answer", async () => {
    process.env.GEMINI_API_KEY = "g-key";
    process.env.OPENAI_API_KEY = "o-key";

    let orchestratorCallCount = 0;
    globalThis.fetch = vi.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        orchestratorCallCount++;
        if (orchestratorCallCount === 1) {
          // First call: orchestrator decides to delegate.
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: "delegate_to_researcher",
                          args: { task: "look into X" }
                        }
                      }
                    ]
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }
        // Second call: orchestrator synthesizes final answer from tool result.
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Synthesized: X is great" }] } }]
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes("api.openai.com")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "X is great", tool_calls: [] } }]
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected fetch to ${urlStr}`);
    }) as any;

    const config = buildProgramConfig(analyze(parse(tokenize(TEAM_SRC))));
    const session = new OrchestratorSession(config, async () => true, true);

    const result = await session.sendToAgent("orchestrator", "research X please");
    expect(result).toBe("Synthesized: X is great");
    expect(orchestratorCallCount).toBe(2);
  });
});
