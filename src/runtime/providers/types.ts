export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Gemini 3 attaches one to each tool call and requires it back on the next request. */
  thoughtSignature?: string;
}

export interface SendMessageRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  model?: string;
  apiKey: string;
}

export interface SendMessageResult {
  text: string;
  toolCalls: ToolCall[];
  /** Tokens the provider billed for this call, when it reports them. */
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ProviderAdapter {
  name: string;
  defaultModel: string;
  sendMessage(req: SendMessageRequest): Promise<SendMessageResult>;
}
