import { ProviderAdapter, SendMessageRequest, SendMessageResult, ToolCall } from "./types.js";

export const gemini: ProviderAdapter = {
  name: "gemini",
  defaultModel: "gemini-2.5-flash",

  async sendMessage(req: SendMessageRequest): Promise<SendMessageResult> {
    const model = req.model || gemini.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${req.apiKey}`;

    const systemMessages = req.messages.filter((m) => m.role === "system");
    const conversational = req.messages.filter((m) => m.role !== "system");

    const contents = conversational.map((m) => {
      if (m.role === "tool") {
        return {
          role: "function",
          parts: [
            {
              functionResponse: {
                name: m.toolName,
                response: { result: m.content }
              }
            }
          ]
        };
      }
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "model",
          parts: m.toolCalls.map((tc) => ({
            functionCall: { name: tc.name, args: tc.arguments }
          }))
        };
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      };
    });

    const body: Record<string, unknown> = { contents };

    if (systemMessages.length > 0) {
      body.systemInstruction = {
        parts: [{ text: systemMessages.map((m) => m.content).join("\n") }]
      };
    }

    if (req.tools && req.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }))
        }
      ];
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as any;
    const candidate = data.candidates?.[0];
    const parts: any[] = candidate?.content?.parts ?? [];

    let text = "";
    const toolCalls: ToolCall[] = [];
    let callIndex = 0;
    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: `${part.functionCall.name}-${callIndex++}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {}
        });
      }
    }

    return { text, toolCalls };
  }
};
