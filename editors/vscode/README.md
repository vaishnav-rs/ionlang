# Ion for VS Code

Syntax highlighting for `.ion` files: keywords, text with `{interpolation}`, comments, numbers, and agent settings.

## Install from this folder

1. Open this folder in VS Code.
2. Run `npx @vscode/vsce package` to build `ion-language-0.1.0.vsix`.
3. In VS Code, run "Extensions: Install from VSIX..." and pick the file.

For a quick try without installing, open the folder and press F5 to start an Extension Development Host.

Formatting is done with `ion fmt <file>` from the command line, not by this extension.
