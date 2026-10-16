import * as crypto from "node:crypto";

/**
 * Turns text into vectors, so a question can find passages with the same meaning even when they
 * use different words. Gemini and OpenAI offer embedding models. Anthropic doesn't.
 */
export interface Embedder {
  /** The model as written in the script, such as "gemini/gemini-embedding-001". */
  readonly model: string;
  embed(texts: string[], purpose: "document" | "query"): Promise<number[][]>;
}

const BATCH = 96;

/** Key names each provider reads from the environment. */
const KEY_VARIABLE: Record<string, string> = { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY" };

/** Which embedding model an unspecified provider uses. */
const DEFAULT_EMBEDDING: Record<string, string> = { gemini: "gemini-embedding-001", openai: "text-embedding-3-small" };

/**
 * Builds the embedder for "provider/model", reading the key from the environment. "mock" works offline
 * and is for tests: its vectors only reflect shared words.
 */
export function makeEmbedder(modelText: string, env: NodeJS.ProcessEnv = process.env): Embedder {
  const slash = modelText.indexOf("/");
  const provider = slash < 0 ? modelText : modelText.slice(0, slash);
  let modelId = slash < 0 ? "" : modelText.slice(slash + 1);

  if (provider === "mock") return mockEmbedder(modelText);
  if (provider === "anthropic") {
    throw new Error(`Anthropic doesn't offer embedding models. Use gemini/gemini-embedding-001 or openai/text-embedding-3-small for meaning search.`);
  }
  if (!(provider in KEY_VARIABLE)) {
    throw new Error(`'${provider}' has no embedding models in Ion yet. Use gemini/gemini-embedding-001 or openai/text-embedding-3-small.`);
  }
  if (!modelId) modelId = DEFAULT_EMBEDDING[provider];
  const key = env[KEY_VARIABLE[provider]];
  if (!key) {
    throw new Error(`Meaning search with ${provider} needs the environment variable ${KEY_VARIABLE[provider]}, but it isn't set.`);
  }
  return provider === "gemini" ? geminiEmbedder(modelText, modelId, key) : openaiEmbedder(modelText, modelId, key);
}

function geminiEmbedder(model: string, id: string, key: string): Embedder {
  return {
    model,
    async embed(texts, purpose) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const requests = texts.slice(i, i + BATCH).map((text) => ({
          model: `models/${id}`,
          content: { parts: [{ text }] },
          taskType: purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT"
        }));
        const data = await postJson(
          `https://generativelanguage.googleapis.com/v1beta/models/${id}:batchEmbedContents`,
          { "x-goog-api-key": key },
          { requests }
        );
        for (const e of data.embeddings ?? []) out.push(e.values);
      }
      return out;
    }
  };
}

function openaiEmbedder(model: string, id: string, key: string): Embedder {
  return {
    model,
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const data = await postJson(
          "https://api.openai.com/v1/embeddings",
          { Authorization: `Bearer ${key}` },
          { model: id, input: texts.slice(i, i + BATCH) }
        );
        const rows = [...(data.data ?? [])].sort((a: any, b: any) => a.index - b.index);
        for (const row of rows) out.push(row.embedding);
      }
      return out;
    }
  };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    throw new Error(`could not reach the embedding service: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`the embedding service answered ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

/**
 * An offline stand-in: each word adds to one of 256 buckets, then the vector is scaled to length 1.
 * It only reflects shared words, so it is for tests, not for meaning.
 */
function mockEmbedder(model: string): Embedder {
  return {
    model,
    async embed(texts) {
      return texts.map((text) => {
        const v = new Array<number>(256).fill(0);
        for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
          const bucket = crypto.createHash("md5").update(word).digest().readUInt8(0);
          v[bucket] += 1;
        }
        const length = Math.hypot(...v) || 1;
        return v.map((x) => x / length);
      });
    }
  };
}

/** How alike two vectors are, from -1 to 1. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
