import { AgentConfig, ProgramConfig } from "../interpreter/program.js";
import { ChatMessage } from "./providers/types.js";
import { ConfirmFn } from "./grants/grant-manager.js";
import { makeGrantManager, runTurn, ChunkFn, ToolCallFn, ToolResultFn } from "./agent-loop.js";

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

  constructor(
    program: ProgramConfig,
    confirmFn: ConfirmFn,
    autoYes: boolean,
    onChunk?: ChunkFn,
    onToolCall?: ToolCallFn,
    onToolResult?: ToolResultFn
  ) {
    this.program = program;
    this.confirmFn = confirmFn;
    this.autoYes = autoYes;
    this.onChunk = onChunk;
    this.onToolCall = onToolCall;
    this.onToolResult = onToolResult;
    for (const agent of program.agents) this.histories.set(agent.name, []);
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

    const { finalText, history: updated } = await runTurn(history, text, {
      agent,
      grantManager,
      onChunk: this.onChunk,
      onToolCall: this.onToolCall,
      onToolResult: this.onToolResult,
      delegate: agent.isOrchestrator
        ? async (teammate: string, task: string) => this.sendToAgent(teammate, task)
        : undefined
    });

    this.histories.set(agentName, updated);
    return finalText;
  }
}
