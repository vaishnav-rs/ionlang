# Ion — Build Plan

Ion is an English-like, declarative language for defining AI agents and agent teams. An `.ion` file declares each agent's provider, model, and grants (capabilities); running the file starts a persistent local service — a bundled web chat UI (text and/or voice), a WebSocket/REST API for embedding into another frontend, or a headless API-only mode — that a human or another program interacts with continuously. This document is the complete build spec and is the single source of truth for building Ion end to end.

Decisions locked in for this build:
- **Host language:** Node.js (>=20) + TypeScript
- **Package manager:** npm
- **Test runner:** vitest
- **Web/browser grant automation:** Playwright, `headless: false`, used by any agent with `grant web-browsing` when it needs to actually drive a page rather than just fetch it
- **HTTP:** native `fetch` for provider adapters; `ws` package for the session WebSocket server
- **CLI framework:** commander
- **File extension:** `.ion`
- **CLI binary name:** `ion`
- **Default server port:** `4310` (override with `--port`)

This spec was inferred from a user-supplied example fragment:
```
ion init
type == team
agentdef orchestrator{
ai-provider == gemini
ai-apikey == <key here>
ai-model == gemini/gemini-2.5-flash
grant file-access 'C:/users/vaish'
grant web-browsing
grant orchestration
grant orchestrator-powers
grant user-admin
input == text, voice
output == text}
```
Inferences/decisions made from it, confirmed with the user where noted:
- `ion init` is a required literal first line of every `.ion` file (a version/format pragma, not a shell command).
- Blocks are brace-delimited (`agentdef name { ... }`), not indentation-based — no INDENT/DEDENT tokenizing needed, which meaningfully simplifies the lexer.
- Grants are declared **inside** each `agentdef` block (per-agent), not globally with a separate `can:` reference list.
- The agent's name (`orchestrator` in the example) is just a label — **confirmed**: any agent, regardless of name, that holds `grant orchestration-powers` may delegate to teammates.
- The example's two orchestration grants (`orchestration`, `orchestrator-powers`) are merged into a single grant kind, `orchestration-powers`.
- `grant user-admin` is **excluded from v1** (confirmed too broad/undefined) — reserved as a keyword that is a semantic error to use until a future version defines it.
- There is no `job:`/task field on an agentdef — **confirmed**: tasks come from live, continuous interaction through the bundled web UI or embeddable API, not a fixed string baked into the file. `input ==` / `output ==` declare which modalities (text/voice) that agent's user-facing surface supports.
- No general-purpose imperative scripting (no `let`/`if`/`for`/`function`) in v1 — the example is 100% declarative, and the actual reasoning/logic lives in the LLM-driven agent loop at runtime, not in Ion control flow. This is a deliberate simplification versus earlier drafts of this plan; revisit only if a real use case needs it.

---

## 1. Project scaffolding

```
/ion
  package.json
  tsconfig.json
  vitest.config.ts
  /src
    /lexer
      lexer.ts
      tokens.ts
    /parser
      parser.ts
      ast.ts
    /semantic
      semantic.ts
    /interpreter
      program.ts               # resolves parsed AST -> live AgentConfig[] + ProgramConfig
    /runtime
      /providers
        provider-table.ts
        types.ts
        gemini.ts
        openai.ts
        anthropic.ts
        custom.ts
      /grants
        grant-manager.ts
        file-access.ts
        web-browsing.ts
        shell-exec.ts
      agent-loop.ts
      orchestrator-loop.ts
      session.ts                # per-connection conversation history + turn routing
      server.ts                 # HTTP + WebSocket server, serves webui/ unless --headless
      webui/
        index.html
        client.js                # chat UI + Web Speech API (STT/TTS) glue
        style.css
    /cli
      index.ts                  # `ion run <file>.ion [--headless] [--port N] [--yes]`
  /examples
    solo-assistant.ion           # type == single
    research-team.ion            # type == team, matches the user's example shape
  /tests
    lexer.test.ts
    parser.test.ts
    semantic.test.ts
    providers.test.ts
    grants.test.ts
    server.test.ts
    e2e.test.ts
```

`package.json` deps: `typescript`, `tsx`, `commander`, `playwright`, `ws`, `vitest`, `@types/ws`, `@types/node`. `bin` maps `ion` → CLI entry.

---

## 2. Language specification

### 2.1 Lexical grammar

- **Comments:** `#` to end of line.
- **No indentation significance.** Blocks are delimited by `{` `}`. This is the biggest simplification versus a Python-style lexer — the tokenizer is a flat scan, no indentation stack.
- **Identifiers:** `[a-zA-Z_][a-zA-Z0-9_-]*` (hyphens allowed — needed for `file-access`, `ai-provider`, `orchestration-powers`, etc.).
- **Strings:** single- or double-quoted (the example uses both — `'C:/users/vaish'` and conceptually `"..."` elsewhere); no interpolation needed in v1 since there's no job-string templating anymore.
- **Config values** (right-hand side of `==`): scanned as raw text to end of line, then trimmed. If it contains commas, split into a list of trimmed items (used by `input == text, voice`). If it's wrapped in a `provider/model-id` shape (contains exactly one `/` with no spaces), kept as a single `ModelRef` token rather than split. Quoted values have their quotes stripped.
- **Keywords:** `ion`, `init`, `type`, `agentdef`, `grant`, `team`, `single`.
- **Grant kind literals:** `file-access`, `web-browsing`, `shell-exec`, `orchestration-powers` (validated in the semantic pass; `user-admin` lexes fine but is rejected in semantic analysis with a clear "not supported in v1" error).
- **Modality literals:** `text`, `voice`.

### 2.2 Grammar (EBNF-ish)

```
program        := "ion" "init" NEWLINE topLevel* EOF

topLevel        := typeDecl | agentDef

typeDecl        := "type" "==" ("team" | "single") NEWLINE

agentDef        := "agentdef" IDENT "{" NEWLINE agentLine* "}" NEWLINE

agentLine       := providerLine | apikeyLine | modelLine | grantLine
                  | inputLine | outputLine | customProviderBlock

providerLine    := "ai-provider" "==" IDENT NEWLINE
apikeyLine      := "ai-apikey" "==" (STRING | ENV_REF) NEWLINE
                     # ENV_REF: `env:VAR_NAME` shorthand, reads process.env.VAR_NAME at run
                     # start instead of storing a literal key in the source file
modelLine       := "ai-model" "==" MODEL_REF NEWLINE       # "<provider>/<model-id>"
grantLine       := "grant" GRANT_KIND STRING? NEWLINE
inputLine       := "input" "==" modalityList NEWLINE
outputLine      := "output" "==" modalityList NEWLINE
modalityList    := MODALITY ("," MODALITY)*

customProviderBlock := "ai-provider" "==" "custom" NEWLINE
                     "endpoint" "==" STRING NEWLINE
                     "auth-header" "==" STRING NEWLINE
                     "request-format" "==" ("openai" | "anthropic" | "raw") NEWLINE
```

### 2.3 AST node types (`src/parser/ast.ts`)

```ts
type Program = { kind: "Program"; typeDecl: "team" | "single"; agents: AgentDefNode[] }

type AgentDefNode = {
  kind: "AgentDef"
  name: string
  provider: ProviderRef                 // built-in name OR CustomProviderRef
  apiKey: { literal?: string; envVar?: string }
  model?: { provider: string; modelId: string }
  grants: GrantNode[]
  input?: Modality[]
  output?: Modality[]
  line: number                          // for error messages
}

type ProviderRef = { kind: "builtin"; name: "gemini" | "openai" | "anthropic" }
  | { kind: "custom"; endpoint: string; authHeader: string; requestFormat: "openai"|"anthropic"|"raw" }

type GrantNode = { kind: GrantKind; scope?: string; line: number }
type GrantKind = "file-access" | "web-browsing" | "shell-exec" | "orchestration-powers"
type Modality = "text" | "voice"
```

### 2.4 Semantic pass (`src/semantic/semantic.ts`)

1. First token must be `ion init` — error immediately if not (points the user at the exact required header).
2. Exactly one `type ==` declaration; value is `team` or `single`.
3. Collect all `agentdef` blocks; error on duplicate names.
4. `type == single`: require exactly one agentdef. `orchestration-powers` is meaningless/an error here (nothing to delegate to).
5. `type == team`: require at least two agentdefs, and require at least one agent holding `grant orchestration-powers`.
6. Every agentdef requires `ai-provider` and `ai-apikey`. `ai-model` optional — falls back to a documented per-provider default model.
7. `grant file-access` requires a scope string (the root path); error if missing. `web-browsing`, `shell-exec`, `orchestration-powers` take no scope — error if one is supplied (keeps grants unambiguous).
8. `grant user-admin` → hard semantic error: "user-admin is reserved and not available in this version of Ion."
9. Determine **entry points**: any agent with `input ==` and/or `output ==` declared is user-facing. If `type == team` and no agent declares them, the agent(s) holding `orchestration-powers` become the implicit entry point with default `input == text` / `output == text` — a team always has somewhere for a human message to land.

---

## 3. Runtime session model (replaces one-shot script execution)

Running an `.ion` file does **not** execute once and exit — it starts a long-lived local service (`src/runtime/server.ts`):

1. Parse + semantically validate the file (as in a normal interpreter — abort with file:line errors on failure).
2. Build the provider table and one `AgentHandle` per `agentdef`, each wired to its own `GrantManager` scoped to only the grants that agent declared.
3. Start an HTTP + WebSocket server on `--port` (default `4310`):
   - `GET /` → serves the bundled chat UI from `src/runtime/webui/` (skipped entirely in `--headless`).
   - `WS /stream` → the live interaction channel. Client → server: `{ type: "message", text }`. Server → client, streamed as the turn executes: `{ type: "chunk", text }` (partial model output), `{ type: "tool_call", agent, tool, detail }`, `{ type: "confirm_required", agent, grant, detail }` (see below), `{ type: "final", text }`.
   - `POST /message` → non-streaming REST fallback for simple embedders: `{ text }` in, `{ result }` out, same routing/session semantics as the WS channel but request/response instead of streamed.
4. **Routing a turn:** `type == single` → the message goes straight to that agent's loop (§4). `type == team` → the message goes to whichever entry-point agent (§2.4 rule 9) received the connection; if that agent holds `orchestration-powers` itself it can delegate directly, otherwise its normal tool-calling loop is still free to call teammate-delegation tools if it has the grant.
5. **Session/conversation state:** one conversation history per connected client (keyed by WebSocket connection, or a `session_id` for REST callers), threaded into the agent loop each turn so context persists across messages — this is a continuous conversation, not isolated one-shot calls.
6. **Grant confirmation in server mode:** a terminal `y/N` prompt doesn't make sense once there's no attached terminal per request, so `GrantManager.confirmOnce` (§5.1) instead emits `{ type: "confirm_required", ... }` to the requesting client and blocks that turn until a matching `{ type: "confirm_response", ok }` arrives. The bundled UI renders this as an inline "Allow this agent to read C:/Users/vaish? [Allow/Deny]" prompt. `--yes` bypasses this exactly as it would a terminal prompt.
7. **`--headless`:** same server, same `/stream` and `/message` API — just skips serving `GET /` and does not auto-open a browser tab. This is what makes Ion embeddable into someone else's frontend or drivable from another program with zero UI.
8. **Default (non-headless) behavior:** after the server starts, `ion run` opens the user's default browser to `http://localhost:<port>` automatically, so `ion run file.ion` "just works" with no extra steps — matches the "runs without the user knowing anything, they open it" requirement.

### 3.1 Bundled web UI (`src/runtime/webui/`)

Plain HTML/CSS/vanilla JS (no framework/build step needed — keeps the interpreter's own dependency footprint small):
- A minimal chat interface: message list, text input, send button.
- If the active entry-point agent's `input` includes `voice`: a mic button using the browser's `SpeechRecognition` API to transcribe speech to text client-side, then sends it exactly like a typed message — no server-side STT dependency in v1.
- If `output` includes `voice`: incoming `final` messages are also spoken aloud via the browser's `SpeechSynthesis` API.
- Renders `confirm_required` events as an inline approve/deny prompt (§3 point 6).
- Because this talks to the server purely over the same `/stream` WebSocket API described above, anyone can point their own frontend at that API instead — that's the "integrate into their own web UI" path, no separate SDK needed for v1.

---

## 4. Agent & orchestrator loop (`src/runtime/agent-loop.ts`, `orchestrator-loop.ts`)

Unchanged in mechanism from earlier design, adapted to the session model:

1. On each incoming turn, build `messages` from that session's conversation history + the new user text.
2. Call `provider.sendMessage({ messages, tools: <ToolSpecs for this agent's declared grants, plus one delegate_to_<agent> tool per teammate if this agent holds orchestration-powers> })`.
3. Tool calls execute through that agent's `GrantManager` (assert declared → confirm-once, per §5.1), results appended as `tool` messages, loop continues.
4. `delegate_to_<teammate>(task)` tool calls invoke the teammate's own loop with `task` as its incoming message (its own conversation history, scoped to that delegation) and return its final text as the tool result — orchestration reuses the same tool-calling mechanism, no separate protocol.
5. Plain text response with no tool calls → stream as `final` to the client, append to session history, turn complete.
6. Hard iteration cap (25 turns per single user message) to prevent runaway loops.

---

## 5. Provider adapters & grant system

### 5.1 Grant manager — unchanged from earlier design, notes above (§3 point 6) cover the server-mode confirmation flow. Each `AgentHandle` gets its own `GrantManager` instance scoped only to the grants declared inside that specific `agentdef` block (this replaces the earlier global-grants-plus-`can:` design — simpler, and matches the example putting `grant` lines directly inside the agent block).

### 5.2 Tools
- **`file-access.ts`**: read/write scoped to the granted root path; rejects any resolved path outside that root.
- **`web-browsing.ts`**: a single grant covering both plain HTTP fetch and, when the task needs it, driving a real visible Chromium window via Playwright (`goto`/`click`/`type`/`getText`) — merged per user's example (only one web grant appeared, not a separate fetch-vs-browser split).
- **`shell-exec.ts`**: spawns a process, captures stdout/stderr/exit code.
- Delegation "tools" for `orchestration-powers` are synthesized per-teammate as described in §4 point 4, not a separate file.

### 5.3 Provider adapters (`src/runtime/providers/`)
Same three built-ins as before — `gemini.ts`, `openai.ts`, `anthropic.ts` — plus `custom.ts` for the `customProviderBlock` escape hatch. Gemini is first since it's what the user's example uses:
- **`gemini.ts`** — `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=<key>`, body `{ contents, tools: [{ functionDeclarations }] }`. Default model `gemini/gemini-2.5-flash` if `ai-model` omitted (matches the example).
- **`openai.ts`** — `POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer <key>`, default model `openai/gpt-4o-mini`.
- **`anthropic.ts`** — `POST https://api.anthropic.com/v1/messages`, `x-api-key`, `anthropic-version: 2023-06-01`, default model `anthropic/claude-sonnet-5`.
- **`custom.ts`** — reuses one of the three translation shapes per its declared `request-format`.

`ai-apikey == env:VAR_NAME` reads `process.env.VAR_NAME` at startup instead of storing a literal key in the file — added as a security default so example/shared `.ion` files don't need real secrets committed in them; a literal quoted string is still supported for quick local testing.

---

## 6. CLI (`src/cli/index.ts`)

```
ion run <file>.ion [--headless] [--port <n>] [--yes]
```
- Parse/validate; print file:line errors and exit non-zero on failure.
- Build providers/grants/agents, start the server (§3).
- Non-headless: auto-open the default browser to `http://localhost:<port>`.
- `--yes`: auto-confirm every grant prompt (no `confirm_required` round-trip) — documented as removing the safety net, intended for trusted/CI use.
- `Ctrl+C` cleanly shuts the server down (closes any open Playwright browser instances first).

---

## 7. Example programs (`/examples`)

**`solo-assistant.ion`** — `type == single`, minimal, text-only:
```
ion init
type == single
agentdef assistant{
ai-provider == openai
ai-apikey == env:OPENAI_API_KEY
grant file-access 'C:/Users/vaish/Desktop/ion-test'
input == text
output == text}
```

**`research-team.ion`** — `type == team`, mirrors the user's original fragment plus a second agent so orchestration has someone to delegate to:
```
ion init
type == team

agentdef orchestrator{
ai-provider == gemini
ai-apikey == env:GEMINI_API_KEY
ai-model == gemini/gemini-2.5-flash
grant orchestration-powers
input == text, voice
output == text}

agentdef researcher{
ai-provider == openai
ai-apikey == env:OPENAI_API_KEY
grant web-browsing
grant file-access 'C:/Users/vaish'}
```

---

## 8. Milestones (build in this order)

- **M0 — Scaffolding.** Folder tree, `package.json`/`tsconfig.json`/`vitest.config.ts`, `ion` CLI stub. `npm run build` / `npm test` pass (empty suite).
- **M1 — Lexer.** Flat, brace-based tokenizer per §2.1 (no indentation tracking needed — meaningfully less work than earlier drafts). Unit tests per token kind, including `env:VAR`, `provider/model-id` refs, and comma modality lists.
- **M2 — Parser.** Recursive descent implementing §2.2 → AST from §2.3. Unit tests: one per construct (`ion init` header, `type`, each `agentLine` kind, custom-provider block).
- **M3 — Semantic pass.** All 9 checks in §2.4, line-numbered errors. Positive + negative test per rule.
- **M4 — Provider adapter (Gemini first) + non-streaming single-agent turn.** Implement `gemini.ts` for real, stub the other two. Enough of `agent-loop.ts` to take one text message and return one text response, no tools yet, no server — callable directly from a test harness. Proves "provider name auto-configures endpoint/format" against the real Gemini API.
- **M5 — Grant manager + file-access + tool-calling loop.** Real multi-turn tool-calling agent loop per §4. Test: an agent with `file-access` writes a file when asked, via a scripted fake "confirm" callback standing in for the future UI prompt.
- **M6 — Server + bundled web UI (text only).** Implement `server.ts` (`/stream`, `/message`, `GET /`) and a minimal `webui/` chat page with no voice yet. `ion run examples/solo-assistant.ion` opens a browser, you can chat with the agent, grant confirmation appears as an inline UI prompt.
- **M7 — Voice.** Add `SpeechRecognition`/`SpeechSynthesis` wiring in `client.js`, gated on the entry-point agent's `input`/`output` modality lists.
- **M8 — Remaining providers, remaining grants, orchestration.** `openai.ts`, `anthropic.ts`, `web-browsing.ts` (incl. Playwright visible-browser path), `shell-exec.ts`, and `orchestrator-loop.ts`'s delegate-tool synthesis. `ion run examples/research-team.ion` end to end: chatting with `orchestrator` triggers a delegated call to `researcher`, a visible browser window opens with a confirmation prompt, and the final answer streams back.
- **M9 — `--headless`, `--port`, `--yes`, custom-provider escape hatch, polish.** Path-traversal rejection test for file-access, iteration-cap error quality, clean shutdown on Ctrl+C (closing Playwright), README covering all CLI flags.

## 9. Verification checklist (run after M9)

- [ ] `ion run examples/solo-assistant.ion` opens a browser tab automatically and a chat message gets a real response.
- [ ] Asking the assistant to write a file triggers one inline confirm prompt in the UI, then the file exists with real content.
- [ ] `ion run examples/research-team.ion`, message the orchestrator with a research task: it delegates to `researcher`, a visible Chromium window opens (after a confirm prompt) and navigates, and a final synthesized answer streams back to the chat UI.
- [ ] Voice: with an `input == voice` agent, the mic button transcribes speech and sends it as a message; with `output == voice`, the final response is spoken aloud.
- [ ] `ion run examples/solo-assistant.ion --headless --port 5000`: no browser opens, but `POST http://localhost:5000/message` with `{ "text": "..." }` gets a real response — proves the embeddable/headless path.
- [ ] `ion run ... --yes`: no confirm prompts appear anywhere, grants execute immediately.
- [ ] `grant file-access 'C:/Users/vaish'` + an attempt to read `C:/Windows/System32/...` is rejected as outside the granted root.
- [ ] A file using `grant user-admin` fails semantic validation with a clear "not supported in v1" error instead of running.
