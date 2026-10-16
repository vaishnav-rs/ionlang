import { ProviderAdapter, SendMessageRequest, SendMessageResult, ToolCall } from "./types.js";

export interface OpenAICompatOptions {
  name: string;
  /** Used in error messages, e.g. "Groq". */
  label: string;
  endpoint: string;
  defaultModel: string;
  /** Header that carries the key. Defaults to `Authorization: Bearer <key>`. */
  authHeader?: string;
}

/**
 * Adapter for any server that speaks the OpenAI "chat completions" API:
 * OpenAI itself, OpenRouter, Groq, Cerebras, Ollama, LM Studio, vLLM, and more.
 */
export function makeOpenAICompatible(o: OpenAICompatOptions): ProviderAdapter {
  const adapter: ProviderAdapter = {
    name: o.name,
    defaultModel: o.defaultModel,

    async sendMessage(req: SendMessageRequest): Promise<SendMessageResult> {
      const model = req.model || o.defaultModel;

      const messages = req.messages.map((m) => {
        if (m.role === "tool") {
          return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
        }
        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: "assistant",
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
            }))
          };
        }
        return { role: m.role, content: m.content };
      });

      const body: Record<string, unknown> = { model, messages };

      if (req.tools && req.tools.length > 0) {
        body.tools = req.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters }
        }));
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (req.apiKey) {
        if (!o.authHeader || o.authHeader.toLowerCase() === "authorization") {
          headers.Authorization = /^bearer\s/i.test(req.apiKey) ? req.apiKey : `Bearer ${req.apiKey}`;
        } else {
          headers[o.authHeader] = req.apiKey;
        }
      }

      const res = await fetch(o.endpoint, { method: "POST", headers, body: JSON.stringify(body) });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${o.label} API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as any;
      const message = data.choices?.[0]?.message ?? {};

      const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseJson(tc.function.arguments)
      }));

      const u = data.usage;
      const usage = u ? { inputTokens: Number(u.prompt_tokens ?? 0), outputTokens: Number(u.completion_tokens ?? 0) } : undefined;
      return { text: message.content ?? "", toolCalls, usage };
    }
  };
  return adapter;
}

export const openai = makeOpenAICompatible({
  name: "openai",
  label: "OpenAI",
  endpoint: "https://api.openai.com/v1/chat/completions",
  defaultModel: "gpt-4o-mini"
});

/** One key, hundreds of models. Model ids look like `anthropic/claude-3.5-sonnet`. */
export const openrouter = makeOpenAICompatible({
  name: "openrouter",
  label: "OpenRouter",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  defaultModel: "openai/gpt-4o-mini"
});

export const groq = makeOpenAICompatible({
  name: "groq",
  label: "Groq",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  defaultModel: "llama-3.3-70b-versatile"
});

export const cerebras = makeOpenAICompatible({
  name: "cerebras",
  label: "Cerebras",
  endpoint: "https://api.cerebras.ai/v1/chat/completions",
  defaultModel: "llama-3.3-70b"
});

function safeParseJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
