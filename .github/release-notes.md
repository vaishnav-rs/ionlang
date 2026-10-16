# Ion {{TAG}}

Ion is a plain-English language for building AI agents, with tools, teams, knowledge bases (RAG) and MCP servers built in.

## Download

| System | File |
|---|---|
| Windows | `ion-windows-x64.zip` (contains `ion.exe` and a README) |
| macOS, Apple Silicon | `ion-macos-arm64.dmg` |
| macOS, Intel | `ion-macos-x64.dmg` |
| Ubuntu and Debian | `ion_{{VERSION}}_amd64.deb`, install with `sudo apt install ./ion_{{VERSION}}_amd64.deb` |
| Other Linux | `ion-linux-x64.tar.gz` |

Check a download against `SHA256SUMS.txt` before you run it.

## Notes

- The programs are not code-signed yet, so Windows and macOS warn the first time you open them.
- Knowledge bases search by meaning when they have an `embedding model`, and by keyword otherwise.
- MCP servers that run as programs need Node.js when they are published on npm.
