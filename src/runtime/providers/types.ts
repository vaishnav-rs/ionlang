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
}

export interface ProviderAdapter {
  name: string;
  defaultModel: string;
  sendMessage(req: SendMessageRequest): Promise<SendMessageResult>;
}
