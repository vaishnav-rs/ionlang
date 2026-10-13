# 3  Values: text, numbers, and more

Every piece of data in Ion is a **value**, and every value has a **type**. There are six everyday types:

| Type | Examples | `type_of` says |
|:--|:--|:--|
| Text | `"hello"`, `'hi'` | `text` |
| Number | `42`, `3.14`, `-7` | `number` |
| Yes/no | `yes`, `no`, `true`, `false` | `yes/no` |
| Nothing | `nothing` | `nothing` |
| List | `[1, 2, 3]` | `list` |
| Map | `{name: "Ada"}` | `map` |

Lists and maps get their own chapter (Chapter 7). This chapter covers the rest.

## 3.1  Text

Write text in double quotes or single quotes. They are identical, so pick whichever lets you include the other kind of quote easily:

```ion-run
say "It's easy"
say 'She said "hi"'
```
```output
It's easy
She said "hi"
```

### Escapes

A backslash `\` inside text writes a special character:

| Write | Get |
|:--|:--|
| `\n` | a new line |
| `\t` | a tab |
| `\"` | a double quote |
| `\'` | a single quote |
| `\\` | a backslash |
| `\{` | a literal `{` |

```ion-run
say "line one\nline two"
say "a\tb"
say "She said \"hi\""
```
```output
line one
line two
a	b
She said "hi"
```

### Interpolation

`{expression}` inside text is replaced by the expression's value. Any expression works: variables, arithmetic, function calls, even `ask`.

```ion-run
set price to 4
say "{price} apples cost {price * 3} coins"
say "shouting: {upper("hi")}"
```
```output
4 apples cost 12 coins
shouting: HI
```

> **Note.** A `{` only starts an interpolation when a **letter or underscore** follows it immediately. So JSON such as `{"a": 1}` or `{ 1 }` stays exactly as written. That matters when you ask AI to reply in JSON. To force a literal brace before a letter, write `\{`.

```ion-run
say 'Reply like {"name": "Ada"}'
say "Literal: \{name}"
```
```output
Reply like {"name": "Ada"}
Literal: {name}
```

### Multi-line text

Three quotes in a row start a text that can span many lines. This is perfect for long AI instructions. Ion removes the shared indentation and the blank first and last lines:

```ion-run
set topic to "cats"
say """
    You are a poet.
    Write about {topic}.
      (indented lines stay indented)
    """
```
```output
You are a poet.
Write about cats.
  (indented lines stay indented)
```

### Joining and measuring text

Join text with `+`. Anything added to text is converted to text first.

```ion-run
say "Total: " + 5
say "a" + "b" + "c"
say length("hello")
say "hello"[0]
say upper("abc") + lower("DEF")
```
```output
Total: 5
abc
5
h
ABCdef
```

## 3.2  Numbers

Numbers are written the way you expect. There is one kind of number, with or without a decimal point. Negative numbers use a minus sign.

```ion-run
say 10
say 2.5
say -3
say 0.1 + 0.2
say 1 / 4
```
```output
10
2.5
-3
0.3
0.25
```

Whole numbers print without `.0`, and long decimals are rounded to ten places, so `0.1 + 0.2` prints a tidy `0.3`.

Turn text into a number with `number(...)`. If the text is not a number, you get a clear error rather than a surprise:

```ion-run
say number("42") + 1
say number(" 3.5 ") * 2
```
```output
43
7
```

## 3.3  Yes and no

The two yes/no values can be written `yes` and `no`, or `true` and `false`. They are interchangeable. Ion prints them as `yes` and `no`.

```ion-run
set ready to yes
say ready
say 5 is greater than 3
say 5 is less than 3
```
```output
yes
yes
no
```

## 3.4  Nothing

`nothing` means "no value". Many things give you `nothing` when there is no answer: a missing map field, `first([])`, or `ask user` when input has ended.

```ion-run
set person to {name: "Ada"}
say person.age
say first([])
say type_of(nothing)
```
```output
nothing
nothing
nothing
```

## 3.5  Truthiness: what counts as "yes"

Anywhere Ion needs a yes/no (in an `if`, a `while`, `and`, `or`, `not`), other values are converted. These are **false**:

- `no` / `false`
- `nothing`
- the number `0`
- empty text `""`
- an empty list `[]` and an empty map `{}`

**Everything else is true**, including the text `"no"` and the number `-1`. This lets you write natural checks:

```ion-run
set name to ""
if name:
    say "have a name"
otherwise:
    say "no name yet"
if [1, 2]:
    say "list has items"
```
```output
no name yet
list has items
```

## 3.6  Converting between types

| Function | Does | Example |
|:--|:--|:--|
| `text(x)` | any value to text | `text(5)` is `"5"` |
| `number(x)` | text to number | `number("7")` is `7` |
| `type_of(x)` | names the type | `type_of([])` is `"list"` |

```ion-run
say type_of("hi")
say type_of(5)
say type_of(yes)
say type_of([1])
say type_of({a: 1})
say text(3) + text(4)
```
```output
text
number
yes/no
list
map
34
```

## 3.7  Exercises

1. Print a sentence that contains your name and your age inside one piece of text.
2. Write a multi-line text with three lines and print it.
3. What is `"5" + 3`? What is `5 + 3`? Why do they differ?
4. Which of these are false in an `if`: `0`, `"0"`, `[]`, `[0]`, `nothing`?
