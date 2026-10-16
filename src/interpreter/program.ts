import { AgentDefNode, GrantKind, GrantNode, Modality, ModelRef, ProviderRef } from "../parser/ast.js";
import { ResolvedProgram } from "../semantic/semantic.js";
import { ToolSpec } from "../runtime/providers/types.js";
import { audit } from "../runtime/audit.js";

/** One model an agent can talk to: where, which model, and the key for it. */
export interface ModelTarget {
  provider: ProviderRef;
  model?: ModelRef;
  apiKey: string;
}

export interface TeammateInfo {
  name: string;
  grants: GrantKind[];
  tools?: string[]; // names of the custom tools this teammate has
  summary?: string; // one sentence about what it is for (the start of its role)
}

export interface AgentConfig {
  name: string;
  provider: ProviderRef;
  apiKey: string;
  model?: ModelRef;
  grants: GrantNode[];
  input: Modality[];
  output: Modality[];
  isOrchestrator: boolean;
  teammates: string[]; // other agent names, for delegate_to_<agent> tool synthesis
  teammateInfo: TeammateInfo[]; // capability summary of each teammate, for system-prompt synthesis
  /** Optional extras used by the Ion scripting language (src/lang). */
  role?: string; // free-text instructions prepended to the system prompt
  standalone?: boolean; // not part of any team: skip the "specialist on a team" wording
  team?: boolean; // this config stands for a whole team (its lead plus members)
  memory?: boolean; // keep conversation history between asks (default true)
  fallbacks?: ModelTarget[]; // backup models, tried in order when the main one is rate-limited or down
  extraTools?: ToolSpec[]; // user-defined tools
  runExtraTool?: (name: string, args: Record<string, unknown>) => Promise<string>;
}

export interface ProgramConfig {
  type: "team" | "single";
  agents: AgentConfig[];
  entryPoints: string[];
}

export class ProgramBuildError extends Error {}

export function buildProgramConfig(resolved: ResolvedProgram): ProgramConfig {
  const agents: AgentConfig[] = resolved.agents.map((a) => buildAgentConfig(a, resolved.agents));
  return {
    type: resolved.type,
    agents,
    entryPoints: resolved.entryPoints
  };
}

function buildAgentConfig(agent: AgentDefNode, all: AgentDefNode[]): AgentConfig {
  if (!agent.provider) {
    throw new ProgramBuildError(`agent '${agent.name}' has no provider`);
  }
  const apiKey = resolveApiKey(agent);
  audit.addSecret(apiKey); // keep it out of the run log and error text
  const isOrchestrator = agent.grants.some((g) => g.kind === "orchestration-powers");
  const others = isOrchestrator ? all.filter((a) => a.name !== agent.name) : [];

  return {
    name: agent.name,
    provider: agent.provider,
    apiKey,
    model: agent.model,
    grants: agent.grants,
    input: agent.input ?? [],
    output: agent.output ?? [],
    isOrchestrator,
    teammates: others.map((a) => a.name),
    teammateInfo: others.map((a) => ({
      name: a.name,
      grants: a.grants.map((g) => g.kind)
    }))
  };
}

function resolveApiKey(agent: AgentDefNode): string {
  if (!agent.apiKey) {
    throw new ProgramBuildError(`agent '${agent.name}' has no ai-apikey`);
  }
  if (agent.apiKey.envVar) {
    const val = process.env[agent.apiKey.envVar];
    if (!val) {
      throw new ProgramBuildError(
        `agent '${agent.name}': environment variable '${agent.apiKey.envVar}' is not set`
      );
    }
    return val;
  }
  if (agent.apiKey.literal !== undefined) {
    return agent.apiKey.literal;
  }
  throw new ProgramBuildError(`agent '${agent.name}' has an invalid ai-apikey`);
}
