# Learn Ion in 10 minutes

Ion is a programming language where AI agents are built-in. It reads like English, and the same file can be a quick script or a full chat app for a team of agents.

```
agent buddy:
    model "gemini/gemini-2.5-flash"
    role "You are a friendly assistant."

say ask buddy "Tell me a fun fact"
```

Run it: `ion run hello.ion`. Check it for mistakes without running: `ion check hello.ion`. Try things live: `ion repl`.

---

## 1. The basics

```
# a comment
set name to "Ada"
set age to 36
say "Hello, {name}! Next year you'll be {age + 1}."
```

- `set x to ...` creates or changes a variable.
- `say ...` prints.
- Put any expression inside `{ }` in text to insert it.
- Types: text `"hi"`, numbers `3.5`, yes/no (`yes`, `no`, `true`, `false`), `nothing`, lists `[1, 2]`, maps `{name: "Ada"}`.
- Blocks are indented by 4 spaces and the line before ends with `:`.

Use `\{` for a literal brace. A `{` only starts an insert when a letter follows it, so JSON such as `{"a": 1}` is safe in prompts.

Multi-line text uses triple quotes and ignores the shared indentation:

```
set prompt to """
    You are a poet.
    Write about {topic}.
    """
```

## 2. Reads like English

```
if age is at least 18 and name is not "Bob":
    say "welcome"
otherwise if age is less than 5:
    say "too young"
otherwise:
    say "sorry"
```

| Plain English | Symbol |
|---|---|
| `is`, `is not` | `==`, `!=` |
| `is greater than`, `is less than` | `>`, `<` |
| `is at least`, `is at most` | `>=`, `<=` |
| `contains`, `does not contain`, `is in` | |
| `starts with`, `ends with` | |
| `plus`, `minus`, `times`, `divided by`, `mod` | `+ - * / %` |
| `and`, `or`, `not` | |

Both styles work, and you can mix them.

## 3. Repeating things

```
repeat 3 times:
    say "hi"

for each fruit in ["apple", "pear"]:
    say fruit

while count is less than 10:
    set count to count + 1

repeat forever:
    if done:
        stop        # leave the loop
    skip            # jump to the next round
```

## 4. Lists and maps

```
set xs to [10, 20]
add 30 to xs            # [10, 20, 30]
remove 10 from xs
say xs[0]               # positions start at 0; xs[-1] is the last one
set xs[0] to 99

set person to {name: "Ada", age: 36}
set person.age to 37
say person["name"]
```

## 5. Functions

```
to greet(name):
    give back "Hello, " + name

say greet("Ada")
```

Handy built-ins: `length  upper  lower  trim  split  join  replace  slice  number  text  round  floor  ceil  abs  min  max  sum  range  sort  reverse  unique  first  last  keys  values  map  filter  json  to_json  type_of  now  today  env  random  sleep  read_file  write_file  fetch  lines`.

```
say map([1, 2, 3], double)         # functions are values
say json('{"a": 1}').a             # parse JSON, even when a model wraps it in a code fence
```

## 6. Handling errors

```
try:
    set data to fetch("https://example.com/missing")
on error:
    say "Could not load it: {error}"
```

Name the error yourself with `on error as problem:`.

## 7. Agents

```
agent researcher:
    model "gemini/gemini-2.5-flash"      # provider/model, required
    role "You find facts and cite sources."
    key from env "MY_GEMINI_KEY"         # optional, see below
    can browse the web
    can access files in "./notes"
    remembers                            # default; "forgets between asks" turns it off
```

`ask` sends a message and gives back the reply:

```
set answer to ask researcher "What is the tallest mountain?"
set name to ask user "What's your name?"       # ask the person at the keyboard
```

**Models** are `"provider/model-name"`:

| Provider | Key variable | Example |
|---|---|---|
| `gemini` | `GEMINI_API_KEY` | `"gemini/gemini-2.5-flash"` |
| `openai` | `OPENAI_API_KEY` | `"openai/gpt-4o-mini"` |
| `anthropic` | `ANTHROPIC_API_KEY` | `"anthropic/claude-sonnet-5"` |
| `openrouter` | `OPENROUTER_API_KEY` | `"openrouter/anthropic/claude-3.5-sonnet"` |
| `groq` | `GROQ_API_KEY` | `"groq/llama-3.3-70b-versatile"` |
| `cerebras` | `CEREBRAS_API_KEY` | `"cerebras/llama-3.3-70b"` |
| `custom` | optional | `"custom/llama3"` plus an `endpoint` line |
| `mock` | none | an offline fake for trying things without a key |

Everything after the first `/` is the model id, so OpenRouter ids like `anthropic/claude-3.5-sonnet` work as written. Name only the provider (`"groq"`) to get its default model.

**Backup models.** Free tiers run out and services have bad moments. Give an agent one or more `fallback` lines and Ion switches when the main model is rate-limited or down (it first waits out short rate limits and retries; for a used-up daily quota it switches at once and skips the main model for 10 minutes):

```
agent helper:
    model "gemini/gemini-2.5-flash"
    fallback "gemini/gemini-2.5-flash-lite"
    fallback "groq/llama-3.3-70b-versatile"     # another provider uses its own key variable
```

Errors a different model can't fix (a wrong key, a bad request) are reported, not retried.

**Your own server (custom).** Point Ion at anything that speaks the OpenAI API, such as Ollama, LM Studio, vLLM or a company gateway:

```
agent local:
    model "custom/llama3"
    endpoint "http://localhost:11434/v1/chat/completions"
    key "optional-secret"          # leave out for a local model
    format openai                  # openai (default), anthropic, or raw
    header "X-Api-Key"             # where the key goes (default: Authorization)
```

**API keys** come from the environment. Gemini reads `GEMINI_API_KEY`, OpenAI reads `OPENAI_API_KEY`, and Anthropic reads `ANTHROPIC_API_KEY`. Put them in a `.env` file next to your script (`GEMINI_API_KEY=...`) and Ion loads it. Use `key from env "NAME"` to pick a different variable. If a key is missing, the error tells you exactly which one.

**Abilities** (`can ...`) are the only things an agent is allowed to do:

| Line | What the agent gets |
|---|---|
| `can access files in "folder"` | read and write files, only inside that folder |
| `can browse the web` | fetch pages and drive a real browser |
| `can run commands` | run shell commands |
| `can read gmail with token from env "GMAIL_TOKEN"` | search and read Gmail |
| `can use tool_a, tool_b` | tools you wrote (section 8) |
| `can ask other_agent` | hand tasks to other agents |

The first time an agent uses a risky ability, Ion asks you to approve it. `--yes` approves everything, so use it only for scripts you trust.

Other agent lines: `input text, voice` and `output text, voice` set what the chat UI offers.

## 8. Tools: give agents new powers

A tool is a function an agent can call. The `describe` line tells the AI what it is for.

```
tool word_count(text):
    describe "Counts the words in some text"
    give back length(split(text))

agent editor:
    model "openai/gpt-4o-mini"
    can use word_count
```

You can also call tools yourself: `word_count("a b c")`.

## 9. Teams

```
agent boss:
    model "gemini/gemini-2.5-flash"
agent coder:
    model "anthropic/claude-sonnet-5-5"
    can run commands
agent tester:
    model "openai/gpt-4o-mini"

team dev:
    lead boss
    members coder, tester

say ask dev "Build a fizzbuzz script and test it"
```

The lead decides who does what. For something looser, `can ask a, b` on any agent lets it delegate to those agents.

Run several agents at once and collect the answers:

```
set opinions to ask_all([coder, tester], "Is Python or Rust better for a CLI?")
```

## 10. Talk to your agents

```
chat with dev            # a chat in the terminal
serve dev                # a chat web page + API on http://localhost:4310
serve dev on port 5000
```

`ion run file.ion --headless` serves the API only (no page, no browser). Send `POST /message` with `{"text": "hello"}` and get `{"result": "..."}`, or connect a WebSocket to `/stream` for live updates. The web page has a microphone button when the agent declares `input text, voice`.

## Talking to the web and the world

`fetch(url)` gets a page. For anything else (headers, logins, POST, JSON) use `http`:

```
set reply to http("POST", "https://api.example.com/items", {bearer: env("TOKEN"), body: {name: "pen"}})
if not reply.ok:
    fail("The server said {reply.status}")
say reply.json.id
```

It gives back `{status, ok, text, json, headers}` and does not throw on 4xx/5xx, so you decide what a failure means. Other helpers: `base64_encode`, `base64_decode`, `url_encode`, `regex_replace`, `fail("message")`, `load_env("../keys.env")`, and dates: `now_local()`, `timezone()`, `weekday("2026-10-13")`, `add_days("2026-10-31", 1)`, `day_start("2026-10-13")`.

Text escapes: `\n` and `\t` mean newline and tab; any other backslash is kept as written, so a pattern like `"\s+"` works as is.

## 11. Splitting code across files

```
use "helpers.ion"        # runs that file first; its functions, tools and agents are now available
```

## Mistakes are friendly

```
set total to 1
say totl
```
```
script.ion:2: I don't know anything called 'totl'.
    say totl
  hint: Did you mean 'total'?
```

`ion check` also catches unknown agents, tools, models and teams before anything runs, and costs nothing because it never calls an AI.

## Testing your script

```
to double(n):
    give back n times 2

test "doubling works":
    assert double(4) is 8
```

Run `ion test script.ion`. A failing check tells you what you expected and what you got. Tests use `model "mock"` so they never call a real AI. Test blocks are ignored by `ion run`.

---

## Cheat sheet

```
set x to 5                      say "x is {x}"
if x is 5:   otherwise if ...:  otherwise:
repeat 3 times:                 for each i in list:         while cond:
stop   skip
to name(a, b):  give back v     try: ... on error:
add v to list   remove v from list
agent a: model/role/key/can/remembers/forgets/input/output
tool t(a):  describe "..."      team t: lead a / members b, c
ask a "prompt"    ask user "prompt"    chat with a    serve a on port N
use "file.ion"
test "name":  assert x is 5          ion test script.ion    ion fmt script.ion
```

Old files that start with `ion init` still run exactly as before.
