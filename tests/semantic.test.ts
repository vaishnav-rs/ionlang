import { describe, it, expect } from "vitest";
import { tokenize } from "../src/lexer/lexer.js";
import { parse } from "../src/parser/parser.js";
import { analyze, SemanticError } from "../src/semantic/semantic.js";

function run(src: string) {
  return analyze(parse(tokenize(src)));
}

describe("semantic", () => {
  it("accepts a valid single-agent program", () => {
    const src = `ion init
type == single
agentdef assistant{
ai-provider == openai
ai-apikey == env:OPENAI_API_KEY
input == text
output == text}
`;
    const result = run(src);
    expect(result.type).toBe("single");
    expect(result.entryPoints).toEqual(["assistant"]);
  });

  it("rejects single with orchestration-powers", () => {
    const src = `ion init
type == single
agentdef a{
ai-provider == openai
ai-apikey == env:X
grant orchestration-powers}
`;
    expect(() => run(src)).toThrow(SemanticError);
  });

  it("rejects team with only one agent", () => {
    const src = `ion init
type == team
agentdef a{
ai-provider == openai
ai-apikey == env:X
grant orchestration-powers}
`;
    expect(() => run(src)).toThrow(/at least two agentdefs/);
  });

  it("rejects team without an orchestrator", () => {
    const src = `ion init
type == team
agentdef a{
ai-provider == openai
ai-apikey == env:X}
agentdef b{
ai-provider == openai
ai-apikey == env:X}
`;
    expect(() => run(src)).toThrow(/orchestration-powers/);
  });

  it("rejects duplicate agent names", () => {
    const src = `ion init
type == team
agentdef a{
ai-provider == openai
ai-apikey == env:X
grant orchestration-powers}
agentdef a{
ai-provider == openai
ai-apikey == env:X}
`;
    expect(() => run(src)).toThrow(/duplicate agent name/);
  });

  it("requires provider and apikey", () => {
    const src = `ion init
type == single
agentdef a{
input == text}
`;
    expect(() => run(src)).toThrow(/ai-provider/);
  });

  it("requires scope for file-access", () => {
    const src = `ion init
type == single
agentdef a{
ai-provider == openai
ai-apikey == env:X
grant file-access}
`;
    expect(() => run(src)).toThrow(/requires a scope/);
  });

  it("rejects scope on scopeless grants", () => {
    const src = `ion init
type == single
agentdef a{
ai-provider == openai
ai-apikey == env:X
grant web-browsing 'nope'}
`;
    expect(() => run(src)).toThrow(/does not take a scope/);
  });

  it("rejects user-admin grant", () => {
    const src = `ion init
type == single
agentdef a{
ai-provider == openai
ai-apikey == env:X
grant user-admin}
`;
    expect(() => run(src)).toThrow(/not supported|reserved/);
  });

  it("defaults entry point to orchestrator in a team with no input/output declared", () => {
    const src = `ion init
type == team
agentdef orchestrator{
ai-provider == gemini
ai-apikey == env:X
grant orchestration-powers}
agentdef researcher{
ai-provider == openai
ai-apikey == env:X}
`;
    const result = run(src);
    expect(result.entryPoints).toEqual(["orchestrator"]);
    const orch = result.agents.find((a) => a.name === "orchestrator")!;
    expect(orch.input).toEqual(["text"]);
    expect(orch.output).toEqual(["text"]);
  });
});
