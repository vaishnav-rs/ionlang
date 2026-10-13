# 12  Models and API keys

## 12.1  Choosing a model

The `model` setting names the AI. Write it as `"provider/model-name"`:

```ion
agent a:
    model "gemini/gemini-2.5-flash"
```

| Provider | Write | Default model if you give only the provider | Key variable |
|:--|:--|:--|:--|
| Google Gemini | `gemini/...` | `gemini-2.5-flash` | `GEMINI_API_KEY` |
| OpenAI | `openai/...` | `gpt-4o-mini` | `OPENAI_API_KEY` |
| Anthropic | `anthropic/...` | `claude-sonnet-5` | `ANTHROPIC_API_KEY` |
| Mock (offline fake) | `mock` | n/a | none needed |
| Demo (scripted showcase) | `demo` | n/a | none needed |

The part after the slash is passed straight to the provider, so you can use **any model name your provider offers**. If you write only the provider (`model "openai"`), Ion uses the default from the table.

You can mix providers in one program. A common pattern is a cheap fast model for easy jobs and a stronger one for hard jobs.

Where to get a key:

- Gemini: Google AI Studio, `aistudio.google.com/apikey`
- OpenAI: `platform.openai.com/api-keys`
- Anthropic: `console.anthropic.com`

> **Warning.** API keys are like passwords **and like credit cards**. Anyone holding your key can spend your money. Never post one online, send it in a chat, or share a file that contains one.

## 12.2  Five ways to provide a key

Ion looks for a key in this order: a key written on the agent, then the environment variable. Pick the style that suits you.

### Way 1: an environment variable (recommended)

Set the variable with the default name from the table, and write nothing about keys in your program:

```text
PowerShell:   $env:GEMINI_API_KEY = "your-key"
Mac / Linux:  export GEMINI_API_KEY="your-key"
```

```ion
agent a:
    model "gemini/gemini-2.5-flash"
```

### Way 2: a `.env` file (easy and safe)

Create a file named `.env` next to your `.ion` file:

```text
GEMINI_API_KEY=your-key-here
OPENAI_API_KEY=your-other-key
```

Ion loads it automatically each time you run. Real environment variables win over the file. Lines starting with `#` are comments, and quotes around values are removed. Your program stays clean and shareable.

### Way 3: a different variable name

```ion
agent a:
    model "openai/gpt-4o-mini"
    key from env "WORK_OPENAI_KEY"
```

### Way 4: write the key right in the program (inline)

The quickest way, perfect for a quick experiment on your own machine:

```ion
agent buddy:
    model "gemini/gemini-2.5-flash"
    key "PASTE-YOUR-KEY-HERE"
```

`key is "..."` and `apikey "..."` mean the same thing, if you prefer how they read:

```ion
agent buddy:
    model "openai/gpt-4o-mini"
    apikey is "PASTE-YOUR-KEY-HERE"
```

> **Warning.** A key written in a program is **stored in plain text in that file**. If you email the file, post it, or upload it, you have shared your key. Use inline keys only for files that stay on your computer, and move to a `.env` file before you share anything. If a key ever leaks, delete it in your provider's dashboard and make a new one.

### Way 5: ask for it when the program starts

Nothing is stored anywhere. Ion asks you every run:

```ion
set my_key to ask user "Paste your Gemini key:"

agent buddy:
    model "gemini/gemini-2.5-flash"
    key my_key
```

The `key` line accepts any text expression: a variable, `env("NAME")`, or a piece of text. (Typed characters are visible on screen, so use this where nobody is watching.)

## 12.3  Different keys for different agents

Each agent has its own `key`, so you can use separate accounts:

```ion
agent cheap:
    model "openai/gpt-4o-mini"
    key from env "PERSONAL_OPENAI_KEY"

agent smart:
    model "anthropic/claude-sonnet-5"
    key from env "WORK_ANTHROPIC_KEY"
```

## 12.4  When the key is missing or wrong

If no key can be found, Ion says exactly what to do:

```text
Agent 'a' needs the environment variable GEMINI_API_KEY, but it isn't set.
  hint: Set it in your terminal, or put GEMINI_API_KEY=... in a file called .env next to your script.
```

If a key is present but wrong, the AI provider rejects it and Ion shows its message after `Asking 'a' failed:`. Typical meanings:

| Message contains | Meaning |
|:--|:--|
| `401` or `403`, "API key not valid" | The key is wrong, expired or lacks permission |
| `429` | You are sending too fast, or you ran out of quota or credit |
| `404`, "model not found" | The model name after the slash is not one your account can use |
| `500`, `503` | The provider is having trouble. Try again shortly |

## 12.5  Keeping costs under control

- Every `ask` costs money with real models (cents or fractions of a cent for small models).
- Long memory means more text sent each time. Use `forgets between asks` for one-off jobs.
- An agent with tools may make several AI calls per `ask`. There is a safety cap of 25 rounds per message.
- Start with small cheap models while you develop. Switch to stronger ones when it works.
- Develop with `model "mock"` and switch the model line last. All your logic is tested for free.

## 12.6  The `mock` and `demo` models

`mock` repeats what you send, prefixed with `mock reply:`. It also has one trick: if your message is `CALL tool_name {"arg": "value"}`, it **calls that tool**, which lets you test tools and delegation without an AI. You will use this in the next two chapters.

`demo` powers `ion preview`. It reacts to a few keywords (`markdown`, `work`, `permission`, `research`) to show off the chat page.

## 12.7  Exercises

1. Create a `.env` file with a fake key, and run a program that uses a real model name. What error do you see? (A fake key is rejected by the provider, which is the correct and safe outcome.)
2. Write an agent that takes its key from a custom variable name.
3. Why is the `.env` approach better than an inline key when sharing code with a friend?

---

# 13  Tools: giving agents new powers

An agent that can only talk is limited. **Tools** are functions that **the agent can decide to call**. A tool can do anything you can program: look up a price, query a database, call a web service, calculate something exactly.

## 13.1  Your first tool

A tool looks like a function, but starts with `tool` and has a `describe` line:

```ion-run
tool shout(text):
    describe "Makes text LOUD"
    give back upper(text) + "!"

agent echo:
    model "mock"
    can use shout

say ask echo 'CALL shout {"text": "tools give agents powers"}'
```
```output
Done: TOOLS GIVE AGENTS POWERS!
```

What happened:

1. `tool shout(text)` defined a tool with one input.
2. `can use shout` gave the agent permission to use it.
3. The mock AI saw `CALL shout {...}` and called the tool. (A **real** AI decides by itself when a tool would help, based on your `describe` text.)
4. The tool's result went back to the agent, which produced the final answer.

## 13.2  The `describe` line is how the AI understands

A real AI **reads the description** to decide whether and when to use the tool. Write it like instructions to a colleague. Mention what the tool does, what each input means, and what comes back.

```ion
tool get_weather(city):
    describe "Gets the current weather for a city. Input: the city name, like 'Paris'. Returns a short summary."
    give back fetch("https://wttr.in/" + city + "?format=3")

agent assistant:
    model "gemini/gemini-2.5-flash"
    role "You help people plan their day."
    can use get_weather

say ask assistant "Should I take an umbrella in London today?"
```

Without a `describe` line the AI only sees the tool's name, so it will use it less wisely.

## 13.3  Inputs and results

- **Inputs** are named in the brackets: `tool book(room, day):`. The AI fills them in.
- **Results**: whatever the tool gives back. Text is handed over as is. Numbers, lists and maps are converted to JSON text for the AI.

```ion-run
tool add_numbers(a, b):
    describe "Adds two numbers"
    give back a + b

agent calc:
    model "mock"
    can use add_numbers

say ask calc 'CALL add_numbers {"a": 2, "b": 3}'
```
```output
Done: 5
```

## 13.4  When a tool fails

If the tool hits an error (a web page is down, a bad input), Ion does **not** crash your program. The AI is told `Error: ...` and can try something else or explain the problem to the user.

## 13.5  Tools are also ordinary functions

You can call a tool yourself: `say shout("hello")` works. That makes tools easy to test before an AI ever uses them.

## 13.6  Many tools, many agents

Give an agent several tools, and share a tool between agents:

```ion
agent analyst:
    model "gemini/gemini-2.5-flash"
    can use get_weather, add_numbers, shout
```

> **Warning.** A tool runs **as your program**, with no permission prompt, because you wrote it and chose to give it to the agent. Think about what an AI could do with it. A tool that deletes files or sends money should check its inputs very carefully, or not exist.

## 13.7  Names

Tool names cannot be the same as the built-in agent tools: `read_file`, `write_file`, `list_files`, `fetch_url`, `browse_page`, `run_command`, `search_gmail`, `read_gmail_message`. Ion tells you if you collide.

## 13.8  Exercises

1. Write a tool `word_count(text)` that gives back the number of words, and test it by calling it directly.
2. Give it to a mock agent and trigger it with `CALL`.
3. Write a tool `tip(amount, percent)` that returns the tip, and call it from your script.
4. Think of a tool you would like an AI to have. What should its `describe` line say?

---

# 14  Teams: agents working together

One agent can do a lot. A **team** of specialists can do more: one researches, one writes, one checks the facts.

## 14.1  Delegation: `can ask`

An agent with `can ask other` can **hand tasks to another agent**. The AI decides when to do this.

```ion-run
agent boss:
    model "mock"
    can ask worker

agent worker:
    model "mock"

say ask boss 'CALL delegate_to_worker {"task": "do the report"}'
```
```output
Done: mock reply: do the report
```

Behind the scenes, `can ask worker` gave `boss` a tool called `delegate_to_worker`. When the boss uses it, the `worker` receives the task as a message, replies, and the reply comes back to the boss as the tool result. (With a real AI, the boss decides when to delegate. Here the mock obeys `CALL`.)

## 14.2  Teams with `team`

A `team` bundles a **lead** and **members**:

```ion-run
agent boss:
    model "mock"
agent writer:
    model "mock"
agent checker:
    model "mock"

team crew:
    lead boss
    members writer, checker

say ask crew 'CALL delegate_to_writer {"task": "write a haiku"}'
say ask crew 'CALL delegate_to_checker {"task": "check it"}'
```
```output
Done: mock reply: write a haiku
Done: mock reply: check it
```

`ask crew ...` talks to the **lead**, who can delegate to any member. The team is an agent-like value: you can `ask` it, `chat with` it, `serve` it, or list it in another agent's `can ask`.

The lead's own abilities and tools still apply, and the lead also tells its members apart by their abilities, so a lead with a good role (such as "Send research to the researcher, then ask the writer to save a report") will delegate sensibly.

## 14.3  Three ways to organize work

**1. Let the AI decide (a team).** Flexible. Good for open-ended requests. Less predictable.

```ion
agent lead:
    model "gemini/gemini-2.5-flash"
    role "Send research questions to the researcher, then ask the writer to save a short report."
agent researcher:
    model "gemini/gemini-2.5-flash"
    can browse the web
agent writer:
    model "gemini/gemini-2.5-flash"
    can access files in "./reports"

team crew:
    lead lead
    members researcher, writer
```

**2. You decide (a script).** Predictable and cheap. You control the order:

```ion
set facts to ask researcher "Find three facts about volcanoes"
set report to ask writer "Write a friendly paragraph using these facts:\n{facts}"
say report
```

**3. In parallel.** Ask several agents at once with `ask_all`:

```ion-run
agent optimist:
    model "mock"
agent skeptic:
    model "mock"

say ask_all([optimist, skeptic], "Is this plan good?")
```
```output
["mock reply: Is this plan good?", "mock reply: Is this plan good?"]
```

`ask_all` runs all the asks **at the same time**, so it takes as long as the slowest one rather than the sum. The replies come back as a list in the same order as the agents.

> **Tip.** Prefer scripts when the steps are always the same. Prefer teams when the right steps depend on the request.

## 14.4  What each agent sees

- Every agent has **its own memory** of its own conversation.
- Delegated tasks arrive as messages to the specialist. They do **not** see the user's whole chat unless the lead includes it. So tell the lead (in its `role`) to **include the details** each specialist needs.
- Each agent uses its **own abilities**. If `researcher` browses the web, the permission card names the researcher.

## 14.5  Limits that protect you

- Agents asking each other can nest at most **six levels deep**. If your agents delegate in a circle, you get a clear error instead of an endless loop.
- Each message may involve at most **25** rounds of tool use per agent.
- An agent cannot ask itself, and `ion check` catches unknown names in `can ask` and `team` lines.

## 14.6  A review loop

A classic pattern: one agent writes, another critiques, repeat until approved:

```ion
agent writer:
    model "gemini/gemini-2.5-flash"
    role "You write short product descriptions."
agent reviewer:
    model "gemini/gemini-2.5-flash"
    role "Reply APPROVED if the text is great. Otherwise give exactly one improvement."
    forgets between asks

set draft to ask writer "Write two sentences about a reusable water bottle."
repeat 3 times:
    set review to ask reviewer "Review this:\n{draft}"
    if review contains "APPROVED":
        stop
    set draft to ask writer "Improve it using this feedback: {review}"
say draft
```

## 14.7  Exercises

1. Build a team with a lead and two members, using `mock`. Trigger each member with `CALL`.
2. Write a script (not a team) that asks one mock agent, then passes its answer to another.
3. Use `ask_all` to ask three agents the same question and print each reply on its own line (hint: `for each`).
