# 1  Welcome and setup

## 1.1  What is Ion?

Ion is a programming language built for one job: **making AI agents**. It reads almost like English, so you can describe what you want and let the AI do the thinking.

Here is a complete Ion program. Even if you have never programmed, you can probably guess what it does:

```ion
agent buddy:
    model "mock"
    role "You are a friendly assistant."

say ask buddy "Hello there!"
```

It creates an agent called `buddy`, gives it a personality, asks it a question, and prints the answer. That is the heart of Ion. Everything else in this book is either:

- **ordinary programming**, such as variables, decisions, loops and functions, so you can control *what* you ask and *what you do with the answers*; or
- **agent features**, such as abilities, tools, teams, and a ready-made chat web page, so your agents can *do things* and *work together*.

## 1.2  How this book works

The book moves from simple to advanced. If you are new to programming, read Chapters 2 to 9 in order and type the examples yourself. If you already program, skim Chapters 2 to 10 and start properly at Chapter 11.

Throughout the book you will see these boxes:

> **Try it.** Something to type and run yourself. Learning happens in your fingers.

> **Tip.** A shortcut or a good habit.

> **Warning.** Something that can bite you, or cost you money, or run something on your computer.

> **Note.** Extra detail you can skip on a first read.

Code samples that show their output were **actually run** when this book was built. The output you see is the output you will get. At the end of each chapter there are exercises, and **Appendix F has worked answers**.

## 1.3  What you need

- A computer with **Node.js 20 or newer** (check with `node --version`).
- The Ion project folder (the one containing this book).
- A text editor. Any editor works; Ion files end in `.ion`.
- *Later*, for real AI models: an API key from Google (Gemini), OpenAI, or Anthropic. **You do not need one for most of this book.** A built-in fake AI called `mock` lets you learn everything offline for free.

## 1.4  Installing

Open a terminal in the Ion folder and run:

```text
npm install
```

You can now run Ion with:

```text
npx tsx src/cli/index.ts run hello.ion
```

That is long to type. To get a short `ion` command, build once and link it:

```text
npm run build
npm link
```

After that you can type:

```text
ion run hello.ion
```

> **Note.** This book writes commands as `ion run ...`. If you have not run `npm link`, type `npx tsx src/cli/index.ts` wherever you see `ion`.

## 1.5  Your first program

Create a file called `hello.ion` with this content:

```ion-run
say "Hello, world!"
```
```output
Hello, world!
```

Run it with `ion run hello.ion`. That is a complete program: one line, one `say`.

## 1.6  The four commands you will use

| Command | What it does |
|:--|:--|
| `ion run file.ion` | Runs your program. |
| `ion check file.ion` | Finds mistakes **without running anything** (free, instant, no AI calls). |
| `ion repl` | An interactive prompt: type a line, see the result immediately. |
| `ion preview` | Opens the chat web page with a built-in demo team. No key needed. |

Chapter 18 covers every option.

> **Try it.** Run `ion preview` now. A chat page opens. Type `work`, then `permission`, then `markdown`. This is the interface your own agents will get automatically. Press Ctrl+C in the terminal to stop it.

## 1.7  Exercises

1. Make `hello.ion` print your own name.
2. Add a second `say` line. In what order do the lines print?
3. Run `ion repl`, type `say "hi"`, and press Enter. Then type `exit`.
