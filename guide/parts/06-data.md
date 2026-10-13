# 7  Lists and maps

## 7.1  Lists

A **list** holds many values in order. Write it with square brackets:

```ion-run
set fruits to ["apple", "pear", "plum"]
say fruits
say length(fruits)
say fruits.length
```
```output
["apple", "pear", "plum"]
3
3
```

A list can hold anything, including other lists:

```ion-run
set grid to [[1, 2], [3, 4]]
say grid[1][0]
```
```output
3
```

### Positions start at 0

The first item is at position **0**, the second at 1, and so on. A negative position counts from the end, so `-1` is the last item.

```ion-run
set xs to [10, 20, 30]
say xs[0]
say xs[2]
say xs[-1]
```
```output
10
30
30
```

Asking for a position that does not exist is an error that tells you how many items there are.

### Changing a list

```ion-run
set xs to [10, 20]
add 30 to xs
say xs
remove 10 from xs
say xs
set xs[0] to 99
say xs
```
```output
[10, 20, 30]
[20, 30]
[99, 30]
```

- `add value to list` puts the value at the **end**.
- `remove value from list` removes the **first** matching item (nothing happens if there is none).
- `set list[position] to value` replaces an existing item.

### Slices, sorting and friends

```ion-run
set xs to [5, 3, 9, 1]
say sort(xs)
say reverse(xs)
say first(xs)
say last(xs)
say slice(xs, 1, 3)
say unique([1, 1, 2, 2, 3])
say sum(xs)
say max(xs)
say min(xs)
```
```output
[1, 3, 5, 9]
[1, 9, 3, 5]
5
1
[3, 9]
[1, 2, 3]
18
9
1
```

`sort`, `reverse`, `slice` and `unique` **return a new list** and leave the original alone.

### Turning lists into text and back

```ion-run
say join(["a", "b", "c"], "-")
say join([1, 2, 3])
say split("one two  three")
say split("a,b,c", ",")
```
```output
a-b-c
1, 2, 3
["one", "two", "three"]
["a", "b", "c"]
```

### Transforming lists with `map` and `filter`

Functions (Chapter 8) are values you can hand to other functions. `map` applies a function to every item and `filter` keeps the items for which the function says yes.

```ion-run
to double(x):
    give back x * 2

to is_big(x):
    give back x is greater than 2

say map([1, 2, 3], double)
say filter([1, 2, 3, 4], is_big)
```
```output
[2, 4, 6]
[3, 4]
```

## 7.2  Maps

A **map** stores values under names (called **keys**), like a form with labelled fields:

```ion-run
set person to {name: "Ada", age: 36}
say person.name
say person["age"]
say keys(person)
say values(person)
say length(person)
```
```output
Ada
36
["name", "age"]
["Ada", 36]
2
```

Keys that are not plain words can be written as text: `{"full name": "Ada Lovelace"}`, and read with `person["full name"]`.

### Changing a map

```ion-run
set person to {name: "Ada"}
set person.age to 36
set person["city"] to "London"
say person
remove "city" from person
say person
say person contains "age"
```
```output
{"name":"Ada","age":36,"city":"London"}
{"name":"Ada","age":36}
yes
```

Reading a key that does not exist gives `nothing` (not an error), so you can check for it with `is nothing`.

### Maps inside lists inside maps

Real data is nested. Read it by chaining:

```ion-run
set club to {
    name: "Rockets",
    members: [
        {name: "Ada", role: "lead"},
        {name: "Sam", role: "writer"}
    ]
}
say club.members[1].name
for each m in club.members:
    say "{m.name} is the {m.role}"
```
```output
Sam
Ada is the lead
Sam is the writer
```

## 7.3  JSON

AI models often answer in JSON, which is a common text format for data. Ion reads and writes it:

```ion-run
set data to json('{"name": "Ada", "scores": [90, 85]}')
say data.name
say data.scores[1]
say to_json({city: "London", year: 1843})
```
```output
Ada
85
{"city":"London","year":1843}
```

`json(text)` is forgiving: if a model wraps its JSON in a code fence or adds a sentence before it, `json` still finds the data. `to_json(value, yes)` prints it indented.

## 7.4  Exercises

1. Make a list of five numbers and print their sum and the biggest one.
2. Make a map describing a book (title, author, year) and print a sentence from it.
3. Given `set words to ["pear", "fig", "apple"]`, print them sorted, then print only the words longer than 3 letters (hint: write a function and use `filter`).
4. Turn `{a: 1, b: 2}` into JSON text and back.

---

# 8  Functions

A **function** is a named, reusable piece of code. You write it once and use it many times.

## 8.1  Defining and calling

Start with `to`, then the name, then the inputs in brackets. Use `give back` to return a result:

```ion-run
to greet(name):
    give back "Hello, " + name + "!"

say greet("Ada")
say greet("Sam")
```
```output
Hello, Ada!
Hello, Sam!
```

Call a function by writing its name and brackets. Always use brackets when calling, even with no inputs: `now()`.

## 8.2  Several inputs, or none

```ion-run
to area(width, height):
    give back width * height

to hello():
    say "hi from a function"

say area(3, 4)
hello()
```
```output
12
hi from a function
```

Giving the wrong number of inputs is an error that spells out what the function expects. A function that never uses `give back` gives back `nothing`.

## 8.3  Functions can call themselves

This is called **recursion**. Every recursive function needs a way to stop:

```ion-run
to factorial(n):
    if n is at most 1:
        give back 1
    give back n * factorial(n - 1)

say factorial(5)
```
```output
120
```

If a function keeps calling itself forever, Ion stops it with a clear message after 200 levels.

## 8.4  Where variables live (scope)

Inputs and variables created inside a function exist only inside it. But watch this rule:

> **`set` changes an existing variable if one with that name already exists *anywhere visible*. Otherwise it creates a new one.**

```ion-run
set count to 10

to bump():
    set count to count + 1

bump()
bump()
say count
```
```output
12
```

The function changed the outer `count`, because one already existed. That is useful for counters, but a surprise if you did not intend it. Use distinctive names for temporary variables inside functions.

## 8.5  Functions are values

You can pass a function to `map` and `filter` by name (no brackets), and store it in a variable:

```ion-run
to shout(text):
    give back upper(text) + "!"

say map(["hi", "bye"], shout)
set f to shout
say f("ok")
```
```output
["HI!", "BYE!"]
OK!
```

## 8.6  Describing a function

A function's first line may be a `describe` statement. It does nothing when the function runs, but it documents the function. For **tools** (Chapter 13) it is how you tell the AI what the tool is for.

```ion-run
to celsius(f):
    describe "Converts Fahrenheit to Celsius"
    give back round((f - 32) * 5 / 9, 1)

say celsius(212)
say celsius(98.6)
```
```output
100
37
```

## 8.7  Exercises

1. Write `to double(n)` and use it on 21.
2. Write `to biggest(numbers)` that finds the largest number with a loop. Compare with `max`.
3. Write `to is_even(n)` that gives back yes or no, then use it with `filter` on `range(10)`.
4. Write `to repeat_text(text, count)` that gives back the text repeated `count` times.

---

# 9  When things go wrong

## 9.1  Reading an error message

Ion's errors are written for people. They tell you the file, the line, the problem, and often a fix:

```ion-run
set total to 1
say totl
```
```error
script.ion:2: I don't know anything called 'totl'.
    say totl
  hint: Did you mean 'total'?
```

Always read the **line number** first, then the message, then the hint.

## 9.2  Catching errors with `try`

Some things fail for reasons you cannot control: a web page is down, an AI service is busy, a file is missing. Wrap the risky part in `try` and say what to do in `on error`:

```ion-run
try:
    say 10 / 0
on error:
    say "Something went wrong: {error}"
say "the program keeps going"
```
```output
Something went wrong: You can't divide by zero.
the program keeps going
```

Inside `on error`, the variable `error` holds the message. Choose another name with `as`:

```ion-run
try:
    say number("abc")
on error as problem:
    say "Bad number: {problem}"
```
```output
Bad number: I can't turn "abc" into a number.
```

`try` catches every runtime failure, including AI and network errors. Use it around anything that talks to the outside world (Chapter 20 shows a retry pattern).

## 9.3  Stopping early

An uncaught error stops the program and prints the message. The exit status of `ion run` is then non-zero, which is handy in scripts.

## 9.4  Checking before you run

`ion check file.ion` reads your program without running it and reports mistakes that do not need the program to run: unknown agents, tools, models, team members, misspelled settings. It is free and instant. Make a habit of running it.

## 9.5  Exercises

1. Write a program with a deliberate typo. Read the error. Then run `ion check` on it.
2. Wrap `number("12abc")` in `try` and print a friendly message.
3. Write a function `safe_divide(a, b)` that gives back `nothing` instead of failing when `b` is 0.
