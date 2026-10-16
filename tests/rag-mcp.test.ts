import { describe, it, expect, afterEach, beforeEach, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkText, loadKnowledgeBase, readSourceText, searchChunks, searchToolName, buildVct } from "../src/runtime/rag.js";
import { Interpreter, IonIO } from "../src/lang/interpreter.js";
import { parse } from "../src/lang/parser.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeServer = path.join(here, "fixtures", "fake-mcp.mjs").split(path.sep).join("/");

let dir: string;
let interpreters: Interpreter[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ion-rag-"));
});

afterEach(() => {
  for (const i of interpreters) i.close();
  interpreters = [];
  fs.rmSync(dir, { recursive: true, force: true });
});

function harness(opts: { confirm?: boolean; file?: string } = {}) {
  const out: string[] = [];
  const notes: string[] = [];
  const io: IonIO = {
    say: (t) => void out.push(t),
    note: (t) => void notes.push(t),
    readLine: async () => null,
    confirm: async () => opts.confirm ?? true
  };
  const interp = new Interpreter({ io, file: opts.file ?? path.join(dir, "script.ion"), autoYes: false });
  interpreters.push(interp);
  return { interp, out, notes };
}

/** A real PDF made by Chromium, with three short lines of text. */
const SAMPLE_PDF = fs.readFileSync(path.join(here, "fixtures", "sample.pdf"));

describe("chunking", () => {
  it("keeps short text in one chunk", () => {
    expect(chunkText("One short paragraph.")).toEqual(["One short paragraph."]);
  });

  it("splits long text into chunks no bigger than the limit, and keeps every word", () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} talks about topic${i} in some detail with unique marker zeta${i}.`);
    const chunks = chunkText(paragraphs.join("\n\n"), 300, 60);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300);
    const all = chunks.join(" ");
    for (let i = 0; i < 40; i++) expect(all).toContain(`zeta${i}.`);
  });

  it("cuts one very long paragraph into pieces", () => {
    const chunks = chunkText("word ".repeat(1000), 200, 40);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
  });
});

describe("searching a knowledge base", () => {
  let index: Awaited<ReturnType<typeof buildVct>>;
  beforeAll(async () => {
    index = await buildVct(
      "notes.txt",
      Buffer.from("x"),
      "Photosynthesis turns sunlight into sugar in the leaves.\n\nThe library opens at nine on weekdays.\n\nPenguins live mostly in the southern hemisphere."
    );
  });

  it("ranks the chunk that matches the question first", () => {
    const hits = searchChunks(index, "where do penguins live?");
    expect(hits[0].text).toContain("Penguins");
  });

  it("finds nothing for words the knowledge base doesn't contain", () => {
    expect(searchChunks(index, "spaceship engines")).toEqual([]);
  });

  it("names the tool an agent sees: file1.vct becomes search_file1_vct", () => {
    expect(searchToolName("file1.vct")).toBe("search_file1_vct");
  });
});

describe("building a .vct file from a source", () => {
  it("builds file1.vct from a text file, and reuses it while the source is unchanged", async () => {
    fs.writeFileSync(path.join(dir, "handbook.txt"), "The office is closed on Fridays.\n\nLunch is at noon.");
    const first = await loadKnowledgeBase("file1.vct", "handbook.txt", dir);
    expect(first.rebuilt).toBe(true);
    expect(fs.existsSync(path.join(dir, "file1.vct"))).toBe(true);

    const second = await loadKnowledgeBase("file1.vct", "handbook.txt", dir);
    expect(second.rebuilt).toBe(false);

    fs.writeFileSync(path.join(dir, "handbook.txt"), "The office is open on Fridays now.");
    const third = await loadKnowledgeBase("file1.vct", "handbook.txt", dir);
    expect(third.rebuilt).toBe(true);
    expect(searchChunks(third.index, "fridays")[0].text).toContain("open");
  });

  it("reads text from a PDF", async () => {
    const text = await readSourceText("file1.pdf", SAMPLE_PDF);
    expect(text).toContain("office is closed on Fridays");
    expect(text).toContain("Lunch is at noon");
  });

  it("builds the index from a PDF and answers from it", async () => {
    fs.writeFileSync(path.join(dir, "file1.pdf"), SAMPLE_PDF);
    const kb = await loadKnowledgeBase("file1.vct", "file1.pdf", dir);
    expect(kb.index.chunks.map((c) => c.text).join(" ")).toContain("Penguins");
    expect(fs.existsSync(path.join(dir, "file1.vct"))).toBe(true);
  });

  it("loads a .vct source as it is", async () => {
    const built = await buildVct("a.txt", Buffer.from("a"), "Owls hunt at night.");
    fs.writeFileSync(path.join(dir, "owls.vct"), JSON.stringify(built));
    const kb = await loadKnowledgeBase("owls.vct", "owls.vct", dir);
    expect(kb.index.chunks[0].text).toBe("Owls hunt at night.");
  });

  it("says clearly when a PDF is a scan with no text to search", async () => {
    fs.writeFileSync(path.join(dir, "scan.pdf"), fs.readFileSync(path.join(here, "fixtures", "scanned.pdf")));
    await expect(loadKnowledgeBase("scan.vct", "scan.pdf", dir)).rejects.toThrow(/has no text in it.*OCR/);
  });

  it("says clearly when the source file is missing", async () => {
    await expect(loadKnowledgeBase("file1.vct", "missing.pdf", dir)).rejects.toThrow(/couldn't open the knowledge source 'missing.pdf'/);
  });
});

describe("rag in Ion scripts", () => {
  it("lets an agent search a knowledge base, end to end", async () => {
    fs.writeFileSync(path.join(dir, "handbook.txt"), "The office is closed on Fridays.\n\nLunch is at noon.");
    const { interp, out, notes } = harness();
    await interp.runSource(`rag handbook.vct from "handbook.txt"

agent clerk:
    model "mock"
    can search handbook.vct

say ask clerk 'CALL search_handbook_vct {"query": "office fridays"}'
`);
    expect(notes.join("\n")).toMatch(/handbook\.vct: built from handbook\.txt/);
    expect(out.join("\n")).toContain("closed on Fridays");
    expect(fs.existsSync(path.join(dir, "handbook.vct"))).toBe(true);
  });

  it("refuses a knowledge base name that doesn't end in .vct", async () => {
    const { interp } = harness();
    await expect(interp.runSource('rag handbook from "handbook.txt"')).rejects.toThrow(/must end in \.vct/);
  });

  it("refuses an agent that searches a knowledge base nobody built", async () => {
    const { interp } = harness();
    await expect(
      interp.runSource('agent clerk:\n    model "mock"\n    can search missing.vct')
    ).rejects.toThrow(/no knowledge base with that name is built above it/);
  });
});

describe("MCP servers in Ion scripts", () => {
  const script = (extra: string) => `mcp fake:
    command "node ${fakeServer}"

agent helper:
    model "mock"
    can use fake
    can run commands
${extra}`;

  it("lets an agent call a tool on an MCP server", async () => {
    const { interp, out } = harness();
    await interp.runSource(script(`
say ask helper 'CALL fake__echo {"text": "hello from mcp"}'
`));
    expect(out.join("\n")).toContain("Done: echo: hello from mcp");
  });

  it("calls a tool that takes numbers", async () => {
    const { interp, out } = harness();
    await interp.runSource(script(`
say ask helper 'CALL fake__add {"a": 2, "b": 40}'
`));
    expect(out.join("\n")).toContain("Done: 42");
  });

  it("asks permission before the first MCP call, and reports a refusal to the agent", async () => {
    const { interp, out } = harness({ confirm: false });
    await interp.runSource(script(`
say ask helper 'CALL fake__echo {"text": "no"}'
`));
    expect(out.join("\n")).toMatch(/was denied/);
  });

  it("refuses an agent that uses an MCP server without the ability to run commands", async () => {
    const { interp } = harness();
    await expect(
      interp.runSource(`mcp fake:
    command "node ${fakeServer}"

agent helper:
    model "mock"
    can use fake
`)
    ).rejects.toThrow(/MCP servers run programs on your computer/);
  });

  it("explains when the server command can't be started", async () => {
    const { interp } = harness();
    await expect(
      interp.runSource(`mcp broken:
    command "node no-such-file-here.mjs"

agent helper:
    model "mock"
    can use broken
    can run commands
`)
    ).rejects.toThrow(/couldn't connect to the MCP server 'broken'/);
  });
});

describe("the parser", () => {
  it("reads dotted knowledge base names and the mcp block", () => {
    const [mcp, rag] = parse('mcp notes:\n    command "x"\nrag file1.vct from "file1.pdf"\n');
    expect(mcp).toMatchObject({ k: "mcp", name: "notes" });
    expect(rag).toMatchObject({ k: "rag", name: "file1.vct" });
  });

  it("keeps mcp and rag usable as ordinary names", () => {
    expect(() => parse("set mcp to 3\nsay mcp\nset rag to 4\nsay rag")).not.toThrow();
  });
});
