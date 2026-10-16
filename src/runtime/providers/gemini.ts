import { ProviderAdapter, SendMessageRequest, SendMessageResult, ToolCall } from "./types.js";

export const gemini: ProviderAdapter = {
  name: "gemini",
  defaultModel: "gemini-2.5-flash",

  async sendMessage(req: SendMessageRequest): Promise<SendMessageResult> {
    const model = req.model || gemini.defaultModel;
    // The key travels in a header, not the URL: URLs end up in error messages and proxy logs.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const systemMessages = req.messages.filter((m) => m.role === "system");
    const conversational = req.messages.filter((m) => m.role !== "system");

    const contents: any[] = [];
    for (const m of conversational) {
      if (m.role === "tool") {
        const part = { functionResponse: { name: m.toolName, response: { result: m.content } } };
        const last = contents[contents.length - 1];
        // every answer to one round of tool calls travels together, in a single "user" message
        if (last && last.role === "user" && last.parts.every((p: any) => p.functionResponse)) last.parts.push(part);
        else contents.push({ role: "user", parts: [part] });
      } else if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.toolCalls) {
          parts.push({
            functionCall: { name: tc.name, args: tc.arguments },
            // Gemini 3 models require the "thought signature" they sent with a tool call to be sent back
            ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {})
          });
        }
        contents.push({ role: "model", parts });
      } else {
        contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
      }
    }

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
            // Gemini rejects an object schema with no properties, so tools with no inputs omit it
            ...(Object.keys(t.parameters?.properties ?? {}).length > 0 ? { parameters: t.parameters } : {})
          }))
        }
      ];
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": req.apiKey },
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
          arguments: part.functionCall.args ?? {},
          ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {})
        });
      }
    }

    const u = data.usageMetadata;
    const usage = u ? { inputTokens: Number(u.promptTokenCount ?? 0), outputTokens: Number(u.candidatesTokenCount ?? 0) } : undefined;
    return { text, toolCalls, usage };
  }
};
