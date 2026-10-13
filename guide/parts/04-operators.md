# 4  Operators and expressions

An **expression** is anything that produces a value: `5`, `name`, `price * 3`, `upper("hi")`. This chapter is about combining values.

## 4.1  Arithmetic

| Symbol | Words | Meaning |
|:--|:--|:--|
| `+` | `plus` | add |
| `-` | `minus` | subtract |
| `*` | `times` | multiply |
| `/` | `divided by` | divide |
| `%` | `mod` | remainder |

Use whichever style you find clearer. They mean exactly the same thing.

```ion-run
say 2 + 3 * 4
say (2 + 3) * 4
say 2 plus 3 times 4
say 10 divided by 4
say 10 minus 4
say 17 % 5
say 17 mod 5
```
```output
14
20
14
2.5
6
2
2
```

Multiplication and division happen before addition and subtraction, like in school maths. Use brackets to change the order.

Dividing by zero is an error, not a crash: `You can't divide by zero.`

## 4.2  Comparing values

Comparisons give a yes or no. Each has a plain-English form and a symbol form:

| English | Symbol |
|:--|:--|
| `is` | `==` |
| `is not` | `!=` |
| `is greater than` (or `more than`, `bigger than`) | `>` |
| `is less than` (or `fewer than`, `smaller than`) | `<` |
| `is at least` | `>=` |
| `is at most` | `<=` |

```ion-run
set n to 5
say n is 5
say n is not 5
say n is greater than 3
say n is less than 3
say n is at least 5
say n is at most 4
say n == 5
say n >= 6
```
```output
yes
no
yes
no
yes
no
yes
no
```

Rules worth knowing:

- `is` compares by **value and type**. The text `"5"` is **not** the number `5`.
- Lists and maps are equal when all their contents are equal.
- `<`, `>`, `<=`, `>=` need two numbers or two pieces of text. Comparing a number with text is an error with a helpful message.

```ion-run
say "5" is 5
say [1, 2] is [1, 2]
say {a: 1} is {a: 1}
say "apple" is less than "banana"
```
```output
no
yes
yes
yes
```

## 4.3  Looking inside things

| Form | Meaning |
|:--|:--|
| `x contains y` | text contains text; list has item; map has key |
| `x does not contain y` | the opposite |
| `y is in x` | same as `x contains y`, reading the other way |
| `x starts with y` | text starts with text |
| `x ends with y` | text ends with text |

```ion-run
say "hello world" contains "world"
say [1, 2, 3] contains 2
say {name: "Ada"} contains "name"
say 4 is in [1, 2, 3]
say [1, 2] does not contain 9
say "report.pdf" ends with ".pdf"
say "Dr. Who" starts with "Dr"
```
```output
yes
yes
yes
no
yes
yes
yes
```

## 4.4  And, or, not

Combine yes/no values with `and`, `or`, `not`:

```ion-run
set age to 30
set member to yes
say age is at least 18 and member
say age is less than 18 or member
say not member
```
```output
yes
yes
no
```

`and` and `or` stop early: `a and b` does not look at `b` if `a` is false. They also **return one of their inputs** rather than only yes or no, which gives you a neat way to supply a default:

```ion-run
set nickname to ""
say nickname or "friend"
set other to "Sam"
say other or "friend"
```
```output
friend
Sam
```

## 4.5  Operator order (precedence)

From **tightest** to **loosest**:

| Level | Operators |
|:-:|:--|
| 1 | calls `f(x)`, positions `x[0]`, fields `x.name` |
| 2 | negative sign `-x` |
| 3 | `*  /  %  times  divided by  mod` |
| 4 | `+  -  plus  minus` |
| 5 | comparisons: `is`, `is not`, `<`, `contains`, `starts with` ... |
| 6 | `not` |
| 7 | `and` |
| 8 | `or` |

When in doubt, add brackets. They cost nothing and make your intent obvious.

## 4.6  Adding lists

`+` joins two lists into a new one:

```ion-run
say [1, 2] + [3]
```
```output
[1, 2, 3]
```

## 4.7  Exercises

1. Compute the average of 8, 12 and 22 in one expression.
2. Write an expression that is `yes` only if `age` is between 13 and 19, inclusive.
3. Given `set word to "Level"`, print whether `lower(word)` equals `"level"`.
4. What does `say 0 or "default"` print? Why?
