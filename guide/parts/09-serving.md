# 15  Talking to your agents: chat, serve and the API

You have three ways to let people (or other programs) talk to your agents.

| Way | Statement | Best for |
|:--|:--|:--|
| Terminal chat | `chat with buddy` | Quick tests, one user |
| Web chat page | `serve buddy` | A real interface for people |
| API only | `serve buddy` with `--headless` | Connecting your own app or website |

## 15.1  `chat with`

```ion
agent buddy:
    model "gemini/gemini-2.5-flash"
    role "You are a friendly assistant."

chat with buddy
```

Works for teams too: `chat with crew`.

## 15.2  `serve`

```ion
serve crew
serve crew on port 5000
```

`serve` starts a small web server on your computer and keeps running until you press **Ctrl+C**. Without a port it uses **4310**. Your default browser opens the chat page automatically.

You choose who answers: `serve crew` means messages go to the team's lead (the **entry point**). Every other agent can still be addressed directly with `@name` in the chat.

The permission cards in the chat page are how you approve what agents try to do (Chapter 16). `ion run file.ion --yes` approves everything automatically.

> **Note.** The server listens on **your computer only** (`127.0.0.1`), so other devices on your network cannot reach it. There is no login, and an agent may be able to read files or run commands, so keep it that way unless you add your own protection.

## 15.3  Headless: use Ion as a back end

```text
ion run crew.ion --headless
```

With `--headless` there is **no web page and no browser opens**. Only the API is available. This is how you put your agents behind your own website or app.

## 15.4  The simple HTTP API

Send a message and wait for the full answer:

```text
POST http://localhost:4310/message
Content-Type: application/json

{"text": "Hello!", "session_id": "alice"}
```

Reply:

```text
{"result": "Hi! How can I help?"}
```

From PowerShell:

```text
Invoke-RestMethod -Uri http://localhost:4310/message -Method Post -ContentType "application/json" -Body '{"text":"Hello!","session_id":"alice"}'
```

From a shell with curl:

```text
curl -X POST http://localhost:4310/message -H "Content-Type: application/json" -d '{"text":"Hello!","session_id":"alice"}'
```

- `session_id` is optional. Requests with the **same** session id share one conversation memory. With no id they all share the id `rest-default`.
- If something fails you get HTTP 500 and `{"error": "..."}`.
- A request over HTTP has no way to show a permission card, so **abilities that need permission are refused** unless you started Ion with `--yes`.

Two read-only endpoints describe your setup:

| Endpoint | Returns |
|:--|:--|
| `GET /config` | `{"entry": "boss", "input": ["text"], "output": ["text"]}` |
| `GET /agents` | a list of agents: `name`, `role`, `entry`, `team`, `isOrchestrator`, `grants`, `tools`, `teammates` |

## 15.5  Live updates with WebSocket

For a live experience (the chat page uses this), connect a WebSocket to `ws://localhost:4310/stream`. Each connection is one conversation.

You send JSON messages:

| You send | Meaning |
|:--|:--|
| `{"type": "message", "text": "Hi", "addressedTo": "helper"}` | Send a message. `addressedTo` is optional |
| `{"type": "confirm_response", "confirmId": "...", "ok": true}` | Answer a permission request |

You receive JSON events as the work happens:

| Event | Fields | Meaning |
|:--|:--|:--|
| `chunk` | `agent`, `text` | An agent produced some text |
| `tool_call` | `agent`, `tool`, `detail` | An agent started using a tool. `delegate_to_x` means a hand-off to `x` |
| `tool_result` | `agent`, `tool`, `isError`, `ms`, `result` | The tool finished (result is shortened if very long) |
| `confirm_required` | `confirmId`, `agent`, `grant`, `detail` | Permission needed. Reply with `confirm_response` |
| `final` | `agent`, `text` | The finished answer. The turn is over |

A tiny web page using it:

```text
const ws = new WebSocket("ws://localhost:4310/stream");
ws.onopen = () => ws.send(JSON.stringify({ type: "message", text: "Hello" }));
ws.onmessage = (e) => {
  const event = JSON.parse(e.data);
  if (event.type === "final") console.log(event.text);
};
```

> **Note.** A browser page served from another address cannot normally connect to this local server, and that is intentional. For your own site, put a small back end in front, or run Ion on the same address.

## 15.6  Exercises

1. Run the demo (`ion preview`) and use `GET /agents` in your browser: open `http://localhost:4310/agents`.
2. Start `crew.ion` with `--headless` and send it a message with PowerShell or curl.
3. Send two messages with the same `session_id` and check the agent remembers the first.

---

# 16  The web UI

`serve` (and `ion preview`) gives you a complete chat application with no setup.

![The chat page with a team of three agents](/img/ui-empty.png)

## 16.1  A tour

**Left: the team.** Every agent has a colored avatar, its role, and its abilities (files, web, commands, tools). A green dot pulses when that agent is working. Click an agent to start a message addressed to it. Teams are labeled `team`, and the agent that answers by default is labeled `entry`.

**Top: the title and connection light.** Green means connected. If the connection drops, Ion reconnects automatically and tells you the agents' short-term memory restarted.

**Center: the conversation.** Your messages are on the right. Agent replies are on the left, rendered as rich text.

**Bottom: the message box.** Press **Enter** to send and **Shift+Enter** for a new line. If you type while the team is busy, your message waits in a queue and sends when they are free.

## 16.2  Watching the team work

While agents work, a live **activity** card shows each step: who handed work to whom, which tool is running, how long it took, and what came back.

![A hand-off from boss to helper, live](/img/ui-working.png)

When the reply is ready, the card collapses to a summary like "Worked for 1.1s, 2 steps, 2 agents". Click it to expand the full timeline. Each step has a **Details** link showing the exact inputs and result.

![The finished reply with its expanded timeline](/img/ui-done.png)

## 16.3  Permission cards

When an agent wants to do something that needs permission, a card appears and the work **waits for you**:

![A permission request](/img/ui-permission.png)

Press **Y** to allow or **N** to deny, or click the buttons. If you switch to another tab, the page title shows a warning so you do not miss it. Once you allow a kind of ability for an agent, it is not asked again during that run.

## 16.4  Rich answers

Replies are rendered from Markdown: headings, bold and italic, lists, checklists, tables, quotes, links, and code with syntax highlighting and a **Copy** button.

![Markdown, a table, and highlighted code](/img/ui-markdown.png)

Ask your agents to format answers with Markdown for the best results. Hover over a reply to **copy** it, **read it aloud**, or, if it failed, **try again**.

## 16.5  Addressing someone directly

Type `@` at the start of a message to pick an agent, then press Tab or Enter:

![The mention picker](/img/ui-mention.png)

## 16.6  The command menu

Press **Ctrl+K** (Cmd+K on a Mac) for a searchable list of actions:

![The command menu](/img/ui-palette.png)

## 16.7  Keyboard shortcuts

| Keys | Does |
|:--|:--|
| Enter | Send |
| Shift+Enter | New line |
| `@` | Address an agent |
| `/` | Jump to the message box |
| Ctrl+K | Command menu |
| Ctrl+Shift+O | New chat |
| Y / N | Allow / deny a permission request |
| Esc | Close menus, stop dictation, close the side panel |

## 16.8  Themes, phone, voice

- **Themes.** Light, dark, or follow your computer. Use the button at the bottom of the side panel.

![Dark theme](/img/ui-dark.png)

- **Phone and narrow windows.** The side panel becomes a drawer behind a menu button.

![On a phone](/img/ui-mobile.png)

- **Voice.** If an agent has `input text, voice`, a microphone button appears: speak and your words are typed live, then sent. The speaker button in the title bar reads replies aloud (turn it on and it remembers). Speech uses your browser's built-in features, which work best in Chrome and Edge, and the browser asks for microphone permission.

## 16.9  History, export and starting over

- Your conversation is saved in your browser, so it is still there after a refresh. The agents themselves start fresh (their memory lives in the running program), and the page says so with a divider.
- **Export** (download icon) saves the chat as a Markdown file.
- **New chat** (or Ctrl+Shift+O) clears the screen and gives the agents a clean slate.

## 16.10  Previewing without any setup

```text
ion preview
```

Shows the chat page with a built-in demo team (no key needed). Type `work`, `permission`, `research` or `markdown` to see each feature. `ion preview myfile.ion` previews your own agents: if your file has a `serve` line it is used, otherwise the last team (or the first agent) is served.

## 16.11  Limits

- Replies appear when complete, not word by word. The live activity card shows progress instead.
- There is no stop button yet, because running work cannot be cancelled mid-flight. Extra messages queue.
- The page is for one person on your own computer. It has no accounts or login.

---

# 17  Splitting a program across files

Big programs are easier to read as several files. `use` runs another file first, and everything it defines (functions, agents, tools, teams, variables) becomes available:

```ion
use "agents.ion"
use "helpers.ion"

say ask researcher "hello"
```

Details:

- Paths are relative to the file that contains the `use`.
- A file is run **only once**, even if several files use it.
- All files share the same names. A file that defines `agent researcher` makes `researcher` usable everywhere.
- If an error happens inside a used file, the message names that file and line.
- `ion check` is more lenient when a file uses others, because names might come from them.

A good layout:

```text
my_project/
    agents.ion      # agents and tools only
    helpers.ion     # plain functions
    main.ion        # use "agents.ion", use "helpers.ion", then the actual program
    .env            # keys
```

---

# 18  Command-line reference

If you did not run `npm link`, replace `ion` with `npx tsx src/cli/index.ts`.

## 18.1  `ion run`

```text
ion run <file.ion> [--yes] [--headless] [--port N]
```

| Option | Meaning |
|:--|:--|
| `--yes` | Approve every permission prompt automatically. **Only for programs you trust.** |
| `--headless` | With `serve`: API only, no web page, no browser |
| `--port N` | Overrides the port in a `serve` statement |

Runs the program. If it fails, the error is printed and the exit status is 1.

## 18.2  `ion check`

```text
ion check <file.ion>
```

Reports mistakes without running anything: unknown agents, tools or models, teams with a missing lead, duplicate names, misspelled settings, and `ask` targets that do not exist. Prints `file: ok` when clean.

## 18.3  `ion repl`

```text
ion repl [--yes]
```

An interactive prompt. Type statements one at a time. End a line with `:` to start a block and finish with an empty line. Type `exit` to leave. Variables, functions and agents you define stay for the whole session.

## 18.4  `ion preview`

```text
ion preview [file.ion] [--port N] [--no-open] [--yes]
```

Opens the chat page. With no file, a built-in demo. With a file, your own agents. `--no-open` starts the server without opening a browser.

## 18.5  The `.env` file

Before running, Ion looks for a `.env` file in the folder of your script (or, failing that, the current folder) and loads `NAME=value` lines into the environment. Variables already set in your terminal are never overwritten.

## 18.6  Old-style files

Files whose first line is `ion init` use the original brace syntax and keep working with `ion run` and `ion check` (Appendix E).
