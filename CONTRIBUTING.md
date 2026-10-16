# Contributing to Ion

Thank you for helping make Ion better. This guide covers how to set up, what to check before you send a change, and how language changes are decided.

## Setting up

You need Node.js 20 or newer.

```
npm install
npm test          # runs every test (should all pass)
npm run build     # compiles to dist/, which the `ion` command uses
npx tsx src/cli/index.ts run examples/hello.ion
```

The VS Code extension lives in `editors/vscode`. Build it with `npm run compile` in that folder.

## Before you send a change

1. `npm test` passes.
2. `npx tsc --noEmit -p tsconfig.json` is clean.
3. New behavior has a test. Bug fixes get a test that fails without the fix.
4. If you change how Ion works for a script's author, update [SPEC.md](SPEC.md) and, if it helps beginners, [LANGUAGE.md](LANGUAGE.md).
5. Keep the change focused. Several small pull requests are easier to review than one large one.

## Language changes

Ion is a language people write programs in, so changes to it are held to a stricter standard than changes to the tools.

- **Additions** (a new built-in, a new setting, a new keyword that only acts in a new position) are welcome. They need a test and a line in SPEC.md.
- **Changes that could break an existing script** are not made in a normal change. Open an issue first. Such changes wait for a new language version and need a deprecation period, as described in SPEC.md, section 16.
- **Error messages** should say what went wrong in plain English and, where possible, how to fix it. A hint is worth a sentence.
- **New keywords** are a last resort. Prefer a setting, a built-in, or a word that is already reserved.

## Security-sensitive changes

Changes to permissions (grants), secret handling, the audit log, or the web server are reviewed with extra care. Please also read [SECURITY.md](SECURITY.md). Report vulnerabilities privately, not in a public issue.

## Commit messages and pull requests

- Write the commit message in the imperative mood: "Add ion fmt", not "Added ion fmt".
- Explain *why* in the body when the reason is not obvious from the diff.
- Fill in the pull request template. It asks what changed, how you tested it, and whether it changes the language.

## Code style

- Match the code around your change: naming, comment density, and idiom.
- Comments explain *why*, not what the code plainly does.
- No new dependency without a reason in the pull request. Every dependency is something users install.

## Licensing

Ion is licensed under the [Apache License 2.0](LICENSE). By contributing, you agree that your contribution is licensed the same way (Apache-2.0 section 5). Only contribute code you have the right to share.

## Questions

Open an issue. For a question about how to write Ion, the guide in `guide/` and [LANGUAGE.md](LANGUAGE.md) are the place to start.
