# Security Policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue for them.

Use GitHub's private vulnerability reporting on this repository: open the **Security** tab and choose **Report a vulnerability**. Include:

- what you found and why it matters,
- the smallest Ion script or steps that reproduce it,
- the version (`ion --version`) and your operating system.

The maintainer will confirm receipt and keep you updated. Please give the maintainer a reasonable time to fix the problem before you share details publicly.

## What Ion protects, and what it does not

Ion gives each agent only the abilities it is declared with (`can access files in ...`, `can browse web`, `can run commands`, `can read gmail ...`, `can use ...`, `can ask ...`). Abilities that touch your computer or the internet ask you before their first use, unless you run with `--yes`.

Ion is **not** a complete sandbox. In particular:

- **Prompt injection.** A web page, file, or email an agent reads can contain instructions that try to make the agent misuse its abilities. Limit each agent to the abilities it needs, and read the audit log (below) after runs that handle untrusted content.
- **Granted folders and commands.** An agent with `can run commands` can do whatever your account can do. Only grant it to agents you trust.
- **API keys in scripts.** Prefer `key from env "NAME"` over writing a key into the file.

## Audit log and secrets

Each run writes a log of its model calls, tool calls, and permission decisions to `.ion/logs/` next to the script. By default the log holds metadata only: message and tool-result text are left out. Use `--no-log` to turn logging off, or `--log-content` to include the text. Secrets that Ion knows about are replaced with `[hidden]` in the log, in traces, and in error text.

Keep `.ion/` out of version control. The project's `.gitignore` already does this.

## Supported versions

Only the latest release receives security fixes.
