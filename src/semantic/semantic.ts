import { AgentDefNode, GrantKind, Program } from "../parser/ast.js";

export class SemanticError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Semantic error at line ${line}: ${message}`);
    this.line = line;
  }
}

const NO_SCOPE_GRANTS: GrantKind[] = ["web-browsing", "shell-exec", "orchestration-powers"];

export interface ResolvedProgram {
  type: "team" | "single";
  agents: AgentDefNode[];
  entryPoints: string[];
}

export function analyze(program: Program): ResolvedProgram {
  if (!program.typeDecl) {
    throw new SemanticError("missing required 'type ==' declaration", 1);
  }
  const type = program.typeDecl.value;

  const seen = new Map<string, AgentDefNode>();
  for (const agent of program.agents) {
    if (seen.has(agent.name)) {
      throw new SemanticError(`duplicate agent name '${agent.name}'`, agent.line);
    }
    seen.set(agent.name, agent);
  }

  if (type === "single") {
    if (program.agents.length !== 1) {
      throw new SemanticError(
        `type == single requires exactly one agentdef, found ${program.agents.length}`,
        program.typeDecl.line
      );
    }
    const [agent] = program.agents;
    if (agent.grants.some((g) => g.kind === "orchestration-powers")) {
      throw new SemanticError(
        "grant orchestration-powers is meaningless in a type == single program",
        agent.line
      );
    }
  } else {
    if (program.agents.length < 2) {
      throw new SemanticError(
        `type == team requires at least two agentdefs, found ${program.agents.length}`,
        program.typeDecl.line
      );
    }
    const hasOrchestrator = program.agents.some((a) =>
      a.grants.some((g) => g.kind === "orchestration-powers")
    );
    if (!hasOrchestrator) {
      throw new SemanticError(
        "type == team requires at least one agent with grant orchestration-powers",
        program.typeDecl.line
      );
    }
  }

  for (const agent of program.agents) {
    validateAgent(agent);
  }

  const entryPoints = determineEntryPoints(program, type);

  return { type, agents: program.agents, entryPoints };
}

function validateAgent(agent: AgentDefNode): void {
  if (!agent.provider) {
    throw new SemanticError(`agent '${agent.name}' is missing required 'ai-provider'`, agent.line);
  }
  if (!agent.apiKey) {
    throw new SemanticError(`agent '${agent.name}' is missing required 'ai-apikey'`, agent.line);
  }

  for (const grant of agent.grants) {
    if (grant.kind === "user-admin") {
      throw new SemanticError(
        "user-admin is reserved and not available in this version of Ion.",
        grant.line
      );
    }
    if (grant.kind === "file-access" && !grant.scope) {
      throw new SemanticError(
        `grant file-access requires a scope string (e.g. grant file-access 'C:/path')`,
        grant.line
      );
    }
    if (grant.kind === "gmail-access" && !grant.scope) {
      throw new SemanticError(
        `grant gmail-access requires an OAuth access token string (e.g. grant gmail-access 'ya29....')`,
        grant.line
      );
    }
    if (NO_SCOPE_GRANTS.includes(grant.kind) && grant.scope) {
      throw new SemanticError(
        `grant ${grant.kind} does not take a scope argument`,
        grant.line
      );
    }
  }
}

function determineEntryPoints(program: Program, type: "team" | "single"): string[] {
  if (type === "single") {
    return [program.agents[0].name];
  }

  const declared = program.agents.filter((a) => a.input || a.output);
  if (declared.length > 0) {
    return declared.map((a) => a.name);
  }

  const orchestrators = program.agents.filter((a) =>
    a.grants.some((g) => g.kind === "orchestration-powers")
  );
  for (const o of orchestrators) {
    if (!o.input) o.input = ["text"];
    if (!o.output) o.output = ["text"];
  }
  return orchestrators.map((a) => a.name);
}
