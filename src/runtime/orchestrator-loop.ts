import { AgentConfig, ProgramConfig } from "../interpreter/program.js";
import { ChatMessage } from "./providers/types.js";
import { ConfirmFn } from "./grants/grant-manager.js";
import { makeGrantManager, runTurn, ChunkFn, ToolCallFn, ToolResultFn } from "./agent-loop.js";
import { audit } from "./audit.js";
import { HistoryStore } from "./history-store.js";

/**
 * Holds one conversation history per agent within a single session/connection,
 * and wires up delegate_to_<teammate> tool calls to invoke that teammate's own
 * loop (with its own history) rather than a separate protocol.
 */
export class OrchestratorSession {
  private program: ProgramConfig;
  private histories = new Map<string, ChatMessage[]>();
  private confirmFn: ConfirmFn;
  private autoYes: boolean;
  private onChunk?: ChunkFn;
  private onToolCall?: ToolCallFn;
  private onToolResult?: ToolResultFn;
  private store?: HistoryStore;
  private storeKey?: string;

  constructor(
    program: ProgramConfig,
    confirmFn: ConfirmFn,
    autoYes: boolean,
    onChunk?: ChunkFn,
    onToolCall?: ToolCallFn,
    onToolResult?: ToolResultFn,
    /** When given, the conversation is loaded from and saved to this store under `storeKey`. */
    store?: HistoryStore,
    storeKey?: string
  ) {
    this.program = program;
    this.confirmFn = confirmFn;
    this.autoYes = autoYes;
    this.onChunk = onChunk;
    this.onToolCall = onToolCall;
    this.onToolResult = onToolResult;
    for (const agent of program.agents) this.histories.set(agent.name, []);
    this.store = store;
    this.storeKey = storeKey;
    if (store && storeKey) {
      const saved = store.load(storeKey);
      for (const agent of program.agents) if (saved[agent.name]) this.histories.set(agent.name, saved[agent.name]);
    }
  }

  private getAgent(name: string): AgentConfig {
    const agent = this.program.agents.find((a) => a.name === name);
    if (!agent) throw new Error(`no such agent '${name}'`);
    return agent;
  }

  async sendToAgent(agentName: string, text: string): Promise<string> {
    const agent = this.getAgent(agentName);
    const history = this.histories.get(agentName) ?? [];
    const grantManager = makeGrantManager(agent, this.confirmFn, this.autoYes);
    audit.record("message", { agent: agentName, role: "user", text }, `${agentName} · message in`);

    let result: { finalText: string; history: ChatMessage[] };
    try {
      result = await runTurn(history, text, {
        agent,
        grantManager,
        onChunk: this.onChunk,
        onToolCall: this.onToolCall,
        onToolResult: this.onToolResult,
        delegate: agent.isOrchestrator
          ? async (teammate: string, task: string) => this.sendToAgent(teammate, task)
          : undefined
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      audit.record("error", { agent: agentName, message }, `${agentName} · error`);
      throw e;
    }

    this.histories.set(agentName, result.history);
    if (this.store && this.storeKey) {
      this.store.save(this.storeKey, Object.fromEntries(this.histories));
    }
    audit.record("message", { agent: agentName, role: "assistant", text: result.finalText }, `${agentName} · replied`);
    return result.finalText;
  }
}
