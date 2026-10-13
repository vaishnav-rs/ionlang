import { makeOpenAICompatible } from "./openai.js";
import { makeAnthropicCompatible } from "./anthropic.js";
import { ProviderAdapter, SendMessageRequest, SendMessageResult } from "./types.js";

export interface CustomProviderOptions {
  endpoint: string;
  authHeader: string;
  requestFormat: "openai" | "anthropic" | "raw";
}

/**
 * Your own endpoint: a local model server (Ollama, LM Studio, vLLM), a company gateway,
 * or any service that copies the OpenAI or Anthropic API. `raw` sends a plain JSON body.
 */
export function makeCustomProvider(opts: CustomProviderOptions): ProviderAdapter {
  if (opts.requestFormat === "openai") {
    return makeOpenAICompatible({
      name: "custom", label: "custom provider", endpoint: opts.endpoint, defaultModel: "", authHeader: opts.authHeader
    });
  }
  if (opts.requestFormat === "anthropic") {
    return makeAnthropicCompatible({
      name: "custom", label: "custom provider", endpoint: opts.endpoint, defaultModel: "", authHeader: opts.authHeader
    });
  }
  return {
    name: "custom",
    defaultModel: "",
    sendMessage: (req) => sendRaw(opts, req)
  };
}

async function sendRaw(opts: CustomProviderOptions, req: SendMessageRequest): Promise<SendMessageResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.apiKey) headers[opts.authHeader] = req.apiKey;
  const res = await fetch(opts.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: req.messages, tools: req.tools, model: req.model })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`custom provider error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as any;
  return {
    text: data.text ?? "",
    toolCalls: data.toolCalls ?? []
  };
}
