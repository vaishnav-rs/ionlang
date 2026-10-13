export type ModelRef = { provider: string; modelId: string };

export type ProviderRef =
  | { kind: "builtin"; name: string; line: number }
  | {
      kind: "custom";
      endpoint: string;
      authHeader: string;
      requestFormat: "openai" | "anthropic" | "raw";
      line: number;
    };

export type GrantKind =
  | "file-access"
  | "web-browsing"
  | "shell-exec"
  | "orchestration-powers"
  | "gmail-access"
  | "user-admin";

export interface GrantNode {
  kind: GrantKind;
  scope?: string;
  line: number;
}

export type Modality = "text" | "voice";

export interface AgentDefNode {
  kind: "AgentDef";
  name: string;
  provider?: ProviderRef;
  apiKey?: { literal?: string; envVar?: string; line: number };
  model?: ModelRef;
  grants: GrantNode[];
  input?: Modality[];
  output?: Modality[];
  line: number;
}

export interface Program {
  kind: "Program";
  typeDecl?: { value: "team" | "single"; line: number };
  agents: AgentDefNode[];
}
