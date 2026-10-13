# 5  Making decisions

## 5.1  `if`

An `if` runs its block only when the condition is true:

```ion-run
set temperature to 31
if temperature is greater than 30:
    say "It's hot"
say "done"
```
```output
It's hot
done
```

## 5.2  `otherwise`

Add `otherwise:` for what to do when the condition is false. You can chain extra conditions with `otherwise if`. (The word `else` also works, if you prefer it.)

```ion-run
set score to 85
if score is at least 90:
    say "A"
otherwise if score is at least 80:
    say "B"
otherwise if score is at least 70:
    say "C"
otherwise:
    say "Keep trying"
```
```output
B
```

Ion checks the conditions from top to bottom and runs the **first** one that is true, then skips the rest.

## 5.3  Combining conditions

Use `and`, `or` and `not` (Section 4.4):

```ion-run
set age to 25
set has_ticket to yes
if age is at least 18 and has_ticket:
    say "Enter"
otherwise:
    say "Sorry"
```
```output
Enter
```

## 5.4  Checking for empty things

Because of truthiness (Section 3.5), you can test directly:

```ion-run
set items to []
if not items:
    say "nothing in the list"
add "pen" to items
if items:
    say "now we have {length(items)}"
```
```output
nothing in the list
now we have 1
```

## 5.5  Checking for `nothing`

Compare with `nothing` using `is`:

```ion-run
set person to {name: "Ada"}
if person.phone is nothing:
    say "no phone number"
```
```output
no phone number
```

## 5.6  Exercises

1. Print `"even"` or `"odd"` for a number `n` (hint: `n % 2`).
2. Convert a score to a letter grade A to F with `otherwise if`.
3. Print a greeting that depends on an `hour` variable: morning (before 12), afternoon (before 18), otherwise evening.

---

# 6  Repeating things

## 6.1  `repeat N times`

```ion-run
repeat 3 times:
    say "hip hip hooray"
```
```output
hip hip hooray
hip hip hooray
hip hip hooray
```

## 6.2  `for each`

Go through the items of a list one at a time:

```ion-run
for each fruit in ["apple", "pear", "plum"]:
    say "I like {fruit}"
```
```output
I like apple
I like pear
I like plum
```

`for each` also works on **text** (each character) and on **maps** (each key):

```ion-run
for each letter in "abc":
    say letter
for each key in {x: 1, y: 2}:
    say key
```
```output
a
b
c
x
y
```

To count, use `range`. `range(5)` is `[0, 1, 2, 3, 4]` and `range(2, 5)` is `[2, 3, 4]`:

```ion-run
for each i in range(1, 4):
    say "Step {i}"
```
```output
Step 1
Step 2
Step 3
```

## 6.3  `while`

Repeats as long as a condition stays true:

```ion-run
set n to 1
while n is less than 100:
    set n to n * 2
say n
```
```output
128
```

> **Warning.** If the condition never becomes false, the loop never ends. Make sure something inside the loop changes it. Press **Ctrl+C** in the terminal to stop a runaway program.

## 6.4  `repeat forever` and `stop`

`stop` leaves the loop immediately. Use it with `repeat forever` when you do not know in advance how many rounds you need:

```ion-run
set total to 0
set n to 1
repeat forever:
    set total to total + n
    if total is greater than 20:
        stop
    set n to n + 1
say "stopped at n={n}, total={total}"
```
```output
stopped at n=6, total=21
```

## 6.5  `skip`

`skip` jumps straight to the next round of the loop:

```ion-run
for each n in range(1, 8):
    if n % 2 is 0:
        skip
    say n
```
```output
1
3
5
7
```

`stop` and `skip` only make sense inside a loop. Anywhere else, Ion tells you so.

## 6.6  A pattern: summing and collecting

Loops often build up a result. Start with an empty value, then update it each round:

```ion-run
set squares to []
for each n in range(1, 6):
    add n * n to squares
say squares

set total to 0
for each s in squares:
    set total to total + s
say total
```
```output
[1, 4, 9, 16, 25]
55
```

## 6.7  Exercises

1. Print the numbers 1 to 10 with `for each` and `range`.
2. Print only the multiples of 3 up to 30.
3. Use `while` to find the first power of 2 above 1000.
4. Build a list of the first five even numbers.
