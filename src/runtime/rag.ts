import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
// The PDF reader normally loads its worker from a separate file. A single-file program has no such
// file, so the worker is bundled in and registered here; the reader uses it in-process instead.
import * as pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= pdfWorker;
import { cosine, Embedder, makeEmbedder } from "./embeddings.js";

/**
 * Knowledge bases ("rag" in Ion). A source file (text, Markdown or PDF) is split into chunks and
 * saved in a .vct file next to the script. Agents search it in one of two ways:
 *   - by meaning, when the knowledge base has an embedding model (the chunks store vectors), or
 *   - by keyword, ranked with BM25, when it doesn't.
 *
 * The .vct file is JSON, so you can read it and check what an agent can see:
 *   { "format": "ion-vct", "version": 2, "source": "...", "sourceHash": "...", "embeddingModel": "...", "chunks": [...] }
 */

export interface VctChunk {
  id: number;
  text: string;
  /** The meaning of the chunk, when the knowledge base was built with an embedding model. */
  vector?: number[];
}

export interface VctFile {
  format: "ion-vct";
  version: 1 | 2;
  source: string;
  sourceHash: string;
  /** The embedding model used to build the vectors, or "" for keyword search only. */
  embeddingModel: string;
  chunks: VctChunk[];
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 160;
/** Vectors are stored with this many decimal places, which keeps the .vct file a sensible size. */
const VECTOR_DIGITS = 5;

/** Splits text into chunks of about CHUNK_SIZE characters, on paragraph boundaries where possible. */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  // paragraphs longer than a chunk are cut into windows first, so no piece is bigger than a chunk
  const pieces: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= size) {
      pieces.push(p);
      continue;
    }
    for (let i = 0; i < p.length; i += size - overlap) pieces.push(p.slice(i, i + size));
  }

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + 1 + piece.length > size) {
      chunks.push(current);
      // start the next chunk with the end of this one, so a sentence split across chunks is still found;
      // the overlap is dropped when it would push the new chunk over the limit
      const carry = current.slice(Math.max(0, current.length - overlap)).replace(/^\S*\s/, "");
      current = carry && carry.length + 1 + piece.length <= size ? carry : "";
    }
    current = current ? `${current}\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Reads the text of a source file. PDFs are read with their text layer; other files as UTF-8. */
export async function readSourceText(file: string, bytes: Buffer): Promise<string> {
  if (path.extname(file).toLowerCase() === ".pdf") {
    const doc = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false, useSystemFonts: false }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    const text = pages.join("\n\n").trim();
    if (!text) {
      // pictures of pages have no text layer, so nothing can be searched in them
      throw new Error(`'${file}' has no text in it. It is probably a scan (pictures of pages). Ion can't read scanned pages yet, so run it through an OCR tool first, such as ocrmypdf, and try again.`);
    }
    return text;
  }
  return bytes.toString("utf-8");
}

function hashOf(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** Chunks a source and, when an embedder is given, gives every chunk its vector. */
export async function buildVct(sourceName: string, sourceBytes: Buffer, text: string, embedder?: Embedder): Promise<VctFile> {
  const texts = chunkText(text);
  const vectors = embedder ? await embedder.embed(texts, "document") : undefined;
  return {
    format: "ion-vct",
    version: 2,
    source: sourceName,
    sourceHash: hashOf(sourceBytes),
    embeddingModel: embedder?.model ?? "",
    chunks: texts.map((t, id) => ({
      id,
      text: t,
      ...(vectors ? { vector: vectors[id].map((x) => Number(x.toFixed(VECTOR_DIGITS))) } : {})
    }))
  };
}

export function parseVct(json: string): VctFile {
  const data = JSON.parse(json);
  if (data?.format !== "ion-vct" || !Array.isArray(data.chunks)) throw new Error("not an Ion knowledge file (.vct)");
  // files written before meaning search have no embeddingModel, which means keyword search only
  return { ...data, embeddingModel: data.embeddingModel ?? "" } as VctFile;
}

/** The knowledge file next to the script, if it is current for this source, otherwise undefined. */
export function currentVct(name: string, source: string, baseDir: string): VctFile | undefined {
  try {
    const bytes = fs.readFileSync(path.resolve(baseDir, source));
    const existing = parseVct(fs.readFileSync(path.resolve(baseDir, name), "utf-8"));
    return existing.sourceHash === hashOf(bytes) ? existing : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Loads the knowledge base named `name` (e.g. file1.vct) for `source` (e.g. file1.pdf).
 * A .vct source is loaded as it is. Any other source is chunked into the .vct file, which is rebuilt
 * only when the source or the embedding model has changed since the last build.
 */
export async function loadKnowledgeBase(
  name: string,
  source: string,
  baseDir: string,
  embedder?: Embedder | "keep"
): Promise<{ index: VctFile; path: string; rebuilt: boolean; embedder?: Embedder }> {
  const sourcePath = path.resolve(baseDir, source);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(sourcePath);
  } catch {
    throw new Error(`I couldn't open the knowledge source '${source}'.`);
  }

  if (path.extname(source).toLowerCase() === ".vct") {
    return { index: parseVct(bytes.toString("utf-8")), path: sourcePath, rebuilt: false };
  }

  const vctPath = path.resolve(baseDir, name);
  const hash = hashOf(bytes);
  try {
    const existing = parseVct(fs.readFileSync(vctPath, "utf-8"));
    // "keep" reuses the file as it is, including the model it was built with
    const sameModel = embedder === "keep" || existing.embeddingModel === (embedder?.model ?? "");
    if (existing.sourceHash === hash && sameModel) {
      // a reused file that was built by meaning still needs its model, to turn questions into vectors
      const kept = existing.embeddingModel ? makeEmbedder(existing.embeddingModel) : undefined;
      return { index: existing, path: vctPath, rebuilt: false, embedder: embedder === "keep" ? kept : embedder };
    }
  } catch {
    /* missing or unreadable: build it below */
  }

  const built = embedder === "keep" ? undefined : embedder;
  const index = await buildVct(source, bytes, await readSourceText(source, bytes), built);
  if (index.chunks.length === 0) throw new Error(`the knowledge source '${source}' has no readable text.`);
  const tmp = `${vctPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2), "utf-8");
  fs.renameSync(tmp, vctPath);
  return { index, path: vctPath, rebuilt: true, embedder: built };
}

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "was", "with"]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOP_WORDS.has(t));
}

/** The best-matching chunks for a question by keyword, ranked by BM25. Chunks with no matching word are left out. */
export function searchChunks(index: VctFile, query: string, limit = 3): VctChunk[] {
  const k1 = 1.5;
  const lengthWeight = 0.75;
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0 || index.chunks.length === 0) return [];

  const docs = index.chunks.map((c) => tokenize(c.text));
  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1;
  const docFreq = new Map<string, number>();
  for (const term of terms) docFreq.set(term, docs.filter((d) => d.includes(term)).length);

  const scored = index.chunks.map((chunk, i) => {
    const doc = docs[i];
    let score = 0;
    for (const term of terms) {
      const tf = doc.filter((w) => w === term).length;
      if (tf === 0) continue;
      const df = docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - lengthWeight + (lengthWeight * doc.length) / avgLength)));
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id - b.chunk.id)
    .slice(0, limit)
    .map((s) => s.chunk);
}

/** The chunks closest in meaning to a question's vector, most alike first. */
export function searchByMeaning(index: VctFile, questionVector: number[], limit = 3): VctChunk[] {
  return index.chunks
    .filter((c) => c.vector)
    .map((chunk) => ({ chunk, score: cosine(questionVector, chunk.vector!) }))
    .sort((a, b) => b.score - a.score || a.chunk.id - b.chunk.id)
    .slice(0, limit)
    .map((s) => s.chunk);
}

/** The tool name an agent sees for a knowledge base: file1.vct becomes search_file1_vct. */
export function searchToolName(kbName: string): string {
  return `search_${kbName.replace(/[^A-Za-z0-9]/g, "_")}`;
}
