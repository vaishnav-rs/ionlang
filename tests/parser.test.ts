import { describe, it, expect } from "vitest";
import { tokenize } from "../src/lexer/lexer.js";
import { parse } from "../src/parser/parser.js";

const EXAMPLE = `ion init
type == team
agentdef orchestrator{
ai-provider == gemini
ai-apikey == env:GEMINI_API_KEY
ai-model == gemini/gemini-2.5-flash
grant file-access 'C:/users/vaish'
grant web-browsing
grant orchestration-powers
input == text, voice
output == text}
`;

describe("parser", () => {
  it("parses the user's example fragment shape", () => {
    const program = parse(tokenize(EXAMPLE));
    expect(program.typeDecl?.value).toBe("team");
    expect(program.agents).toHaveLength(1);
    const agent = program.agents[0];
    expect(agent.name).toBe("orchestrator");
    expect(agent.provider).toEqual({ kind: "builtin", name: "gemini", line: 4 });
    expect(agent.apiKey?.envVar).toBe("GEMINI_API_KEY");
    expect(agent.model).toEqual({ provider: "gemini", modelId: "gemini-2.5-flash" });
    expect(agent.grants.map((g) => g.kind)).toEqual([
      "file-access",
      "web-browsing",
      "orchestration-powers"
    ]);
    expect(agent.grants[0].scope).toBe("C:/users/vaish");
    expect(agent.input).toEqual(["text", "voice"]);
    expect(agent.output).toEqual(["text"]);
  });

  it("requires ion init header", () => {
    expect(() => parse(tokenize("type == single\n"))).toThrow(/expected 'ion'/);
  });

  it("parses custom provider block", () => {
    const src = `ion init
type == single
agentdef a{
ai-provider == custom
endpoint == 'https://example.com/api'
auth-header == 'X-Api-Key'
request-format == raw
ai-apikey == 'k'}
`;
    const program = parse(tokenize(src));
    const provider = program.agents[0].provider;
    expect(provider?.kind).toBe("custom");
    if (provider?.kind === "custom") {
      expect(provider.endpoint).toBe("https://example.com/api");
      expect(provider.requestFormat).toBe("raw");
    }
  });

  it("errors on unterminated block", () => {
    expect(() =>
      parse(tokenize("ion init\ntype == single\nagentdef a{\nai-provider == x\n"))
    ).toThrow(/unterminated agentdef block/);
  });
});
