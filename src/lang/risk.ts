/**
 * Which combinations of abilities one agent may not have together.
 *
 * An agent reads what it is given (files, Gmail, a knowledge base) and can send things out
 * (the web, a command). A web page or document it reads can tell it to send private data
 * out, so both halves in one agent is how data leaks. Ion refuses the combination and asks
 * for two agents that talk through a team instead.
 */

export type AbilityKind = "files" | "gmail" | "search" | "web" | "shell";

/** The message for a risky set of abilities, or undefined when the set is fine. */
export function riskyCombination(kinds: Iterable<AbilityKind>): string | undefined {
  const set = new Set(kinds);
  const reads = set.has("files") || set.has("gmail") || set.has("search");
  const sendsOut = set.has("web") || set.has("shell");
  const shellAndWeb = set.has("shell") && set.has("web");
  if (!((reads && sendsOut) || shellAndWeb)) return undefined;
  return (
    "This agent can read private things (files, Gmail, or a knowledge base) and can also send data out " +
    "(browse the web or run commands). A web page or document it reads could tell it to send your data out. " +
    "Split it into two agents: one that reads, and one that browses or runs commands. Put them in a team " +
    "so they can work together."
  );
}

export const RISK_HINT = "Split the abilities between two agents, and put them in a team.";
