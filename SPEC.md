# The Ion Language Reference

This is the reference for the Ion language: what every line means and what each word does. For a gentle introduction, read [LANGUAGE.md](LANGUAGE.md) or the guide in `guide/`.

Ion is designed to read like English. Where this document gives a rule, it is the rule the interpreter follows. Where the rule is surprising, the reason is given.

This reference describes **language version 1.0** (see [Stability](#16-stability-and-versions)).

---

## 1. Source files

- A source file is text in UTF-8. Line endings may be `\n` or `\r\n`.
- A file ends with `.ion`.
- A `#` starts a comment that runs to the end of the line. Comments can go on their own line or after code.
- Each statement sits on its own line. A statement may run over several lines only inside `(`, `[` or `{` brackets.

### Blocks

A line that starts a block ends with `:`. The lines that belong to the block come next and are indented one level deeper than that line:

```ion
if yes:
    say "inside"
say "outside"
```

- The indent width is up to you as long as it is consistent within a block. `ion fmt` uses 4 spaces.
- A block ends at the first line indented less than it.
- A block must have at least one line.

### Triple-quoted text

Text between `"""` marks may span lines. Its common leading indent is removed:

```ion
set prompt to """
    You are a poet.
    Write about {topic}.
    """
```

---

## 2. Names

- A name starts with a letter or `_`, then letters, digits or `_`: `total`, `_tmp`, `user2`.
- Names are case-sensitive: `Total` and `total` are different.
- Hyphens are not allowed in names.

### Reserved words

These can never be used as a variable or function name:

```
set  say  add  remove  if  otherwise  else  repeat  for  while
stop  skip  to  give  try  use  agent  team  tool  chat  serve
describe  ask  user  and  or  not  is  in  true  false  yes  no
nothing  contains
```

Some words are only keywords in certain places, so they are still usable as ordinary names elsewhere:

- `test` starts a test block only when a text value follows it (`test "name":`).
- `assert` is a statement only when a value follows it at the start of a line.
- `mcp` starts a server definition only as `mcp name:`, and `rag` starts a knowledge base only as `rag name from ...`.
- Words such as `model`, `role`, `key`, `can`, `input` and `output` are settings only inside an `agent` block.

---

## 3. Values

| Type | Examples | Notes |
|---|---|---|
| text | `"Ada"`, `"""..."""` | Quoted with `"`. |
| number | `3`, `3.5` | There is one number type. No hex or exponent form. |
| yes/no | `yes`, `no`, `true`, `false` | `yes` and `true` are the same value, and so are `no` and `false`. |
| nothing | `nothing` | The absence of a value. |
| list | `[1, "two", yes]` | Ordered. Lists can hold any values, including lists and maps. |
| map | `{name: "Ada", age: 36}` | Keys are text. Keys may be written as words or quoted text. |
| function | defined with `to` or `tool` | Can be stored and passed around like any value. |
| agent or team | defined with `agent` or `team` | Used with `ask`, `chat` and `serve`. |

### Text escapes

- `\n` is a new line and `\t` is a tab.
- `\"`, `\'`, `\\`, `\{` and `\}` give the character itself.
- Any other backslash is kept as written, so `"\s+"` is a valid pattern for `regex_matches`.

### Interpolation

Inside text, `{` followed by a letter starts an embedded expression. The expression runs to the matching `}`:

```ion
set name to "Ada"
say "Hello, {name}! Next year you'll be {age + 1}."
```

A `{` that is not followed by a letter is literal, so JSON in a prompt is safe: `"{"a": 1}"`. Write `\{` to force a literal brace before a letter.

---

## 4. Expressions

### Operators, from loosest to tightest

| Level | Operators | Notes |
|---|---|---|
| 1 | `or` | Short-circuit. Gives the first truthy value, or the last value. |
| 2 | `and` | Short-circuit. Gives the first falsy value, or the last value. |
| 3 | `not` | Binds looser than comparisons: `not x is 5` means `not (x is 5)`. |
| 4 | comparisons | See below. Comparisons do not chain: `a < b < c` compares yes/no with a number and is an error. Write `a < b and b < c`. |
| 5 | `+` `-` (`plus`, `minus`) | Addition, subtraction, and text or list joining. |
| 6 | `*` `/` `%` (`times`, `divided by`, `mod`) | Multiplication, division and remainder. |
| 7 | unary `-` | Negation. |
| 8 | `f(x)`, `list[i]`, `map.field` | Call, index and field access. |
| 9 | literals, names, `( ... )`, `ask` | |

Use brackets to be explicit: `(a plus b) times c`.

### Comparisons

| Words | Symbol | Meaning |
|---|---|---|
| `is`, `is not` | `==`, `!=` | Equal, or not equal. |
| `is greater than`, `is more than`, `is bigger than` | `>` | |
| `is less than`, `is fewer than`, `is smaller than` | `<` | |
| `is at least` | `>=` | |
| `is at most` | `<=` | |
| `contains`, `does not contain`, `is in` | | `a contains b` is true when `a` holds `b`. `x is in list` is the same as `list contains x`. |
| `starts with`, `ends with` | | Text only. |

`is` compares lists and maps by their contents: `[1, 2] is [1, 2]` is yes. Values of different types are never equal, so `"5" is 5` is no.

`<`, `>`, `<=` and `>=` work on two numbers or two texts. Mixing types is an error.

`+` joins text when either side is text, so `"Age: " + 36` is `"Age: 36"`. It joins two lists into one new list.

Dividing by zero is an error.

### Truthiness

These values are false: `nothing`, `no`, `0`, empty text `""`, empty lists `[]`, and empty maps `{}`. Everything else is true.

### Indexing and fields

- `list[0]` is the first item. Negative positions count from the end: `list[-1]` is the last.
- `map["key"]` and `map.key` read a field. A missing field gives `nothing`.
- `text.length` and `list.length` give the length.
- `agent.name` gives the name of an agent.

---

## 5. Statements

### `set`

```ion
set x to 5
set person.age to 37
set items[0] to 99
```

Creates a variable, or changes one that exists. Changing a variable inside a block changes the nearest existing variable with that name.

### `say`

```ion
say "Hello"
say total
```

Prints a value followed by a new line. Lists and maps print in a readable form.

### `add` and `remove`

```ion
add 30 to xs
remove 10 from xs
remove "key" from person
```

`add` appends to the end of a list. `remove` takes out the first matching item from a list, or deletes a key from a map. Removing something that is not there does nothing.

### `if`

```ion
if age is at least 18:
    say "welcome"
otherwise if age is less than 5:
    say "too young"
otherwise:
    say "sorry"
```

Runs the first branch whose condition is truthy. `else` is accepted in place of `otherwise`.

### `repeat`, `for each`, `while`

```ion
repeat 3 times:
    say "hi"

for each fruit in ["apple", "pear"]:
    say fruit

while count is less than 10:
    set count to count + 1

repeat forever:
    if done:
        stop
    skip
```

- `repeat N times` needs a number.
- `for each name in X` works over a list (each item), text (each character), or a map (each key).
- `stop` leaves the innermost loop. `skip` jumps to its next round.
- `stop` and `skip` outside a loop are errors.

### `to` (functions)

```ion
to greet(name):
    describe "Says hello to someone."
    give back "Hello, " + name

say greet("Ada")
```

- A function may take any number of inputs, including none: `to now_text():`.
- `give back value` returns a value. `give back` with no value returns `nothing`. A function that ends without `give back` returns `nothing`.
- A `describe` line directly under the header is the function's documentation.
- Functions can be passed as values: `map([1, 2, 3], double)`.

### `try`

```ion
try:
    set data to fetch("https://example.com/missing")
on error as problem:
    say "Could not load it: {problem}"
```

Runs the `try` block. If anything in it fails, the `on error` block runs. The error is named after `as`, or `error` if no name is given, and holds the error message as text.

### `give back` outside a function

`give back` at the top level ends the script early.

### `use`

```ion
use "helpers.ion"
```

Runs another file and makes its names available. The path is relative to the file that contains the `use` line. A file is run at most once even if several files use it. Its names share the same global namespace as the file that uses it, so two files that define the same name conflict.

### `describe`

Only valid as the first line of a function or tool body. It documents that item and does nothing when run. Elsewhere, including inside an agent, it is an error.

### `ask`

```ion
ask writer "Write a haiku about rain"
set answer to ask user "What is your name?"
```

- `ask agent "prompt"` sends a message to an agent or team and gives back its reply as text.
- `ask user "prompt"` asks the person running the script, and gives back what they type.
- `ask` may be used as a value anywhere an expression is allowed.

### `chat` and `serve`

```ion
chat with assistant
serve assistant on port 4310
```

- `chat with X` starts an interactive chat in the terminal with an agent or team.
- `serve X` starts a web chat and API for an agent or team. The default port is `4310`.

These are not allowed inside a `test` block.

---

## 6. Agents

```ion
agent researcher:
    model "gemini/gemini-2.5-flash"
    role "You research topics carefully and cite sources."
    key from env "GEMINI_API_KEY"
    can browse web
    can access files in "./notes"
    can use fetch_summary
    input text, voice
    output text
```

Settings, all optional unless noted:

| Setting | Meaning |
|---|---|
| `model "provider/model-id"` | Which AI model to use. The provider name (`gemini`, `openai`, `anthropic`, `openrouter`, `groq`, `cerebras`) selects the service. `mock` and `demo` run offline. |
| `role "..."` (or `instructions`) | What the agent is for. Its standing instructions. |
| `key from env "NAME"` | Read the API key from an environment variable. Preferred. |
| `key "literal"` (or `apikey`) | Put the key directly in the file. Avoid this. |
| `fallback "provider/model"` | A model to switch to if the main one is rate-limited or down. Can be repeated. |
| `endpoint "url"`, `format openai\|anthropic\|raw`, `header "Name"` | Use your own service. `auth header` is also accepted. |
| `can ...` | Abilities. See below. Repeat `can` for each one. |
| `remembers` / `forgets` | Whether the agent keeps the conversation going. `remembers` is the default. |
| `input text, voice` / `output text` | How people talk to it when it is served. |

An agent's name is a variable: `agent.name` gives its name.

### Abilities (`can`)

| Ability | Gives the agent |
|---|---|
| `can access files in "folder"` | Read files in that folder, and write files there too. Other folders are off limits. |
| `can browse web` | Fetch web pages. |
| `can run commands` | Run shell commands. |
| `can read gmail with token from env "NAME"` | Read a Gmail account with an access token. |
| `can use tool_a, tool_b` | Call these tools, which are defined with `tool`. Also takes the name of an MCP server (see [MCP servers](#mcp-servers-mcp)). |
| `can search knowledge.vct` | Search this knowledge base (see [Knowledge bases](#knowledge-bases-rag)). |
| `can ask other, team` | Delegate to other agents or teams. |

Abilities that touch your computer or the internet ask the person first. `ion run --yes` approves them all without asking. In `ion test`, they are denied unless `--yes` is given.

---

## 7. Tools

A tool is a function an agent can call on its own.

```ion
tool word_count(text):
    describe "Counts the words in a piece of text."
    give back length(split(text))

agent writer:
    model "mock"
    can use word_count
```

- Define a tool with `tool`, then give it to an agent with `can use`.
- A tool may also be called directly like a function: `say word_count("one two")`.
- The `describe` line is shown to the agent as the tool's purpose, so write it as a plain sentence.

---

### Knowledge bases (`rag`)

```ion
rag handbook.vct from "handbook.pdf"

agent clerk:
    model "mock"
    can search handbook.vct
```

- `rag NAME from "SOURCE"` makes a knowledge base called `NAME`. The name must end in `.vct`, and it is the name agents use.
- The source can be a PDF, a text file, or Markdown. Ion reads the text, splits it into chunks of about 800 characters, and saves them to `NAME` (here `handbook.vct`) next to the script. The `.vct` file is JSON, so you can read it.
- The file is rebuilt only when the source changes. The run prints a note when it rebuilds.
- A `.vct` source is loaded as it is, without chunking.
To search by **meaning**, add an indented `embedding model "provider/model"` line under the `rag` line:

```ion
rag handbook.vct from "handbook.pdf"
    embedding model "gemini/gemini-embedding-001"
```

- Ion then stores a vector for each chunk, and a question finds passages with the same meaning even when they share no words. `gemini/gemini-embedding-001` and `openai/text-embedding-3-small` are supported; Anthropic has no embedding models. The key comes from `GEMINI_API_KEY` or `OPENAI_API_KEY`, like agent keys. Each question is sent to the embedding service, so it costs a little.
- With no setting, the first build asks in the terminal whether to search by meaning, and what model to use. Press Enter for keyword search. Scripts run without a terminal use keyword search and don't ask. An existing `.vct` keeps the model it was built with.
- `can search NAME` gives the agent a tool, `search_<name>`, that takes a `query` and returns the most relevant chunks. Keyword search (BM25) finds passages that share words with the question. Meaning search finds passages that say the same thing in other words.
- Changing the source or the embedding model rebuilds the file.
- The knowledge base must be defined above the agent that searches it.

### MCP servers (`mcp`)

```ion
mcp files:
    command "npx -y @modelcontextprotocol/server-filesystem ./notes"

agent librarian:
    model "gemini/gemini-2.5-flash"
    key from env "GEMINI_API_KEY"
    can use files
    can run commands
```

- An MCP server is a program that offers tools, using the Model Context Protocol. `mcp NAME:` with a `command` tells Ion how to start it.
- `can use NAME` gives the agent every tool that server offers. Each tool is named `NAME__tool`, such as `files__read_text_file`.
- The server starts the first time an agent uses it, and it is stopped when the script ends.
- An MCP server runs a program on your computer, so an agent that uses one also needs `can run commands`. The first call asks you for permission, like any other risky ability.
A server reached over the web takes a `url` instead of a `command`, and an optional `key from env "NAME"` that is sent as a bearer token:

```ion
mcp weather:
    url "https://example.com/mcp"
    key from env "WEATHER_TOKEN"
```

- Ion speaks the streamable HTTP form of MCP, including session ids and replies sent as event streams. A web server doesn't run on your computer, so it doesn't need `can run commands`.
- The server must be defined above the agent that uses it.

### Agents that read and send

An agent can't both read private things (files, Gmail, a knowledge base) and send data out (browse the web, or run commands). A web page or document it reads could tell it to send your data out, so Ion refuses that combination. Split the work into two agents and put them in a team. MCP servers count as running commands.

## 8. Teams

```ion
team research:
    lead writer
    members researcher, editor
```

- `lead` is the agent that receives the message first. It is required: asking a team that has no lead is an error.
- `members` lists the agents in the team.
- A team is used the same way as an agent: `ask research "..."`.

---

## 9. Errors

Every error names a line, and where it can, gives a hint about the fix. The message text is for people, and may change between versions (see [Stability](#16-stability-and-versions)).

- An error stops the script at that line, unless a `try` block catches it.
- `fail(message)` raises an error with your own message, and is a good way to stop a bad input early.
- `ion check` finds many errors (for example, an unknown agent or tool name) without running the script.

---

## 10. Tests

A test is a named block that checks the rest of the script:

```ion
to double(n):
    give back n times 2

test "doubling works":
    assert double(4) is 8
    assert double(0) is 0

test "a deliberate failure":
    assert double(4) is 9
```

Run them with:

```
ion test path/to/script.ion
ion test path/to/folder
```

- `assert condition` passes when the condition is truthy and fails otherwise.
- `assert a is b` also reports both values when it fails:
  `I expected 9, but it was 8.`
- Each test runs in order and sees the script's variables. A test that fails does not stop the others.
- `test` blocks are skipped by `ion run`, `ion preview` and `ion repl`, so they cost nothing in a finished program.
- Use the `mock` model to test agent logic without an API key or network.
- Tests may not start a server (`serve`, `chat`), so keep those in the main script.

---

## 11. Built-in functions

Built-in functions are called like any other function. Arguments in `[brackets]` are optional.

### Text

| Function | Gives back |
|---|---|
| `length(x)` | The number of characters in text, or items in a list or map. |
| `upper(text)`, `lower(text)`, `trim(text)` | The text in upper case, lower case, or without surrounding spaces. |
| `split(text[, separator])` | A list of pieces. Without a separator, splits on any whitespace. |
| `join(list[, separator])` | The items as text, joined. Default separator is `, `. |
| `lines(text)` | A list of lines. |
| `replace(text, old, new)` | Every `old` replaced with `new`. |
| `regex_replace(text, pattern, new)` | Every match of a regular expression replaced. |
| `regex_matches(text, pattern[, flags])` | Every match. With capture groups, each match is a list of its groups. |
| `slice(text_or_list, start[, end])` | Part of the text or list. |
| `text(x)` | `x` as text. |
| `number(x)` | Text converted to a number. Fails when the text is not a number. |
| `url_encode(text)`, `url_decode(text)` | URL-safe text and back. |
| `base64_encode(text)`, `base64_decode(text)` | Base64 text and back. |

### Numbers

| Function | Gives back |
|---|---|
| `round(x[, digits])`, `floor(x)`, `ceil(x)`, `abs(x)` | Rounded, rounded down, rounded up, or the absolute value. |
| `min(a, b, ...)`, `max(a, b, ...)`, `sum(list)` | Smallest, largest or total. |
| `random(low, high)` | A whole number from `low` to `high`, both included. |
| `range(end)` or `range(start, end)` | A list of whole numbers from `start` (default 0) up to, not including, `end`. |

### Lists and maps

| Function | Gives back |
|---|---|
| `first(list)`, `last(list)` | The first or last item, or `nothing` if the list is empty. |
| `sort(list)`, `reverse(list)`, `unique(list)` | A new list, sorted, reversed, or with repeats removed. |
| `keys(map)`, `values(map)` | The keys or values of a map as a list. |
| `map(list, function)` | A new list with the function applied to each item. |
| `filter(list, function)` | The items for which the function gives a truthy value. |
| `ask_all(agents, prompt)` | Asks every agent or team in the list, and gives back their replies as a list. |

### Data

| Function | Gives back |
|---|---|
| `json(text)` | The value described by JSON text. Accepts JSON inside a code fence or surrounded by other text. |
| `to_json(value[, pretty])` | The value as JSON text. Pass `yes` as the second input for indented output. |
| `type_of(x)` | The type name of a value, as text. |

### Web and files

| Function | Gives back |
|---|---|
| `fetch(url)` | The text of a web page. Fails on a non-success status. |
| `http(method, url[, options])` | A full HTTP response. Options are `headers`, `query`, `bearer`, `body`, `form`, `timeout`, `public_only` and `max_bytes`. |
| `read_file(path[, limit])` | The contents of a file as text. With a `limit`, reads at most that many characters. |
| `write_file(path, text)` | Writes a file. |
| `list_dir(path)` | The entries in a folder. |
| `walk_dir(path[, options])` | Every file under a folder. Options are `skip`, `max_entries` and `max_depth`. |
| `file_info(path)`, `real_path(path)` | Details about a file, or its full path. |

### Dates and time

| Function | Gives back |
|---|---|
| `now()`, `today()` | The current date and time in ISO format, or today's date. |
| `now_local()` | The current local time with its offset. |
| `time()` | The current time as seconds since 1970. |
| `timezone()` | The name of the local time zone. |
| `weekday(date)` | The day name for a date. |
| `add_days(date, n)` | The date `n` days later, as `YYYY-MM-DD`. |
| `day_start(date)` | The start of that day, in local time. |

### Environment and control

| Function | Gives back |
|---|---|
| `env(name)` | The value of an environment variable, or `nothing`. |
| `load_env(path)` | Loads a `.env` file. Gives back how many variables it set. Values are never shown. |
| `sleep(seconds)` | Waits. |
| `fail(message)` | Stops with an error carrying `message`. |

---

## 12. Command line

| Command | What it does |
|---|---|
| `ion run file.ion` | Runs a script. A `serve` line in it starts a web chat and API. |
| `ion preview [file.ion]` | Opens the chat web page. With no file, shows a demo team that needs no key. |
| `ion check file.ion` | Finds mistakes without running the script or calling any AI. |
| `ion test path` | Runs the `test` blocks in a file, or in every `.ion` file in a folder. |
| `ion fmt file.ion` | Tidies indentation and spacing in place. `--check` only reports. |
| `ion repl` | Type Ion one piece at a time. |
| `ion lsp` | Runs the language server, so editors can show errors and completions. |
| `ion --version` | Shows the `ion` version and the language version. |

Options that matter everywhere: `--yes` approves permission prompts. `--port N` sets the server port. If that port is already in use, `run` and `preview` offer two free ports nearby or let you type your own. Without a terminal they stop and name two free ports to use with `--port`.

For `run` and `preview`:

| Option | Meaning |
|---|---|
| `--data <folder>` | Keep conversations in this folder, so they survive restarts. Off by default. |
| `--budget <tokens>` | Stop model calls once this many tokens have been used. A provider that reports no usage is estimated at about four characters per token. |
| `--trace` | Print each model call, tool call and permission decision as it happens. |
| `--no-log` | Don't write the run log. |
| `--log-content` | Include message and tool-result text in the run log. Off by default. |

Each run writes a JSON-lines log to `.ion/logs/` next to the script, unless `--no-log` is given. Known secrets are replaced with `[hidden]` in the log.

Scripts that start with the line `ion init` use the old syntax (see below). Every other script uses the syntax in this document.

---

## 13. Modules

`use "file.ion"` runs the file once and brings in its names. See [Section 5, `use`](#use).

There is no namespace, no selective import, and no package system yet. A name defined in an imported file can clash with one in the importing file.

---

## 14. Old-style files

Files that begin with the line `ion init` use an earlier syntax with a `type ==` line, `agentdef` blocks and `grant` lines. They still run:

```
ion init
type == single
agentdef assistant {
ai-provider == gemini
ai-apikey == env:GEMINI_API_KEY
grant web-browsing
}
```

New scripts should use the syntax in this document. `ion check` reports when it reads an old-style file.

---

## 15. Grammar summary

A short form of the grammar for reference. It is not a full formal grammar.

```
program     := statement*
statement   := set | say | add | remove | if | repeat | forever | for-each
             | while | stop | skip | function | give | try | use | describe
             | agent | team | tool | chat | serve | test | assert | ask-or-expr
set         := "set" target "to" expr
if          := "if" expr ":" block ( "otherwise" ("if" expr)? ":" block )*
function    := "to" NAME "(" (NAME ("," NAME)*)? ")" ":" block
tool        := "tool" NAME "(" ... ")" ":" block
test        := "test" TEXT ":" block
assert      := "assert" expr
block       := NEWLINE INDENT statement+ DEDENT
```

---

## 16. Stability and versions

### Two version numbers

- The **`ion` package version** (for example `0.1.0`) is the version of the software you install. It changes with every release.
- The **language version** (currently `1.0`) is the version of this document. `ion --version` shows both.

### What counts as a breaking change

A change that could stop a script that works today from running, or change what it prints, is breaking. Breaking changes are made only in a new language version, and only after a deprecation period in which the old form still works and `ion check` warns about it.

Changes that are not breaking, and can happen in any release:

- New built-in functions, new settings, new keywords that only act in new positions.
- Better error messages and hints. The wording of an error is not a stable interface, so do not match on it.
- Performance and tooling changes, including `ion fmt` output for code that already parses, unless the formatter changes the meaning of a script (that would be a bug).

### Words that are reserved

A word listed in [Section 2](#reserved-words) is reserved and will not be given a new meaning in version 1.0. New keywords in later versions will be added only where a plain name could not appear.

### Old-style files

Files that begin with `ion init` keep working for the whole of language version 1.0. They are not extended with new features.
