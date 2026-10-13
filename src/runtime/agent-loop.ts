import { AgentConfig, ModelTarget } from "../interpreter/program.js";
import { resolveProvider } from "./providers/provider-table.js";
import { ChatMessage, ToolCall, ToolSpec } from "./providers/types.js";
import { ConfirmFn, GrantManager } from "./grants/grant-manager.js";
import { fileAccessTools, runFileAccessTool } from "./grants/file-access.js";
import { webBrowsingTools, runWebBrowsingTool } from "./grants/web-browsing.js";
import { shellExecTools, runShellExecTool } from "./grants/shell-exec.js";
import { gmailAccessTools, runGmailAccessTool } from "./grants/gmail-access.js";
import { GrantKind } from "../parser/ast.js";

const MAX_TURNS = 25;

export type ChunkFn = (agent: string, text: string) => void;
export type ToolCallFn = (agent: string, tool: string, detail: string) => void;
export type ToolResultFn = (agent: string, tool: string, result: string, isError: boolean, ms: number) => void;

const GRANT_DESCRIPTIONS: Record<GrantKind, string> = {
  "file-access": "reading/writing files",
  "web-browsing": "fetching URLs and browsing web pages",
  "shell-exec": "running shell commands",
  "gmail-access": "searching and reading the user's Gmail",
  "orchestration-powers": "delegating to teammates",
  "user-admin": "user administration"
};

function describeCapabilities(grants: GrantKind[], toolCount = 0): string {
  const described = grants.filter((g) => g !== "orchestration-powers").map((g) => GRANT_DESCRIPTIONS[g]);
  if (toolCount > 0) described.push("the tools you have been given");
  return described.length > 0 ? described.join(", ") : "general conversation, no special tool access";
}

/** One line per custom tool, so the instructions agree with the tools the agent really has. */
function describeTools(agent: AgentConfig): string {
  const tools = agent.extraTools ?? [];
  if (tools.length === 0) return "";
  const firstSentence = (d: string) => (d.split(/(?<=[.!?])\s/)[0] ?? d).slice(0, 160);
  return [
    `Tools you can call:`,
    ...tools.map((t) => `- ${t.name}: ${firstSentence(t.description)}`),
    `Call them whenever they help. Never say you lack a capability that one of your tools provides.`
  ].join("\n");
}

function buildSystemPrompt(agent: AgentConfig): string {
  const base = buildBasePrompt(agent);
  return agent.role ? `${agent.role}

${base}` : base;
}

function buildBasePrompt(agent: AgentConfig): string {
  if (agent.isOrchestrator) {
    const roster = agent.teammateInfo
      .map((t) => {
        const what = t.summary ?? describeCapabilities(t.grants, t.tools?.length ?? 0);
        return `- ${t.name}: ${what}${t.tools?.length ? ` Tools: ${t.tools.join(", ")}.` : ""} (via delegate_to_${t.name})`;
      })
      .join("\n");
    return [
      `You are '${agent.name}', the orchestrator of a team of specialist agents.`,
      `Your own capabilities: ${describeCapabilities(agent.grants.map((g) => g.kind), agent.extraTools?.length ?? 0)}.`,
      describeTools(agent),
      `Teammates you can delegate to:\n${roster}`,
      `For requests that span multiple specialties, chain delegate calls in sequence — e.g. delegate to a research-capable teammate first, then hand its output to another teammate who depends on it (such as one that drafts content from research). Only answer directly yourself when no teammate is better suited.`
    ].filter(Boolean).join("\n\n");
  }
  const toolCount = agent.extraTools?.length ?? 0;
  const caps = describeCapabilities(agent.grants.map((g) => g.kind), toolCount);
  const tools = describeTools(agent);
  if (agent.standalone) {
    return [`You are '${agent.name}'. Your capabilities: ${caps}.`, tools].filter(Boolean).join("\n\n");
  }
  return [
    `You are '${agent.name}', a specialist agent on a team. Your capabilities: ${caps}. Return clear, direct results — they may be consumed by a teammate or shown straight to the user.`,
    tools
  ].filter(Boolean).join("\n\n");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RETRY_WAIT_SECONDS = 40;

/** How long the provider asked us to wait (e.g. Gemini's "retryDelay": "17s"), if it said. */
function suggestedDelaySeconds(message: string): number | undefined {
  const m = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) ?? message.match(/retry (?:in|after) (\d+(?:\.\d+)?)\s*s/i);
  return m ? Number(m[1]) : undefined;
}

/** Rate limits and provider outages: worth waiting for, or switching to a backup model. */
export function isTransient(message: string): boolean {
  return /\berror (429|500|502|503|504)\b/.test(message);
}

/**
 * Rate limits (429) and brief provider outages (5xx) are normal. Wait as long as the provider asks and
 * try again, up to twice, instead of failing the whole conversation. Waits longer than
 * MAX_RETRY_WAIT_SECONDS mean a daily quota or a real outage, so those fail straight away.
 */
export async function sendWithRetry<T>(call: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const transient = isTransient(message);
      const wait = suggestedDelaySeconds(message) ?? [6, 15][attempt - 1] ?? 15;
      if (!transient || attempt >= attempts || wait > MAX_RETRY_WAIT_SECONDS) throw err;
      await sleep(wait * 1000);
    }
  }
}

export interface AgentLoopDeps {
  agent: AgentConfig;
  grantManager: GrantManager;
  /** Invoked when this agent needs to delegate to a teammate (orchestration-powers only). */
  delegate?: (teammate: string, task: string) => Promise<string>;
  onChunk?: ChunkFn;
  onToolCall?: ToolCallFn;
  onToolResult?: ToolResultFn;
  /** Called when the main model is unavailable and a backup takes over. */
  onFallback?: (agent: string, model: string, reason: string) => void;
}

export function buildToolSpecs(agent: AgentConfig): ToolSpec[] {
  const specs: ToolSpec[] = [];
  for (const grant of agent.grants) {
    if (grant.kind === "file-access") specs.push(...fileAccessTools);
    if (grant.kind === "web-browsing") specs.push(...webBrowsingTools);
    if (grant.kind === "shell-exec") specs.push(...shellExecTools);
    if (grant.kind === "gmail-access") specs.push(...gmailAccessTools);
  }
  if (agent.extraTools) specs.push(...agent.extraTools);
  if (agent.isOrchestrator) {
    for (const teammate of agent.teammates) {
      specs.push({
        name: `delegate_to_${teammate}`,
        description: `Delegate a task to the '${teammate}' teammate agent and return its final answer.`,
        parameters: {
          type: "object",
          properties: { task: { type: "string", description: "The task to hand off." } },
          required: ["task"]
        }
      });
    }
  }
  return specs;
}

function toolGrantKind(toolName: string): GrantKind | null {
  if (["read_file", "write_file", "list_files"].includes(toolName)) return "file-access";
  if (["fetch_url", "browse_page"].includes(toolName)) return "web-browsing";
  if (toolName === "run_command") return "shell-exec";
  if (["search_gmail", "read_gmail_message"].includes(toolName)) return "gmail-access";
  return null;
}

async function executeTool(
  call: ToolCall,
  deps: AgentLoopDeps
): Promise<string> {
  const kind = toolGrantKind(call.name);

  if (deps.agent.runExtraTool && deps.agent.extraTools?.some((t) => t.name === call.name)) {
    deps.onToolCall?.(deps.agent.name, call.name, JSON.stringify(call.arguments));
    return deps.agent.runExtraTool(call.name, call.arguments);
  }
  if (kind === "file-access") {
    deps.onToolCall?.(deps.agent.name, call.name, JSON.stringify(call.arguments));
    return runFileAccessTool(call.name, call.arguments, deps.grantManager);
  }
  if (kind === "web-browsing") {
    deps.onToolCall?.(deps.agent.name, call.name, JSON.stringify(call.arguments));
    return runWebBrowsingTool(call.name, call.arguments, deps.grantManager);
  }
  if (kind === "shell-exec") {
    deps.onToolCall?.(deps.agent.name, call.name, JSON.stringify(call.arguments));
    return runShellExecTool(call.name, call.arguments, deps.grantManager);
  }
  if (kind === "gmail-access") {
    deps.onToolCall?.(deps.agent.name, call.name, JSON.stringify(call.arguments));
    return runGmailAccessTool(call.name, call.arguments, deps.grantManager);
  }
  if (call.name.startsWith("delegate_to_")) {
    const teammate = call.name.slice("delegate_to_".length);
    const task = String(call.arguments.task ?? "");
    deps.onToolCall?.(deps.agent.name, call.name, task);
    if (!deps.delegate) {
      throw new Error(`agent '${deps.agent.name}' cannot delegate: no delegate handler configured`);
    }
    return await deps.delegate(teammate, task);
  }
  throw new Error(`unknown tool '${call.name}'`);
}

const MAX_COOLDOWN_MS = 10 * 60 * 1000;
/** Models that just failed with a rate limit or an outage, and when to try them again. Shared by every agent. */
const cooldowns = new Map<string, number>();

/** For tests. */
export function resetModelCooldowns(): void {
  cooldowns.clear();
}

const targetKey = (t: ModelTarget) =>
  `${t.provider.kind === "builtin" ? t.provider.name : t.provider.endpoint}|${t.model?.modelId ?? ""}|${t.apiKey.slice(-6)}`;

/** How long to leave a model alone: as long as it said (up to ten minutes), or two minutes for an outage. */
function cooldownMs(message: string): number {
  const seconds = suggestedDelaySeconds(message);
  return seconds === undefined ? 2 * 60 * 1000 : Math.min(seconds * 1000 + 2000, MAX_COOLDOWN_MS);
}

/**
 * Sends one request to the agent's main model, falling back to its backup models (in order) when the
 * main one is rate-limited or down. A model that fails this way is skipped for a while by every agent
 * (so a used-up daily quota is discovered once, not once per agent per message).
 */
async function sendToModel(deps: AgentLoopDeps, messages: ChatMessage[], tools: ToolSpec[]) {
  const agent = deps.agent;
  const all: ModelTarget[] = [{ provider: agent.provider, model: agent.model, apiKey: agent.apiKey }, ...(agent.fallbacks ?? [])];
  const now = Date.now();
  const available = all.filter((t) => (cooldowns.get(targetKey(t)) ?? 0) <= now);
  const order = available.length > 0 ? available : all; // everything is cooling down: try them anyway

  for (let i = 0; i < order.length; i++) {
    const target = order[i];
    try {
      return await sendWithRetry(() =>
        resolveProvider(target.provider).sendMessage({ messages, tools, model: target.model?.modelId, apiKey: target.apiKey })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isTransient(message)) throw err;
      cooldowns.set(targetKey(target), Date.now() + cooldownMs(message));
      if (i === order.length - 1) throw err;
      deps.onFallback?.(agent.name, order[i + 1].model?.modelId ?? "default", message.slice(0, 120));
    }
  }
  throw new Error("no model available"); // unreachable: the loop above returns or throws
}

/**
 * Runs one full turn (possibly several tool-calling round trips) for a single
 * agent given its conversation history plus a new incoming user message.
 * Returns the final text response and the updated history.
 */
export async function runTurn(
  history: ChatMessage[],
  userText: string,
  deps: AgentLoopDeps
): Promise<{ finalText: string; history: ChatMessage[] }> {
  const tools = buildToolSpecs(deps.agent);
  const messages: ChatMessage[] = [...history, { role: "user", content: userText }];
  const systemPrompt = buildSystemPrompt(deps.agent);

  let empties = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // After two empty replies, nudge the model once more (the nudge is not kept in the history)
    const nudge: ChatMessage[] = empties >= 2 ? [{ role: "user", content: "Please answer now, in words, using what you have so far." }] : [];
    const result = await sendToModel(deps, [{ role: "system", content: systemPrompt }, ...messages, ...nudge], tools);

    // Models occasionally return nothing at all (no text and no tool call). Ask again instead of showing a blank answer.
    if (!result.text.trim() && result.toolCalls.length === 0) {
      if (empties++ < 3) {
        turn--;
        continue;
      }
      throw new Error(`agent '${deps.agent.name}' kept returning an empty reply`);
    }

    if (result.text) deps.onChunk?.(deps.agent.name, result.text);

    if (result.toolCalls.length === 0) {
      messages.push({ role: "assistant", content: result.text });
      return { finalText: result.text, history: messages };
    }

    messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });

    for (const call of result.toolCalls) {
      let toolResult: string;
      let isError = false;
      const started = Date.now();
      try {
        toolResult = await executeTool(call, deps);
      } catch (err) {
        isError = true;
        toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      deps.onToolResult?.(deps.agent.name, call.name, toolResult, isError, Date.now() - started);
      messages.push({
        role: "tool",
        content: toolResult,
        toolCallId: call.id,
        toolName: call.name
      });
    }
  }

  throw new Error(
    `agent '${deps.agent.name}' exceeded the maximum of ${MAX_TURNS} tool-calling turns for a single message`
  );
}

export function makeGrantManager(agent: AgentConfig, confirmFn: ConfirmFn, autoYes: boolean): GrantManager {
  return new GrantManager(agent.name, agent.grants, confirmFn, autoYes);
}
