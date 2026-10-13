import { ProviderAdapter, SendMessageRequest, SendMessageResult } from "./types.js";

/**
 * Offline provider for demos and tests (`model "mock"`). No network, no key.
 *  - A user message of the form `CALL tool_name {"arg": "value"}` makes it call that tool.
 *  - After a tool result it replies "Done: <result>".
 *  - Anything else is echoed back as "mock reply: <message>".
 */
export const mock: ProviderAdapter = {
  name: "mock",
  defaultModel: "mock",

  async sendMessage(req: SendMessageRequest): Promise<SendMessageResult> {
    const last = req.messages[req.messages.length - 1];
    if (last?.role === "tool") return { text: `Done: ${last.content}`, toolCalls: [] };

    const text = last?.content ?? "";
    const m = text.match(/^CALL (\w+)(?: (\{.*\}))?$/m);
    if (m) {
      let args: Record<string, unknown> = {};
      try {
        args = m[2] ? JSON.parse(m[2]) : {};
      } catch {
        /* fall through with empty args */
      }
      return { text: "", toolCalls: [{ id: `mock-${m[1]}`, name: m[1], arguments: args }] };
    }
    return { text: `mock reply: ${text}`, toolCalls: [] };
  }
};
