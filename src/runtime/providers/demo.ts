import { ProviderAdapter, SendMessageRequest, SendMessageResult } from "./types.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SHOWCASE = `# Everything the chat can show

This is a **demo reply**. It includes *emphasis*, \`inline code\` and a [link](https://example.com).

## A checklist
- [x] Rich Markdown
- [x] Live activity timeline
- [ ] Your own agents (that's next!)

## A table
| Agent | Superpower | Needs permission |
|:--|:--|:-:|
| boss | leads the team | no |
| helper | runs tools and commands | yes |
| scout | researches things | yes |

## Some code
\`\`\`ion
agent buddy:
    model "gemini/gemini-2.5-flash"
    role "You are a friendly assistant."

say ask buddy "Tell me a joke"
\`\`\`

> Replace \`model "demo"\` with a real model and this becomes a real AI.`;

const HELP = `Hi! I'm the **demo assistant**. I'm scripted, so I can't think for myself, but I can show you what the interface does. Try typing one of these:

- **markdown** shows tables, code, lists and quotes
- **work** has the team hand a task to a helper (watch the activity timeline)
- **permission** asks you for permission before running a command
- **research** sends the scout off to look something up

You can also type \`@helper\` at the start to talk to someone directly.`;

/**
 * Scripted showcase AI used by `ion preview`. It needs no key and no network, and it
 * reacts to a few keywords so every part of the web UI can be demonstrated.
 */
export const demo: ProviderAdapter = {
  name: "demo",
  defaultModel: "demo",

  async sendMessage(req: SendMessageRequest): Promise<SendMessageResult> {
    await wait(650); // so the live "working" states are visible
    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    const who = system.match(/You are '(\w+)'/)?.[1] ?? "";
    const last = req.messages[req.messages.length - 1];
    const has = (tool: string) => req.tools?.some((t) => t.name === tool) ?? false;
    const call = (name: string, args: Record<string, unknown>): SendMessageResult => ({
      text: "", toolCalls: [{ id: `demo-${name}`, name, arguments: args }]
    });

    if (last?.role === "tool") {
      if (who === "boss") return { text: `All done. Here's what the team reported:\n\n> ${last.content.replace(/\n/g, "\n> ")}\n\nType **markdown** to see more formatting.`, toolCalls: [] };
      return { text: `Finished: \`${last.content.slice(0, 300)}\``, toolCalls: [] };
    }

    const text = (last?.content ?? "").replace(/^\[User addressed[^\]]*\]\s*/s, "").trim();
    const lower = text.toLowerCase();

    if (who === "helper") {
      if (lower.startsWith("shout ") && has("shout")) return call("shout", { text: text.slice(6) });
      if (lower.startsWith("run ") && has("run_command")) return call("run_command", { command: text.slice(4) });
      return { text: `Helper here. I can **shout** text or **run** a command. Try asking the boss for **work**.`, toolCalls: [] };
    }
    if (who === "scout") {
      return { text: "Here is what I found:\n\n1. Ion reads like plain English.\n2. Agents can use tools **you** write.\n3. Teams hand work to each other automatically.", toolCalls: [] };
    }

    if (lower.startsWith("markdown") || lower.startsWith("showcase")) return { text: SHOWCASE, toolCalls: [] };
    if (lower.startsWith("work") && has("delegate_to_helper")) return call("delegate_to_helper", { task: "shout hello from the team" });
    if (lower.startsWith("permission") && has("delegate_to_helper")) return call("delegate_to_helper", { task: "run echo hello from ion" });
    if (lower.startsWith("research") && has("delegate_to_scout")) return call("delegate_to_scout", { task: "find three interesting facts about Ion" });
    return { text: HELP, toolCalls: [] };
  }
};
