import { ProviderAdapter, SendMessageRequest, SendMessageResult, ToolCall } from "./types.js";

export interface AnthropicCompatOptions {
  name: string;
  label: string;
  endpoint: string;
  defaultModel: string;
  /** Header that carries the key. Defaults to `x-api-key`. */
  authHeader?: string;
}

/** Adapter for Anthropic's Messages API, or any server that copies it. */
export function makeAnthropicCompatible(o: AnthropicCompatOptions): ProviderAdapter {
  return {
    name: o.name,
    defaultModel: o.defaultModel,

    async sendMessage(req: SendMessageRequest): Promise<SendMessageResult> {
      const model = req.model || o.defaultModel;
      const url = o.endpoint;

      const systemMessages = req.messages.filter((m) => m.role === "system");
      const conversational = req.messages.filter((m) => m.role !== "system");

      const messages = conversational.map((m) => {
        if (m.role === "tool") {
          return {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: m.toolCallId,
                content: m.content
              }
            ]
          };
        }
        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
          const content: any[] = [];
          if (m.content) content.push({ type: "text", text: m.content });
          for (const tc of m.toolCalls) {
            content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
          }
          return { role: "assistant", content };
        }
        return { role: m.role, content: m.content };
      });

      const body: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages
      };

      if (systemMessages.length > 0) {
        body.system = systemMessages.map((m) => m.content).join("\n");
      }

      if (req.tools && req.tools.length > 0) {
        body.tools = req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters
        }));
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      };
      if (req.apiKey) headers[o.authHeader || "x-api-key"] = req.apiKey;

      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${o.label} API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as any;
      const content: any[] = data.content ?? [];

      let text = "";
      const toolCalls: ToolCall[] = [];
      for (const block of content) {
        if (block.type === "text") text += block.text;
        if (block.type === "tool_use") {
          toolCalls.push({ id: block.id, name: block.name, arguments: block.input ?? {} });
        }
      }

      const u = data.usage;
      const usage = u ? { inputTokens: Number(u.input_tokens ?? 0), outputTokens: Number(u.output_tokens ?? 0) } : undefined;
      return { text, toolCalls, usage };
    }
  };
}

export const anthropic = makeAnthropicCompatible({
  name: "anthropic",
  label: "Anthropic",
  endpoint: "https://api.anthropic.com/v1/messages",
  defaultModel: "claude-sonnet-5"
});
