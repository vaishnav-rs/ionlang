import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient | undefined;

/** Starts `ion lsp` so the editor shows Ion's errors as you type and offers completions. */
export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("ion");
  const command = config.get<string>("serverCommand", "ion");

  const serverOptions: ServerOptions = {
    run: { command, args: ["lsp"], transport: TransportKind.stdio },
    debug: { command, args: ["lsp"], transport: TransportKind.stdio }
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "ion" }]
  };

  client = new LanguageClient("ion", "Ion Language Server", serverOptions, clientOptions);
  context.subscriptions.push({ dispose: () => void client?.stop() });
  client.start().catch((err: unknown) => {
    vscode.window.showWarningMessage(
      `Ion's language server didn't start (${err instanceof Error ? err.message : String(err)}). Install Ion with 'npm install -g' or set ion.serverCommand to the path of the ion program.`
    );
  });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
