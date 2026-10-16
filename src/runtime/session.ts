import { ProgramConfig } from "../interpreter/program.js";
import { OrchestratorSession } from "./orchestrator-loop.js";
import { ConfirmFn } from "./grants/grant-manager.js";
import { ChunkFn, ToolCallFn, ToolResultFn } from "./agent-loop.js";
import { HistoryStore } from "./history-store.js";

/** One Session wraps one OrchestratorSession bound to whichever entry-point
 *  agent this connection/session is talking to. */
export class Session {
  readonly id: string;
  readonly entryAgent: string;
  private orchestratorSession: OrchestratorSession;

  constructor(
    id: string,
    program: ProgramConfig,
    entryAgent: string,
    confirmFn: ConfirmFn,
    autoYes: boolean,
    onChunk?: ChunkFn,
    onToolCall?: ToolCallFn,
    onToolResult?: ToolResultFn,
    store?: HistoryStore
  ) {
    this.id = id;
    this.entryAgent = entryAgent;
    this.orchestratorSession = new OrchestratorSession(program, confirmFn, autoYes, onChunk, onToolCall, onToolResult, store, id);
  }

  async send(text: string, addressedTo?: string): Promise<string> {
    const outgoing =
      addressedTo && addressedTo !== this.entryAgent
        ? `[User addressed this message directly to @${addressedTo}. Strongly prefer delegating to '${addressedTo}' via delegate_to_${addressedTo} unless that clearly doesn't fit the request.]\n\n${text}`
        : text;
    return this.orchestratorSession.sendToAgent(this.entryAgent, outgoing);
  }
}

export class SessionStore {
  private sessions = new Map<string, Session>();

  create(
    id: string,
    program: ProgramConfig,
    entryAgent: string,
    confirmFn: ConfirmFn,
    autoYes: boolean,
    onChunk?: ChunkFn,
    onToolCall?: ToolCallFn,
    onToolResult?: ToolResultFn,
    store?: HistoryStore
  ): Session {
    const session = new Session(id, program, entryAgent, confirmFn, autoYes, onChunk, onToolCall, onToolResult, store);
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getOrCreate(
    id: string,
    program: ProgramConfig,
    entryAgent: string,
    confirmFn: ConfirmFn,
    autoYes: boolean,
    onChunk?: ChunkFn,
    onToolCall?: ToolCallFn,
    onToolResult?: ToolResultFn,
    store?: HistoryStore
  ): Session {
    return this.get(id) ?? this.create(id, program, entryAgent, confirmFn, autoYes, onChunk, onToolCall, onToolResult, store);
  }
}
