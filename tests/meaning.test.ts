import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { makeEmbedder, cosine } from "../src/runtime/embeddings.js";
import { buildVct, currentVct, loadKnowledgeBase, searchByMeaning, searchChunks } from "../src/runtime/rag.js";
import { Interpreter, IonIO } from "../src/lang/interpreter.js";
import { parse } from "../src/lang/parser.js";

/**
 * A stand-in for an embedding service that understands three ideas: days off, food, and animals.
 * Words of one idea share a dimension, so "bank holiday" and "closed" end up close together even
 * though they share no letters. That is exactly what keyword search can't do.
 */
const IDEAS: string[][] = [
  ["closed", "closure", "holiday", "holidays", "off", "vacation", "shut", "fridays", "leave"],
  ["lunch", "noon", "meal", "eat", "food"],
  ["penguins", "penguin", "antarctic", "animals", "birds"]
];

function fakeVector(text: string): number[] {
  const v = [0, 0, 0];
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    IDEAS.forEach((words, i) => {
      if (words.includes(word)) v[i] += 1;
    });
  }
  return v;
}

const originalFetch = globalThis.fetch;
let dir: string;
let calls: { url: string; body: any; headers: any }[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ion-meaning-"));
  calls = [];
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.OPENAI_API_KEY = "test-openai-key";
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, headers: init.headers });
    if (String(url).includes("generativelanguage")) {
      return new Response(JSON.stringify({ embeddings: body.requests.map((r: any) => ({ values: fakeVector(r.content.parts[0].text) })) }), { status: 200 });
    }
    if (String(url).includes("api.openai.com")) {
      // OpenAI returns the rows in any order, with their index: check that Ion puts them back in order
      const data = body.input.map((t: string, index: number) => ({ index, embedding: fakeVector(t) })).reverse();
      return new Response(JSON.stringify({ data }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as any;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  fs.rmSync(dir, { recursive: true, force: true });
});

const SOURCE = "The office is closed on Fridays.\n\nLunch is at noon every day.\n\nPenguins live mostly in the southern hemisphere.";

describe("embedding providers", () => {
  it("sends Gemini the key in a header and reads the vectors back", async () => {
    const embedder = makeEmbedder("gemini/gemini-embedding-001");
    const vectors = await embedder.embed(["closed on Fridays", "penguins"], "document");
    expect(calls[0].url).toMatch(/models\/gemini-embedding-001:batchEmbedContents$/);
    expect(calls[0].headers["x-goog-api-key"]).toBe("test-gemini-key");
    expect(calls[0].body.requests[0].taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(vectors[0][0]).toBeGreaterThan(0); // closed on Fridays: the days-off idea
    expect(vectors[1][2]).toBeGreaterThan(0); // penguins: the animals idea
  });

  it("sends OpenAI the key as a bearer token and puts its rows back in order", async () => {
    const embedder = makeEmbedder("openai/text-embedding-3-small");
    const vectors = await embedder.embed(["lunch at noon", "penguins"], "document");
    expect(calls[0].headers.Authorization).toBe("Bearer test-openai-key");
    expect(vectors[0]).toEqual(fakeVector("lunch at noon"));
    expect(vectors[1]).toEqual(fakeVector("penguins"));
  });

  it("explains the providers that can't do it", () => {
    expect(() => makeEmbedder("anthropic/claude-sonnet-5-5")).toThrow(/Anthropic doesn't offer embedding models/);
    expect(() => makeEmbedder("cerebras/whatever")).toThrow(/has no embedding models in Ion yet/);
  });

  it("says which variable is missing", () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => makeEmbedder("gemini/gemini-embedding-001")).toThrow(/needs the environment variable GEMINI_API_KEY/);
  });

  it("measures how alike two vectors are", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("finding passages by meaning", () => {
  it("finds the day-off passage for a question with no words in common", async () => {
    const index = await buildVct("office.txt", Buffer.from(SOURCE), SOURCE, makeEmbedder("gemini/gemini-embedding-001"));
    const question = "Can I take a bank holiday?";
    // the question has no word from the passage, so keyword search finds nothing
    expect(searchChunks(index, question)).toEqual([]);
    // the meaning of the question is close to the days-off passage
    const [questionVector] = await makeEmbedder("gemini/gemini-embedding-001").embed([question], "query");
    expect(searchByMeaning(index, questionVector)[0].text).toContain("closed on Fridays");
  });

  it("stores the vectors and the model in the .vct file", async () => {
    const index = await buildVct("office.txt", Buffer.from(SOURCE), SOURCE, makeEmbedder("gemini/gemini-embedding-001"));
    expect(index.embeddingModel).toBe("gemini/gemini-embedding-001");
    expect(index.chunks.every((c) => Array.isArray(c.vector) && c.vector.length === 3)).toBe(true);
  });

  it("rebuilds the file when the embedding model changes", async () => {
    fs.writeFileSync(path.join(dir, "office.txt"), SOURCE);
    const keyword = await loadKnowledgeBase("office.vct", "office.txt", dir, undefined);
    expect(keyword.index.embeddingModel).toBe("");
    const meaning = await loadKnowledgeBase("office.vct", "office.txt", dir, makeEmbedder("gemini/gemini-embedding-001"));
    expect(meaning.rebuilt).toBe(true);
    expect(meaning.embedder?.model).toBe("gemini/gemini-embedding-001");
    const again = await loadKnowledgeBase("office.vct", "office.txt", dir, makeEmbedder("gemini/gemini-embedding-001"));
    expect(again.rebuilt).toBe(false);
  });

  it("reuses an existing file as it is, with the model it was built with", async () => {
    fs.writeFileSync(path.join(dir, "office.txt"), SOURCE);
    await loadKnowledgeBase("office.vct", "office.txt", dir, makeEmbedder("gemini/gemini-embedding-001"));
    expect(currentVct("office.vct", "office.txt", dir)?.embeddingModel).toBe("gemini/gemini-embedding-001");
    const kept = await loadKnowledgeBase("office.vct", "office.txt", dir, "keep");
    expect(kept.rebuilt).toBe(false);
    expect(kept.embedder?.model).toBe("gemini/gemini-embedding-001");
  });

  it("still reads older .vct files that have no model, as keyword search", async () => {
    const old = { format: "ion-vct", version: 1, source: "a.txt", sourceHash: "x", chunks: [{ id: 0, text: "Owls hunt at night." }] };
    fs.writeFileSync(path.join(dir, "owls.vct"), JSON.stringify(old));
    fs.writeFileSync(path.join(dir, "owls.txt"), "Owls hunt at night.");
    const { parseVct } = await import("../src/runtime/rag.js");
    expect(parseVct(JSON.stringify(old)).embeddingModel).toBe("");
  });
});

describe("meaning search in Ion scripts", () => {
  const script = (setting: string) => `rag office.vct from "office.txt"${setting}

agent clerk:
    model "mock"
    can search office.vct

say ask clerk 'CALL search_office_vct {"query": "Can I take a bank holiday?"}'
`;

  beforeEach(() => fs.writeFileSync(path.join(dir, "office.txt"), SOURCE));

  it("uses the embedding model set in the script", async () => {
    const out: string[] = [];
    const notes: string[] = [];
    const io: IonIO = { say: (t) => void out.push(t), note: (t) => void notes.push(t), readLine: async () => null, confirm: async () => false };
    const interp = new Interpreter({ io, file: path.join(dir, "script.ion") });
    try {
      await interp.runSource(script('\n    embedding model "gemini/gemini-embedding-001"'));
    } finally {
      interp.close();
    }
    expect(out.join("\n")).toContain("closed on Fridays");
    expect(notes.join("\n")).toMatch(/searchable by meaning with gemini\/gemini-embedding-001/);
    expect(calls.some((c) => c.url.includes("generativelanguage"))).toBe(true);
  });

  it("asks once in the terminal, and uses the answer", async () => {
    const asked: string[] = [];
    const io: IonIO = {
      say: () => undefined,
      note: () => undefined,
      readLine: async (prompt) => {
        asked.push(prompt);
        return "gemini/gemini-embedding-001";
      },
      confirm: async () => false
    };
    const interp = new Interpreter({ io, file: path.join(dir, "script.ion") });
    try {
      await interp.runSource(script(""));
    } finally {
      interp.close();
    }
    expect(asked.length).toBe(1);
    expect(asked[0]).toMatch(/search by meaning as well as by keyword/);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "office.vct"), "utf-8")).embeddingModel).toBe("gemini/gemini-embedding-001");
  });

  it("uses keyword search when the person presses Enter", async () => {
    const out: string[] = [];
    const io: IonIO = { say: (t) => void out.push(t), note: () => undefined, readLine: async () => "", confirm: async () => false };
    const interp = new Interpreter({ io, file: path.join(dir, "script.ion") });
    try {
      await interp.runSource(script(""));
    } finally {
      interp.close();
    }
    expect(JSON.parse(fs.readFileSync(path.join(dir, "office.vct"), "utf-8")).embeddingModel).toBe("");
    expect(out.join("\n")).toContain("No passages in office.vct match that.");
  });

  it("reads the embedding setting in a rag block", () => {
    const [rag] = parse('rag office.vct from "office.txt"\n    embedding model "gemini/gemini-embedding-001"\n');
    expect(rag).toMatchObject({ k: "rag", name: "office.vct", embeddingModel: { k: "str" } });
  });

  it("says what to type when the setting is misspelt", () => {
    expect(() => parse('rag office.vct from "office.txt"\n    embeding model "x"\n')).toThrow(/knowledge base setting/);
  });
});
