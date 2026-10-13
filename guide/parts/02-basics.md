# 2  The shape of an Ion program

## 2.1  Programs run top to bottom

An Ion program is a list of **statements**, one per line. Ion runs them in order, from the first line to the last.

```ion-run
say "first"
say "second"
say "third"
```
```output
first
second
third
```

## 2.2  Comments

A `#` starts a comment. Ion ignores everything from the `#` to the end of the line. Use comments to explain *why* you did something.

```ion-run
# This whole line is a comment
say "hello"   # and this part is too
```
```output
hello
```

## 2.3  Blocks and indentation

Some statements contain other statements. The container line **ends with a colon**, and the lines inside it are **indented** (moved right) by four spaces:

```ion-run
repeat 2 times:
    say "inside the block"
    say "still inside"
say "outside again"
```
```output
inside the block
still inside
inside the block
still inside
outside again
```

The rules are simple:

- The line before a block ends with `:`.
- Every line in the block is indented the **same amount**. Four spaces is the standard.
- A line that is indented *less* ends the block.
- Use spaces, not tabs. (A tab counts as four spaces, but mixing them causes confusion.)

> **Tip.** If Ion says "This line is indented differently from the lines above it", some line in a block has a different number of spaces. Align them.

## 2.4  Names

Variables, functions, agents and tools all have **names**. A name:

- starts with a letter or an underscore;
- continues with letters, digits, or underscores;
- is case sensitive, so `Name` and `name` are different;
- cannot be one of Ion's **reserved words** (listed in Appendix B), such as `say`, `if`, `agent`.

Good names describe the thing: `total_price`, `research_agent`, `user_name`.

## 2.5  Line breaks

Normally one statement is one line. But inside brackets `( )`, `[ ]` and `{ }`, Ion ignores line breaks, so you can spread long lists out:

```ion-run
set colors to [
    "red",
    "green",
    "blue"
]
say length(colors)
```
```output
3
```

## 2.6  The `say` statement

`say` prints a value. It shows text without quotes, numbers without extra zeros, and so on:

```ion-run
say "words"
say 42
say 3.5
say yes
say [1, 2, 3]
```
```output
words
42
3.5
yes
[1, 2, 3]
```

## 2.7  Variables with `set`

A **variable** is a name that holds a value. Create or change one with `set ... to ...`:

```ion-run
set name to "Ada"
set age to 36
say name
say age
set age to age + 1
say age
```
```output
Ada
36
37
```

The same `set` statement creates a variable the first time and changes it afterwards. There is no separate "declare" step.

> **Note.** Ion uses the word `to`, never `=`. If you write `set x = 5`, Ion tells you to use `to`.

## 2.8  Putting values inside text

Put any expression inside `{ }` in a piece of text and Ion substitutes its value. This is called **interpolation**, and you will use it constantly, especially to build prompts for AI agents.

```ion-run
set name to "Ada"
set age to 36
say "Hello, {name}! In 10 years you will be {age + 10}."
```
```output
Hello, Ada! In 10 years you will be 46.
```

## 2.9  Trying things live: the REPL

`ion repl` gives you a prompt. Type one statement and it runs at once. A bare expression prints its value, which makes the REPL a great calculator and a great way to learn:

```text
ion> set x to 4
ion> x * 2
8
ion> upper("hello")
HELLO
```

To type a block, end the first line with `:` and finish with an empty line.

## 2.10  Exercises

1. Create variables for your name and favorite number, then print a sentence using both.
2. What does `say 7 / 2` print? What about `say 7 % 2`? Find out in the REPL.
3. Why does this fail? Fix it.

```ion-bad
set count to 1
  say count
```
