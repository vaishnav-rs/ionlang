# 10  The built-in toolbox

These functions are always available. Where a function takes an optional input, it is shown in square brackets.

## 10.1  Text

| Function | Gives back | Example |
|:--|:--|:--|
| `length(x)` | the size of text, a list or a map | `length("hello")` is `5` |
| `upper(t)` | UPPERCASE | `upper("hi")` is `"HI"` |
| `lower(t)` | lowercase | `lower("HI")` is `"hi"` |
| `trim(t)` | text without spaces at both ends | `trim("  a ")` is `"a"` |
| `split(t [, separator])` | a list of pieces; with no separator, splits on whitespace | `split("a b")` is `["a", "b"]` |
| `lines(t)` | a list of the lines in the text | `lines("a\nb")` is `["a", "b"]` |
| `join(list [, separator])` | one text; the separator defaults to `", "` | `join([1, 2], "-")` is `"1-2"` |
| `replace(t, find, with)` | text with every `find` replaced | `replace("aXa", "X", "-")` is `"a-a"` |
| `slice(t, start [, end])` | part of the text (end not included) | `slice("hello", 1, 3)` is `"el"` |
| `text(x)` | any value as text | `text(5)` is `"5"` |
| `number(x)` | text as a number (error if it is not one) | `number("4")` is `4` |
| `type_of(x)` | `text`, `number`, `yes/no`, `list`, `map`, `nothing`, `function`, `agent`, `team` | `type_of(1)` is `"number"` |

## 10.2  Numbers

| Function | Gives back | Example |
|:--|:--|:--|
| `round(x [, digits])` | rounded number | `round(2.567, 2)` is `2.57` |
| `floor(x)` | round down | `floor(2.9)` is `2` |
| `ceil(x)` | round up | `ceil(2.1)` is `3` |
| `abs(x)` | without the minus sign | `abs(-4)` is `4` |
| `min(list)` or `min(a, b, ...)` | smallest number | `min(3, 1, 2)` is `1` |
| `max(list)` or `max(a, b, ...)` | largest number | `max([3, 9])` is `9` |
| `sum(list)` or `sum(a, b, ...)` | total | `sum([1, 2, 3])` is `6` |
| `random(low, high)` | a random whole number from low to high, **both included** | `random(1, 6)` |

## 10.3  Lists and maps

| Function | Gives back | Example |
|:--|:--|:--|
| `range(n)` or `range(a, b)` | the list `0..n-1`, or `a..b-1` | `range(2, 5)` is `[2, 3, 4]` |
| `first(list)` / `last(list)` | the first or last item, or `nothing` if empty | `last([1, 2])` is `2` |
| `sort(list)` | a new sorted list | `sort([3, 1])` is `[1, 3]` |
| `reverse(list)` | a new reversed list | `reverse([1, 2])` is `[2, 1]` |
| `unique(list)` | a new list without repeats | `unique([1, 1])` is `[1]` |
| `slice(list, start [, end])` | part of the list | `slice([1, 2, 3], 1)` is `[2, 3]` |
| `keys(map)` / `values(map)` | the keys or the values as a list | `keys({a: 1})` is `["a"]` |
| `map(list, function)` | a new list with the function applied to each item | `map([1, 2], double)` |
| `filter(list, function)` | the items for which the function gives yes | `filter([1, 2], is_big)` |

## 10.4  Data

| Function | Gives back |
|:--|:--|
| `json(text)` | the data in the JSON text (forgives code fences and chatter around it) |
| `to_json(value [, pretty])` | JSON text. Pass `yes` as the second input for indented output |

## 10.5  The outside world

| Function | Does |
|:--|:--|
| `now()` | the current date and time as text (ISO format) |
| `today()` | today's date as text, like `2026-10-13` |
| `env(name)` | the value of an environment variable, or `nothing` |
| `sleep(seconds)` | waits |
| `read_file(path)` | the contents of a file as text |
| `write_file(path, text)` | writes a file (replacing it) |
| `fetch(url)` | the text of a web page or API response (an error if the request fails) |

> **Warning.** `read_file`, `write_file` and `fetch` are **your** program doing things, with no permission prompts. Permission prompts (Chapter 11) apply to what **agents** do. Your own script is trusted.

## 10.6  Working with agents

| Function | Does |
|:--|:--|
| `ask_all(list_of_agents, prompt)` | asks every agent in the list the same thing **at the same time** and gives back a list of replies in the same order |

Chapter 14 shows it in action.

## 10.7  Your own functions

Anything you define with `to` joins the toolbox. You can even replace a built-in name with your own function; yours wins.

## 10.8  Exercises

1. Use `split`, `map` and `join` to turn `"red green blue"` into `"RED, GREEN, BLUE"`.
2. Use `random` to simulate rolling two dice and print the total.
3. Use `today()` in a sentence: "Today is ...".

---

# 11  Meet agents

An **agent** is an AI with a name, a personality, and (optionally) abilities. You create one with `agent`, then talk to it with `ask`.

## 11.1  Your first agent

We use `model "mock"` for now. `mock` is a pretend AI built into Ion that needs no key and costs nothing. It simply repeats what you say. That is perfect for learning how everything fits together.

```ion-run
agent buddy:
    model "mock"
    role "You are a friendly assistant."

set answer to ask buddy "Hello there"
say answer
```
```output
mock reply: Hello there
```

Two new things:

- The `agent` block defines the agent. Its settings are indented lines.
- `ask buddy "..."` sends a message and **gives back the reply as text**. Here we store it in `answer` and print it.

You can print directly too: `say ask buddy "Hello"`.

> **Note.** With a real model, `buddy` would answer like a person: *"Hi there! How can I help?"* Chapter 12 shows how to switch. Everything else stays identical.

## 11.2  The settings of an agent

Each setting is one line inside the agent block:

| Setting | Meaning | Example |
|:--|:--|:--|
| `model` | **Required.** Which AI to use. | `model "gemini/gemini-2.5-flash"` |
| `role` | The agent's instructions and personality. (`instructions` also works.) | `role "You are a pirate."` |
| `key` | An API key for the model (Chapter 12). | `key from env "MY_KEY"` |
| `can` | An ability the agent has (Section 11.5). | `can browse the web` |
| `remembers` / `forgets` | Whether it remembers earlier messages. | `forgets between asks` |
| `input` / `output` | Which modes the chat page offers. | `input text, voice` |

Only `model` is required.

## 11.3  The `role`

The role is the most powerful setting. It is the standing instruction the AI follows in every reply. Be specific. Say who the agent is, what it should do, and how it should answer.

For long instructions, use multi-line text (Section 3.1). You can even put variables inside:

```ion-run
set audience to "ten year olds"
agent teacher:
    model "mock"
    role """
        You are a patient science teacher.
        Explain things so {audience} understand.
        Use one short example. Never use jargon.
        """

say ask teacher "why is the sky blue?"
```
```output
mock reply: why is the sky blue?
```

> **Tip.** Treat the role like a job description for a new employee. Vague roles give vague answers.

## 11.4  Memory

By default an agent **remembers the conversation**. Each `ask` sees everything that came before. That is what makes follow-up questions work: "What is the capital of France?" then "How many people live there?"

```ion
agent guide:
    model "gemini/gemini-2.5-flash"

say ask guide "What is the capital of France?"
say ask guide "How many people live there?"
```

The second question works because the agent remembers the first. If you want every `ask` to start fresh, add:

```ion
agent translator:
    model "gemini/gemini-2.5-flash"
    forgets between asks
```

Use `forgets` for one-off jobs (translating, classifying, extracting data), where history would only add cost and confusion.

## 11.5  Abilities: what an agent is allowed to do

By default an agent can only talk. To let it act on your computer or the internet, you grant **abilities** with `can`:

| Line | What the agent gets |
|:--|:--|
| `can access files in "folder"` | Read, write and list files, **only inside that folder** |
| `can browse the web` | Fetch web pages, and open a real browser window |
| `can run commands` | Run commands in your terminal |
| `can read gmail with token from env "NAME"` | Search and read your Gmail |
| `can use tool_a, tool_b` | Use tools you wrote (Chapter 13) |
| `can ask agent_a, agent_b` | Hand tasks to other agents (Chapter 14) |

```ion
agent librarian:
    model "gemini/gemini-2.5-flash"
    role "You help me find things in my notes."
    can access files in "./notes"
```

Now `ask librarian "What notes do I have about gardening?"` lets the agent list and read files in `./notes` to find the answer.

### How safe is this?

Abilities are **opt-in** and **narrow**:

- The agent gets only what you listed. Nothing else.
- `can access files in "./notes"` is a **fence**. A request to read outside the folder (for example `../secrets.txt`) is refused.
- **The first time** each agent uses each kind of ability in a run, Ion **asks you** (`Allow 'librarian' to use file-access (read 'a.txt')? [y/N]`). In the chat web page this is a card with Allow and Deny buttons. After you approve, that agent can keep using that ability for the rest of the run.
- `--yes` approves everything automatically. Only use it for programs you fully trust.

> **Warning.** `can run commands` is **not fenced**. The agent can run anything your own account can run. Grant it rarely, and read what the agent asks to run before pressing `y`.

> **Warning.** `can browse the web` includes `browse_page`, which opens a visible Chromium window. The first time, you may need to run `npx playwright install chromium`.

## 11.6  `ask` in detail

```ion
set reply to ask agent_name "your message"
```

- The target is the name of an agent or team (or the word `user`).
- The message is any text expression, so `ask a "Summarize: " + article` works. (The message ends at a comparison or `and`; put brackets around anything fancier.)
- The result is **text**. If you asked for structured data, convert it with `json(...)`.
- If the AI service fails (bad key, no internet, rate limit), the error says so, and you can catch it with `try`.

### Asking the person at the keyboard

`ask user` prints your question and waits for a line of typing:

```ion
set name to ask user "What is your name?"
say "Nice to meet you, {name}!"
```

If input ends (for example the program is run with no keyboard attached), `ask user` gives back `nothing`.

## 11.7  The `chat` statement

For a quick terminal conversation with an agent, write `chat with`:

```ion
agent buddy:
    model "gemini/gemini-2.5-flash"
    role "You are a friendly assistant."

chat with buddy
```

Type messages and read answers. Type `exit`, `quit`, or `bye` to finish. A bare empty line is ignored.

## 11.8  Names must be unique

An agent, a team and a tool cannot share a name. If you try, Ion says `There is already an agent, team or tool called 'x'.`

## 11.9  Exercises

1. Create an agent with `model "mock"` and ask it two questions.
2. Create two agents and ask each one the same question. Print both replies.
3. Write a role that makes an agent answer only in rhymes. (You will see its effect once you use a real model.)
4. Decide: should a translator agent remember or forget? Why?
