import { describe, it, expect, afterEach } from "vitest";
import { openrouter, groq, cerebras } from "../src/runtime/providers/openai.js";
import { makeCustomProvider } from "../src/runtime/providers/custom.js";
import { resolveProvider } from "../src/runtime/providers/provider-table.js";
import { Interpreter, IonIO } from "../src/lang/interpreter.js";
import { IonError } from "../src/lang/errors.js";
import { parse } from "../src/lang/parser.js";
import { check } from "../src/lang/check.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Seen { url: string; headers: Record<string, string>; body: any }

function stubFetch(reply = "pong"): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    seen.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: reply, tool_calls: [] } }] }), { status: 200 });
  }) as typeof fetch;
  return seen;
}

const msg = { messages: [{ role: "user" as const, content: "ping" }], apiKey: "k" };

describe("OpenAI-compatible providers", () => {
  it.each([
    ["openrouter", openrouter, "https://openrouter.ai/api/v1/chat/completions", "openai/gpt-4o-mini", "OpenRouter"],
    ["groq", groq, "https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile", "Groq"],
    ["cerebras", cerebras, "https://api.cerebras.ai/v1/chat/completions", "llama-3.3-70b", "Cerebras"]
  ])("%s calls its own endpoint with a Bearer key and its default model", async (_n, adapter, url, model) => {
    const seen = stubFetch();
    const r = await adapter.sendMessage(msg);
    expect(r.text).toBe("pong");
    expect(seen[0].url).toBe(url);
    expect(seen[0].headers.Authorization).toBe("Bearer k");
    expect(seen[0].body.model).toBe(model);
  });

  it("uses the model you pick, including ids that contain slashes (OpenRouter)", async () => {
    const seen = stubFetch();
    await openrouter.sendMessage({ ...msg, model: "anthropic/claude-3.5-sonnet" });
    expect(seen[0].body.model).toBe("anthropic/claude-3.5-sonnet");
  });

  it("names the provider in API errors", async () => {
    globalThis.fetch = (async () => new Response("rate limited", { status: 429 })) as typeof fetch;
    await expect(groq.sendMessage(msg)).rejects.toThrow(/Groq API error 429/);
  });

  it("are all registered", () => {
    for (const name of ["openrouter", "groq", "cerebras", "openai"]) {
      expect(resolveProvider({ kind: "builtin", name, line: 1 }).name).toBe(name);
    }
  });
});

describe("custom provider", () => {
  it("openai format sends no Authorization header when there is no key (local models)", async () => {
    const seen = stubFetch();
    const p = makeCustomProvider({ endpoint: "http://localhost:11434/v1/chat/completions", authHeader: "Authorization", requestFormat: "openai" });
    await p.sendMessage({ ...msg, apiKey: "", model: "llama3" });
    expect(seen[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(seen[0].headers.Authorization).toBeUndefined();
    expect(seen[0].body.model).toBe("llama3");
  });

  it("puts the key in a custom header, raw", async () => {
    const seen = stubFetch();
    const p = makeCustomProvider({ endpoint: "https://gw.example/chat", authHeader: "X-Api-Key", requestFormat: "openai" });
    await p.sendMessage({ ...msg, model: "m" });
    expect(seen[0].headers["X-Api-Key"]).toBe("k");
    expect(seen[0].headers.Authorization).toBeUndefined();
  });

  it("does not double a Bearer prefix that is already in the key", async () => {
    const seen = stubFetch();
    const p = makeCustomProvider({ endpoint: "https://gw.example/chat", authHeader: "Authorization", requestFormat: "openai" });
    await p.sendMessage({ ...msg, apiKey: "Bearer abc", model: "m" });
    expect(seen[0].headers.Authorization).toBe("Bearer abc");
  });

  it("concurrent calls to different endpoints never cross over", async () => {
    const seen = stubFetch();
    const a = makeCustomProvider({ endpoint: "https://a.example/chat", authHeader: "Authorization", requestFormat: "openai" });
    const b = makeCustomProvider({ endpoint: "https://b.example/chat", authHeader: "Authorization", requestFormat: "openai" });
    await Promise.all([a.sendMessage({ ...msg, model: "m" }), b.sendMessage({ ...msg, model: "m" }), a.sendMessage({ ...msg, model: "m" })]);
    expect(seen.map((s) => s.url).sort()).toEqual(["https://a.example/chat", "https://a.example/chat", "https://b.example/chat"]);
  });

  it("raw format posts plain JSON and reads text back", async () => {
    let body: any;
    globalThis.fetch = (async (_u: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ text: "raw answer" }), { status: 200 });
    }) as typeof fetch;
    const p = makeCustomProvider({ endpoint: "https://raw.example", authHeader: "X-K", requestFormat: "raw" });
    expect((await p.sendMessage({ ...msg, model: "m" })).text).toBe("raw answer");
    expect(body.model).toBe("m");
  });
});

describe("providers in the Ion language", () => {
  async function run(src: string, env: Record<string, string> = {}) {
    const out: string[] = [];
    const io: IonIO = { say: (t) => void out.push(t), note: () => {}, readLine: async () => null, confirm: async () => true };
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
    try {
      await new Interpreter({ io }).runSource(src);
    } finally {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    }
    return out;
  }

  it("openrouter / groq / cerebras read their own key variables", async () => {
    const seen = stubFetch("hello");
    const out = await run(
      'agent a:\n    model "groq/llama-3.1-8b-instant"\nagent b:\n    model "openrouter/anthropic/claude-3.5-sonnet"\nagent c:\n    model "cerebras"\nsay ask a "x"\nsay ask b "x"\nsay ask c "x"',
      { GROQ_API_KEY: "g-key", OPENROUTER_API_KEY: "or-key", CEREBRAS_API_KEY: "c-key" }
    );
    expect(out).toEqual(["hello", "hello", "hello"]);
    expect(seen.map((s) => [s.url.split("/")[2], s.headers.Authorization, s.body.model])).toEqual([
      ["api.groq.com", "Bearer g-key", "llama-3.1-8b-instant"],
      ["openrouter.ai", "Bearer or-key", "anthropic/claude-3.5-sonnet"],
      ["api.cerebras.ai", "Bearer c-key", "llama-3.3-70b"]
    ]);
  });

  it("a missing key names the right variable", async () => {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      await expect(run('agent a:\n    model "groq/x"\nsay ask a "hi"')).rejects.toThrow(/GROQ_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.GROQ_API_KEY = saved;
    }
  });

  it("custom: a local model with no key", async () => {
    const seen = stubFetch("local says hi");
    const out = await run('agent local:\n    model "custom/llama3"\n    endpoint "http://localhost:11434/v1/chat/completions"\nsay ask local "hi"');
    expect(out).toEqual(["local says hi"]);
    expect(seen[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(seen[0].body.model).toBe("llama3");
    expect(seen[0].headers.Authorization).toBeUndefined();
  });

  it("custom: key, header and format settings", async () => {
    const seen = stubFetch();
    await run('agent a:\n    model "custom/m"\n    endpoint "https://gw.example/v1"\n    format openai\n    header "X-Api-Key"\n    key "secret"\nsay ask a "hi"');
    expect(seen[0].headers["X-Api-Key"]).toBe("secret");
  });

  it("custom: friendly errors", async () => {
    await expect(run('agent a:\n    model "custom/m"')).rejects.toThrow(/needs an endpoint/);
    await expect(run('agent a:\n    model "custom"\n    endpoint "http://x"')).rejects.toThrow(/model name after "custom\/"/);
    await expect(run('agent a:\n    model "openai/x"\n    endpoint "http://x"')).rejects.toThrow(/only work with a custom provider/);
    expect(() => parse('agent a:\n    model "custom/m"\n    format xml')).toThrow(/openai, anthropic or raw/);
  });

  it("ion check covers the new settings", () => {
    const msgs = check(parse('agent a:\n    model "custom/m"\nagent b:\n    model "groq/x"\n    endpoint "http://x"\nagent c:\n    model "custom"\n    endpoint "http://x"')).map((d) => d.message);
    expect(msgs.join("\n")).toMatch(/Agent 'a' uses a custom provider/);
    expect(msgs.join("\n")).toMatch(/Agent 'b'.*only work with model "custom/);
    expect(msgs.join("\n")).toMatch(/Agent 'c' needs a model name/);
    expect(check(parse('agent a:\n    model "groq/x"\n    key "k"'))).toEqual([]);
  });

  it("unknown provider hints include the new ones", async () => {
    const e = await run('agent a:\n    model "grok/x"').catch((x) => x as IonError);
    expect(e.hint).toMatch(/groq/);
  });
});
