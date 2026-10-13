import { describe, it, expect } from "vitest";
import { tokenize } from "../src/lexer/lexer.js";

describe("lexer", () => {
  it("tokenizes ion init header", () => {
    const toks = tokenize("ion init\n");
    expect(toks.map((t) => t.type)).toEqual(["IDENT", "IDENT", "NEWLINE", "EOF"]);
  });

  it("tokenizes braces and ==", () => {
    const toks = tokenize("agentdef foo{\ntype == team\n}\n");
    const types = toks.map((t) => t.type);
    expect(types).toContain("LBRACE");
    expect(types).toContain("RBRACE");
    expect(types).toContain("EQEQ");
  });

  it("recognizes env: refs", () => {
    const toks = tokenize("ai-apikey == env:GEMINI_API_KEY\n");
    const envTok = toks.find((t) => t.type === "ENV_REF");
    expect(envTok?.value).toBe("GEMINI_API_KEY");
  });

  it("recognizes provider/model-id refs", () => {
    const toks = tokenize("ai-model == gemini/gemini-2.5-flash\n");
    const modelTok = toks.find((t) => t.type === "MODEL_REF");
    expect(modelTok?.value).toBe("gemini/gemini-2.5-flash");
  });

  it("splits comma modality lists", () => {
    const toks = tokenize("input == text, voice\n");
    const types = toks.map((t) => t.type);
    expect(types).toContain("COMMA");
    const idents = toks.filter((t) => t.type === "IDENT").map((t) => t.value);
    expect(idents).toContain("text");
    expect(idents).toContain("voice");
  });

  it("strips quotes from strings", () => {
    const toks = tokenize("grant file-access 'C:/users/vaish'\n");
    const str = toks.find((t) => t.type === "STRING");
    expect(str?.value).toBe("C:/users/vaish");
  });

  it("skips comments", () => {
    const toks = tokenize("# a comment\nion init\n");
    expect(toks[0].type).toBe("IDENT");
    expect(toks[0].value).toBe("ion");
  });
});
