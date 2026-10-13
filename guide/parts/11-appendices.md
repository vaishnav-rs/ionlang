# Appendix A  Cheat sheet

## Statements

| Write | Does |
|:--|:--|
| `say value` | Print |
| `set name to value` | Create or change a variable |
| `set list[0] to v`, `set map.key to v` | Change an item or field |
| `add value to list` | Append to a list |
| `remove value from list_or_map` | Remove an item or key |
| `if cond:` / `otherwise if cond:` / `otherwise:` | Decide |
| `repeat 3 times:` | Repeat a fixed number of times |
| `repeat forever:` | Repeat until `stop` |
| `while cond:` | Repeat while true |
| `for each x in things:` | Go through a list, text or map |
| `stop` / `skip` | Leave the loop / next round |
| `to name(a, b):` ... `give back value` | Define a function |
| `try:` ... `on error:` / `on error as e:` | Catch failures |
| `use "file.ion"` | Include another file |
| `describe "text"` | Document a function or tool |

## Agents, tools and teams

| Write | Does |
|:--|:--|
| `agent name:` | Define an agent (settings indented below) |
| `model "provider/name"` | Which AI (required) |
| `role "text"` | Instructions and personality |
| `key "..."` / `key from env "NAME"` | API key |
| `can access files in "folder"` | Fenced file access |
| `can browse the web` | Fetch pages, open a browser |
| `can run commands` | Run commands (not fenced!) |
| `can read gmail with token from env "X"` | Gmail |
| `can use tool_a, tool_b` | Use your tools |
| `can ask agent_a, team_b` | Delegate to others |
| `remembers` / `forgets between asks` | Memory |
| `input text, voice` / `output text, voice` | Chat page modes |
| `tool name(a):` + `describe "..."` | Define a tool |
| `team name:` + `lead x` + `members a, b` | Define a team |
| `ask who "message"` | Ask; gives back text |
| `ask user "question"` | Ask the person typing |
| `chat with who` | Terminal chat |
| `serve who [on port N]` | Chat web page and API |

## Expressions

```text
"text {inside}"   'single quotes'   """multi-line"""
42   3.5   -1   yes   no   nothing
[1, 2, 3]   {name: "Ada"}   list[0]   map.name   map["name"]
+ - * / %   plus minus times "divided by" mod
is   "is not"   "is greater than"   "is less than"   "is at least"   "is at most"
contains   "does not contain"   "is in"   "starts with"   "ends with"
and   or   not
```

## Commands

```text
ion run file.ion [--yes] [--headless] [--port N]
ion check file.ion
ion repl
ion preview [file.ion] [--port N] [--no-open]
```

---

# Appendix B  Reserved words

These words have a special meaning and cannot be used as names:

`set` `say` `add` `remove` `if` `otherwise` `else` `repeat` `for` `while` `stop` `skip` `to` `give` `try` `use` `agent` `team` `tool` `chat` `serve` `describe` `ask` `user` `and` `or` `not` `is` `in` `true` `false` `yes` `no` `nothing` `contains`

Other words (`each`, `back`, `on`, `error`, `as`, `from`, `times`, `forever`, `lead`, `members`, `model`, `role`, `key`, `can`, `input`, `output`) have meaning only in particular places, and you can still use most of them as names, though it is clearer not to.

---

# Appendix C  Error message glossary

| Message | What it means and what to do |
|:--|:--|
| `I don't know anything called 'x'` | A name was used that was never created. Check spelling and order |
| `I expected ':' here` | A block-starting line needs a colon at the end |
| `I expected an indented block` | After a `:` the next line must be indented |
| `This line is indented differently` | Misaligned spaces inside a block |
| `I don't know how to start a line with 'x'` | A misspelled statement word. See the hint |
| `Ion uses 'to' instead of '='` | Write `set x to ...` |
| `I can't add/subtract/multiply/divide X and Y` | Wrong types. Convert with `number()` or `text()` |
| `I can't compare X with Y` | `<` and `>` need two numbers or two texts |
| `You can't divide by zero.` | Check the divisor |
| `This list has N items, so there is no position P` | Positions run from 0 to N-1 (or -1 for the last) |
| `'x' isn't a function` | You used brackets on something that is not a function |
| `f(a, b) needs 2 inputs but got 1` | Wrong number of inputs |
| `'stop' and 'skip' only work inside a loop` | Move them into a loop |
| `'x' keeps calling itself too deeply` | A recursive function never stops |
| `Agent 'a' needs a model` | Add `model "provider/name"` |
| `I don't know the AI provider 'x'` | Use gemini, openai, anthropic, mock or demo |
| `needs the environment variable X, but it isn't set` | Provide the key (Chapter 12) |
| `Asking 'a' failed: ...` | The AI service returned an error. The text after it explains |
| `There is already an agent, team or tool called 'x'` | Names must be unique |
| `Agents are asking each other too many levels deep` | A delegation loop. Redesign who asks whom |
| `exceeded the maximum of 25 tool-calling turns` | An agent is stuck repeating tool use |
| `I can only add to a list` | `add` needs a list on the right of `to` |
| `can use 'x', but no such tool exists` | The tool name is misspelled or not defined |

---

# Appendix D  Grammar summary

A loose map of how the language is put together.

```text
program      = statement*
block        = ":" NEWLINE INDENT statement+ DEDENT

statement    = "say" expr
             | "set" target "to" expr
             | "add" expr "to" target
             | "remove" expr "from" target
             | "if" expr block ( "otherwise" "if" expr block )* [ "otherwise" block ]
             | "repeat" expr "times" block
             | "repeat" "forever" block
             | "while" expr block
             | "for" "each" name "in" expr block
             | "stop" | "skip"
             | "to" name "(" names ")" block
             | "give" "back" [ expr ]
             | "try" block "on" "error" [ "as" name ] block
             | "use" text
             | "describe" text
             | "agent" name ":" settings
             | "team" name ":" ( "lead" name | "members" names )+
             | "tool" name "(" names ")" block
             | "chat" [ "with" ] name
             | "serve" name [ "on" [ "port" ] expr ]
             | expr

expr         = or-expr
or-expr      = and-expr ( "or" and-expr )*
and-expr     = not-expr ( "and" not-expr )*
not-expr     = "not" not-expr | comparison
comparison   = sum ( comparator sum )*
sum          = product ( ("+" | "-" | "plus" | "minus") product )*
product      = unary ( ("*" | "/" | "%" | "times" | "divided by" | "mod") unary )*
unary        = "-" unary | postfix
postfix      = primary ( "(" args ")" | "[" expr "]" | "." name )*
primary      = number | text | yes | no | nothing | name
             | "[" exprs "]" | "{" fields "}" | "(" expr ")"
             | "ask" ( name | "user" ) sum
```

---

# Appendix E  The older `ion init` syntax

The first version of Ion used braces and `==`. Those files still run:

```text
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
grant file-access 'C:/Users/me'}
```

A file is treated as the older syntax when its first line is `ion init`. Both syntaxes share the same engine, so the chat page, permissions and providers behave the same. New programs should use the syntax in this book. The older `custom` provider (your own endpoint) is available only there.

---

# Appendix F  Answers to the exercises

Try each exercise yourself first! Your answer may differ and still be right.

## Chapter 1

**Exercise 1.** `say "My name is Ada"`
**Exercise 2.** The lines print in the order they are written, top to bottom.
**Exercise 3.** In the REPL, `say "hi"` prints `hi`, and `exit` leaves.

## Chapter 2

**Exercise 1.**
```ion-run
set name to "Ada"
set number to 7
say "{name}'s favorite number is {number}"
```
```output
Ada's favorite number is 7
```

**Exercise 2.** Division gives `3.5`, and `%` gives the remainder:
```ion-run
say 7 / 2
say 7 % 2
```
```output
3.5
1
```

**Exercise 3.** The `say` line was indented, but nothing above it asks for a block. Remove the spaces:
```ion-run
set count to 1
say count
```
```output
1
```

## Chapter 3

**Exercise 1.**
```ion-run
set name to "Ada"
set age to 36
say "Hi, I'm {name} and I'm {age}."
```
```output
Hi, I'm Ada and I'm 36.
```

**Exercise 2.**
```ion-run
say """
    Roses are red,
    Violets are blue,
    Ion is easy.
    """
```
```output
Roses are red,
Violets are blue,
Ion is easy.
```

**Exercise 3.** `"5" + 3` is the text `"53"`, because adding to text joins them. `5 + 3` is the number `8`.
```ion-run
say "5" + 3
say 5 + 3
```
```output
53
8
```

**Exercise 4.** `0`, `[]` and `nothing` are false. `"0"` (non-empty text) and `[0]` (non-empty list) are true.
```ion-run
for each v in [0, "0", [], [0], nothing]:
    if v:
        say "{v} is true"
    otherwise:
        say "{v} is false"
```
```output
0 is false
0 is true
[] is false
[0] is true
nothing is false
```

## Chapter 4

**Exercise 1.**
```ion-run
say (8 + 12 + 22) / 3
```
```output
14
```

**Exercise 2.**
```ion-run
set age to 15
say age is at least 13 and age is at most 19
```
```output
yes
```

**Exercise 3.**
```ion-run
set word to "Level"
say lower(word) is "level"
```
```output
yes
```

**Exercise 4.** It prints `default`. `0` is false, so `or` gives back its second input.
```ion-run
say 0 or "default"
```
```output
default
```

## Chapter 5

**Exercise 1.**
```ion-run
set n to 7
if n % 2 is 0:
    say "even"
otherwise:
    say "odd"
```
```output
odd
```

**Exercise 2.**
```ion-run
set score to 72
if score is at least 90:
    say "A"
otherwise if score is at least 80:
    say "B"
otherwise if score is at least 70:
    say "C"
otherwise if score is at least 60:
    say "D"
otherwise:
    say "F"
```
```output
C
```

**Exercise 3.**
```ion-run
set hour to 15
if hour is less than 12:
    say "Good morning"
otherwise if hour is less than 18:
    say "Good afternoon"
otherwise:
    say "Good evening"
```
```output
Good afternoon
```

## Chapter 6

**Exercise 1.**
```ion-run
set line to ""
for each i in range(1, 11):
    set line to line + i + " "
say trim(line)
```
```output
1 2 3 4 5 6 7 8 9 10
```

**Exercise 2.**
```ion-run
set result to []
for each n in range(1, 31):
    if n % 3 is 0:
        add n to result
say result
```
```output
[3, 6, 9, 12, 15, 18, 21, 24, 27, 30]
```

**Exercise 3.**
```ion-run
set n to 1
while n is at most 1000:
    set n to n * 2
say n
```
```output
1024
```

**Exercise 4.**
```ion-run
set evens to []
for each i in range(1, 6):
    add i * 2 to evens
say evens
```
```output
[2, 4, 6, 8, 10]
```

## Chapter 7

**Exercise 1.**
```ion-run
set nums to [4, 8, 15, 16, 23]
say sum(nums)
say max(nums)
```
```output
66
23
```

**Exercise 2.**
```ion-run
set book to {title: "Dune", author: "Frank Herbert", year: 1965}
say "{book.title} was written by {book.author} in {book.year}."
```
```output
Dune was written by Frank Herbert in 1965.
```

**Exercise 3.**
```ion-run
set words to ["pear", "fig", "apple"]
say sort(words)

to long_word(w):
    give back length(w) is greater than 3

say filter(words, long_word)
```
```output
["apple", "fig", "pear"]
["pear", "apple"]
```

**Exercise 4.**
```ion-run
set text_form to to_json({a: 1, b: 2})
say text_form
say json(text_form).b
```
```output
{"a":1,"b":2}
2
```

## Chapter 8

**Exercise 1.**
```ion-run
to double(n):
    give back n * 2
say double(21)
```
```output
42
```

**Exercise 2.**
```ion-run
to biggest(numbers):
    set best to numbers[0]
    for each n in numbers:
        if n is greater than best:
            set best to n
    give back best

say biggest([3, 9, 2])
say max([3, 9, 2])
```
```output
9
9
```

**Exercise 3.**
```ion-run
to is_even(n):
    give back n % 2 is 0

say filter(range(10), is_even)
```
```output
[0, 2, 4, 6, 8]
```

**Exercise 4.**
```ion-run
to repeat_text(text, count):
    set out to ""
    repeat count times:
        set out to out + text
    give back out

say repeat_text("ab", 3)
```
```output
ababab
```

## Chapter 9

**Exercise 1.** Any typo works. For example `say totl` shows `I don't know anything called 'totl'` with the hint `Did you mean 'total'?`.

**Exercise 2.**
```ion-run
try:
    say number("12abc")
on error:
    say "That is not a number, sorry."
```
```output
That is not a number, sorry.
```

**Exercise 3.**
```ion-run
to safe_divide(a, b):
    if b is 0:
        give back nothing
    give back a / b

say safe_divide(10, 4)
say safe_divide(1, 0)
```
```output
2.5
nothing
```

## Chapter 10

**Exercise 1.**
```ion-run
say join(map(split("red green blue"), upper), ", ")
```
```output
RED, GREEN, BLUE
```

**Exercise 2.** (The result is random.)
```ion
say random(1, 6) + random(1, 6)
```

**Exercise 3.**
```ion
say "Today is " + today()
```

## Chapter 11

**Exercises 1 and 2.**
```ion-run
agent a:
    model "mock"
agent b:
    model "mock"

say ask a "What is 2+2?"
say ask b "What is 2+2?"
```
```output
mock reply: What is 2+2?
mock reply: What is 2+2?
```

**Exercise 3.**
```ion
agent poet:
    model "gemini/gemini-2.5-flash"
    role "You answer every question in a short rhyming couplet."
```

**Exercise 4.** A translator should **forget**. Each translation is independent, and old messages would only add cost.

## Chapter 12

**Exercise 1.** A fake key is rejected by the provider, so you see `Asking 'a' failed:` followed by a 400-style message about the key. That is the correct outcome.
**Exercise 2.** `key from env "MY_OWN_VARIABLE"` inside the agent.
**Exercise 3.** An inline key travels with the file. Anyone you send it to gets your key (and your bill). A `.env` file stays on your computer.

## Chapter 13

**Exercise 1.**
```ion-run
tool word_count(text):
    describe "Counts the words in some text"
    give back length(split(text))

say word_count("one two three")
```
```output
3
```

**Exercise 2.**
```ion-run
tool word_count(text):
    describe "Counts the words in some text"
    give back length(split(text))

agent counter:
    model "mock"
    can use word_count

say ask counter 'CALL word_count {"text": "a b c d"}'
```
```output
Done: 4
```

**Exercise 3.**
```ion-run
tool tip(amount, percent):
    describe "Calculates a tip for a bill amount and percentage"
    give back amount * percent / 100

say tip(80, 15)
```
```output
12
```

**Exercise 4.** For example: *"Looks up the price of a product by name. Input: the product name. Returns the price in dollars, or says it was not found."*

## Chapter 14

**Exercise 1.**
```ion-run
agent boss:
    model "mock"
agent a:
    model "mock"
agent b:
    model "mock"

team squad:
    lead boss
    members a, b

say ask squad 'CALL delegate_to_a {"task": "first"}'
say ask squad 'CALL delegate_to_b {"task": "second"}'
```
```output
Done: mock reply: first
Done: mock reply: second
```

**Exercise 2.**
```ion-run
agent first:
    model "mock"
agent second:
    model "mock"

set a to ask first "hello"
say ask second "Please improve: " + a
```
```output
mock reply: Please improve: mock reply: hello
```

**Exercise 3.**
```ion-run
agent p:
    model "mock"
agent q:
    model "mock"
agent r:
    model "mock"

for each reply in ask_all([p, q, r], "ping"):
    say reply
```
```output
mock reply: ping
mock reply: ping
mock reply: ping
```
