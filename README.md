# Ion

A programming language where AI agents are built in, written in almost plain English.

```
agent researcher:
    model "gemini/gemini-2.5-flash"
    role "You find facts and cite sources."
    can browse the web

agent writer:
    model "anthropic/claude-sonnet-5-5"
    can access files in "./reports"

team crew:
    lead writer
    members researcher

serve crew
```

`ion run crew.ion` starts a chat page for the team. The lead delegates to its members, asks before doing anything risky, and keeps conversation memory.

- **Learn it:** `guide/Ion-Guide.pdf` is the complete book (103 pages: syntax, every feature, exercises with answers). Rebuild it with `npm run guide`, which first verifies every code sample really runs. [LANGUAGE.md](LANGUAGE.md) is the 10-minute version, and `learn/` has five hands-on lessons.
- **See the chat UI:** `npm run preview` (or `ion preview`) opens a demo team that needs no API key.
- **Examples:** `examples/` (`tools-and-memory.ion` and `hello.ion` work offline with `model "mock"`).

## Commands

```
ion run <file.ion> [--yes] [--headless] [--port N]   run a script (or serve it)
ion check <file.ion>                                 find mistakes without running anything
ion repl                                             try Ion live
ion preview [file.ion]                               open the chat web UI (demo team if no file)
```

Without a global install: `npx tsx src/cli/index.ts run examples/hello.ion`. For `ion` itself, run `npm run build && npm link`.

## Layout

```
src/lang/         the language: lexer, parser, interpreter, built-ins, checker
src/runtime/      what agents run on: AI providers, abilities (grants), agent loop, web server and chat UI
src/cli/          the `ion` command
src/lexer, parser, semantic, interpreter/   the original `ion init` syntax (still supported)
tests/            npm test
```

Files starting with `ion init` use the original brace syntax (see `build-plan.md`) and keep working unchanged.
