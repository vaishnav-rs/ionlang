import {
  createConnection,
  DiagnosticSeverity,
  ProposedFeatures,
  Range,
  TextDocuments,
  TextDocumentSyncKind,
  CompletionItemKind
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { completionsFor, problemsIn } from "./language.js";

/**
 * Ion's language server: shows the same mistakes `ion check` finds, as you type, and offers
 * completions. It talks the Language Server Protocol over stdin and stdout, so any editor
 * that supports it can use it. Run it with `ion lsp`.
 */
export function startLanguageServer(): void {
  // stdin and stdout carry the protocol, so nothing else in this process may print to stdout
  const connection = createConnection(ProposedFeatures.all, process.stdin, process.stdout);
  const documents = new TextDocuments(TextDocument);

  connection.onInitialize(() => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false }
    }
  }));

  const validate = (doc: TextDocument) => {
    const lines = doc.getText().split(/\r?\n/);
    const diagnostics = problemsIn(doc.getText()).map((p) => {
      // underline the whole line the problem is on (the editor is 0-based, Ion is 1-based)
      const line = Math.min(Math.max(0, p.line - 1), Math.max(0, lines.length - 1));
      return {
        severity: DiagnosticSeverity.Error,
        source: "ion",
        range: Range.create(line, 0, line, lines[line]?.length ?? 0),
        message: p.hint ? `${p.message}\n${p.hint}` : p.message
      };
    });
    connection.sendDiagnostics({ uri: doc.uri, diagnostics });
  };

  documents.onDidChangeContent((change) => validate(change.document));

  connection.onCompletion((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    return completionsFor(doc.getText()).map((c) => ({
      label: c.label,
      detail: c.detail,
      kind: c.kind === "keyword" ? CompletionItemKind.Keyword : c.kind === "function" ? CompletionItemKind.Function : CompletionItemKind.Variable
    }));
  });

  documents.listen(connection);
  connection.listen();
}
