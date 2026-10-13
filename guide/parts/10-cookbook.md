# 19  Cookbook: complete programs

Ready-to-adapt programs. Recipes that use a real model say so. Change the `model` line to the provider you have a key for.

## 19.1  A study buddy

A chat loop you control yourself, so you can add your own logic around each message:

```ion
agent tutor:
    model "gemini/gemini-2.5-flash"
    role "You are a patient tutor. Explain simply, with one short example."

say "Ask me anything. Type quit to stop."
repeat forever:
    set question to ask user "You:"
    if question is nothing or question is "quit":
        stop
    say "Tutor: " + ask tutor question
```

> **Tip.** For a plain chat you can just write `chat with tutor`. Use a loop like this when you want to do something to each message, such as logging it or checking for special commands.

## 19.2  Summarize a file

```ion
agent reader:
    model "gemini/gemini-2.5-flash"
    role "You summarize documents in three bullet points."
    can access files in "./documents"

say ask reader "Read notes.txt and summarize it."
```

The agent reads `./documents/notes.txt` by itself, asking your permission the first time. It cannot read anything outside `./documents`.

## 19.3  Turn messy text into data

Ask for JSON, then use the result like any map:

```ion
agent extractor:
    model "openai/gpt-4o-mini"
    role "You extract facts. Reply with JSON only."
    forgets between asks

set raw to ask extractor 'From "Ada Lovelace wrote the first program in 1843", reply as {"name": "...", "year": 0}'
set data to json(raw)
say "{data.name} did it in {data.year}"
```

`json()` copes with code fences and extra chatter around the data.

## 19.4  An offline customer-support bot with a tool

Runs with the mock AI so you can see the whole flow for free. Swap `"mock"` for a real model and let the AI decide when to look up an order:

```ion-run
set orders to {
    A100: "shipped on Monday",
    A101: "out for delivery",
    A102: "being packed"
}

tool order_status(order_id):
    describe "Looks up the status of an order by its id, like A100"
    set found to orders[order_id]
    if found is nothing:
        give back "No order with id " + order_id
    give back found

agent support:
    model "mock"
    role "You are a friendly support agent. Use order_status to answer questions about orders."
    can use order_status

say ask support 'CALL order_status {"order_id": "A101"}'
say ask support 'CALL order_status {"order_id": "Z999"}'
```
```output
Done: out for delivery
Done: No order with id Z999
```

## 19.5  Compare several AIs

```ion
agent gemini_a:
    model "gemini/gemini-2.5-flash"
agent openai_a:
    model "openai/gpt-4o-mini"
agent claude_a:
    model "anthropic/claude-sonnet-5"

set names to ["Gemini", "OpenAI", "Claude"]
set answers to ask_all([gemini_a, openai_a, claude_a], "In one sentence: what is a black hole?")
for each i in range(3):
    say "{names[i]}: {answers[i]}"
```

All three are asked **simultaneously**.

## 19.6  A research team with a web page

```ion
agent lead:
    model "gemini/gemini-2.5-flash"
    role "You coordinate. Send research to the researcher, then ask the writer to save a short report."
    input text, voice

agent researcher:
    model "gemini/gemini-2.5-flash"
    role "Find facts on the web. Always include the URLs you used."
    can browse the web

agent writer:
    model "gemini/gemini-2.5-flash"
    role "Turn research notes into a clear one-page report and save it as a file."
    can access files in "./reports"

team crew:
    lead lead
    members researcher, writer

serve crew
```

Run it, open the page, and ask: *"Research the history of the bicycle and save a report."* Watch the timeline show the hand-offs, then approve the web and file permissions as they appear.

## 19.7  Retry when a service is busy

```ion
set answer to nothing
set attempts to 0
while answer is nothing and attempts is less than 3:
    set attempts to attempts + 1
    try:
        set answer to ask helper "Summarize the news"
    on error:
        say "Attempt {attempts} failed: {error}"
        sleep(2)
if answer is nothing:
    say "Gave up after {attempts} tries"
otherwise:
    say answer
```

## 19.8  Remember things between runs

Agents forget when the program ends. To keep something, write it to a file and read it back:

```ion
set notes to ""
try:
    set notes to read_file("notes.txt")
on error:
    say "(first run, no notes yet)"

agent buddy:
    model "gemini/gemini-2.5-flash"
    role "You are a helpful assistant. What you know about the user so far: {notes}"

set name to ask user "Tell me something about yourself:"
write_file("notes.txt", notes + "\n" + name)
say ask buddy "Reply to this in one friendly sentence: " + name
```

## 19.9  Process a list of items

```ion
agent summarizer:
    model "openai/gpt-4o-mini"
    role "Summarize the text in one short sentence."
    forgets between asks

set articles to [
    "Ion is a language for building AI agents in plain English.",
    "Agents can browse the web, read files, and work together in teams."
]

set summaries to []
for each article in articles:
    try:
        add ask summarizer article to summaries
    on error:
        add "(failed: {error})" to summaries

write_file("digest.txt", join(summaries, "\n"))
say "Saved {length(summaries)} summaries to digest.txt"
```

## 19.10  Using an agent inside your own function

```ion-run
agent translator:
    model "mock"
    forgets between asks

to translate(text, language):
    give back ask translator "Translate to {language}: {text}"

say translate("good morning", "French")
say translate("thank you", "Spanish")
```
```output
mock reply: Translate to French: good morning
mock reply: Translate to Spanish: thank you
```

Wrapping asks in functions keeps your program tidy and lets you reuse them.

---

# 20  Debugging and FAQ

## 20.1  A checklist when something is wrong

1. **Read the error.** The line number and hint usually tell you everything.
2. Run **`ion check`**. It catches misspelled names and missing pieces.
3. Run with **`model "mock"`**. If the logic works with the mock, the problem is with the real AI or your key, not your program.
4. **`say` things** to see what values really are. `say type_of(x)` is a great way to find "number vs text" confusion.
5. Use **`ion repl`** to test a small piece in isolation.

## 20.2  Common mistakes

| Symptom | Cause and fix |
|:--|:--|
| `I expected ':'` | A line that starts a block (`if`, `for each`, `agent`...) is missing its colon |
| `This line is indented differently...` | Inconsistent spaces inside a block |
| `I don't know anything called 'x'` | Typo, or you used a variable before `set`-ting it. The hint suggests the closest name |
| `Ion uses 'to' instead of '='` | Write `set x to 5`, not `set x = 5` |
| `I can't subtract text and number` | One value is text. Convert with `number(...)` |
| `5` and `"5"` are not equal | One is a number, one is text |
| `I expected 'times'` | `repeat` needs `repeat 3 times:` |
| A function changes a variable unexpectedly | `set` updates an existing outer variable (Section 8.4). Rename it |
| My JSON text prints a stray `{` | A `{` followed by a letter starts an interpolation. Write `\{` |
| `positions start at 0` error | Lists count from 0. The last item is `-1` |
| Agent never uses my tool | Improve the tool's `describe` line and the agent's `role`. Check the agent has `can use` |
| `Error: ... was denied` | You answered `n` to a permission prompt (or ran over HTTP without `--yes`) |
| `EADDRINUSE` when serving | The port is busy. Use `serve x on port 5000` |
| Web browsing says a browser is missing | Run `npx playwright install chromium` once |

## 20.3  FAQ

**Is Ion free?** Ion is. Real AI models charge you per use (the `mock` and `demo` models are free).

**Where does my data go?** Only to the AI provider you choose for each agent, and to any web pages your agents or functions fetch. Nothing goes to Ion's authors, because there is no Ion server.

**Can agents remember across runs?** Not automatically. Save to a file and read it back (Recipe 19.8).

**Can I use a model that runs on my own computer?** Not in the newer syntax yet. The older `ion init` syntax has a `custom` provider with an endpoint.

**Can two agents talk to each other?** Yes: `can ask`, teams, or a script that passes replies along (Chapter 14).

**Can I run Ion programs on a schedule?** Yes. `ion run file.ion` is just a command, so Windows Task Scheduler, cron, or CI can run it. Remember to supply keys through environment variables, and be careful with `--yes`.

**How do I stop a running program?** Press Ctrl+C.

**What does "tool-calling turns" in an error mean?** An agent used tools more than 25 times for a single message, which usually means it is stuck in a loop. Check your tool's `describe` and the agent's `role`.

**Is `can run commands` safe?** Only as safe as the agent and your attention. Read each command before you allow it. Give this ability to as few agents as possible.

## 20.4  Where to go from here

You now know the whole language. To grow:

1. Re-do the exercises you skipped (answers in Appendix F).
2. Build something small and useful for yourself: a file summarizer, a daily digest, a study buddy.
3. Add a tool that connects to a service you use.
4. Turn it into a team, and `serve` it.
5. Share your program (with the key moved to `.env`!).

Happy building.
