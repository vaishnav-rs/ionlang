import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { ProgramConfig } from "../interpreter/program.js";
import { SessionStore } from "./session.js";
import { HistoryStore, isValidSessionId } from "./history-store.js";
import { GrantKind } from "../parser/ast.js";
import { closeAllBrowsers } from "./grants/web-browsing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBUI_DIR = path.join(__dirname, "webui");

export interface ServerOptions {
  program: ProgramConfig;
  port: number;
  headless: boolean;
  autoYes: boolean;
  /** Extra browser origins (like "http://localhost:5173") allowed to call the API. */
  allowedOrigins?: string[];
  /** Keep conversations between runs. Without it, conversations live only in memory. */
  historyStore?: HistoryStore;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Only requests addressed to this computer are served (blocks DNS-rebinding attacks). */
export function hostAllowed(hostHeader: string | undefined): boolean {
  const m = hostHeader?.match(/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/);
  return !!m && LOCAL_HOSTS.has(m[1].toLowerCase());
}

/**
 * Browsers attach an Origin header to cross-site requests and WebSocket handshakes. Without this
 * check, any web page you visit could talk to your local agents. Programs that are not browsers
 * (curl, Node, Python) send no Origin and are always allowed.
 */
export function originAllowed(origin: string | undefined, port: number, extra: string[] = []): boolean {
  if (!origin) return true;
  if (extra.includes(origin)) return true;
  try {
    const u = new URL(origin);
    return LOCAL_HOSTS.has(u.hostname.toLowerCase()) && u.port === String(port);
  } catch {
    return false;
  }
}

interface PendingConfirm {
  resolve: (ok: boolean) => void;
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2"
};

export function startServer(opts: ServerOptions): { httpServer: http.Server; close: () => Promise<void> } {
  const sessions = new SessionStore();
  const pendingConfirms = new Map<string, PendingConfirm>();

  const httpServer = http.createServer(async (req, res) => {
    if (!hostAllowed(req.headers.host)) {
      res.writeHead(421, { "Content-Type": "text/plain" });
      res.end("This server only answers requests addressed to localhost.");
      return;
    }
    if (!originAllowed(req.headers.origin, opts.port, opts.allowedOrigins)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end(`Origin ${req.headers.origin} is not allowed. Start Ion with --allow-origin to permit it.`);
      return;
    }
    if (req.method === "POST" && req.url === "/message") {
      await handleRestMessage(req, res, opts, sessions);
      return;
    }
    if (req.method === "GET" && req.url === "/config") {
      const entryAgent = opts.program.agents.find((a) => a.name === opts.program.entryPoints[0]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          entry: entryAgent?.name ?? null,
          input: entryAgent?.input ?? ["text"],
          output: entryAgent?.output ?? ["text"]
        })
      );
      return;
    }
    if (req.method === "GET" && req.url === "/agents") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          opts.program.agents.map((a) => ({
            name: a.name,
            isOrchestrator: a.isOrchestrator,
            entry: opts.program.entryPoints.includes(a.name),
            team: !!a.team,
            role: a.role ?? null,
            grants: a.grants.map((g) => g.kind),
            tools: (a.extraTools ?? []).map((t) => t.name),
            teammates: a.teammates
          }))
        )
      );
      return;
    }
    if (opts.headless) {
      res.writeHead(404);
      res.end();
      return;
    }
    handleStaticRequest(req, res);
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/stream",
    verifyClient: (info: { origin: string; req: http.IncomingMessage }) =>
      hostAllowed(info.req.headers.host) && originAllowed(info.origin || undefined, opts.port, opts.allowedOrigins)
  });

  wss.on("connection", (ws, req) => {
    // A page can name its conversation with ?session=<id>, which lets it resume after a reload
    const requested = new URL(req.url ?? "/", "http://localhost").searchParams.get("session");
    const sessionId = requested && isValidSessionId(requested) ? requested : randomUUID();
    const entryAgent = opts.program.entryPoints[0];
    if (!entryAgent) {
      ws.send(JSON.stringify({ type: "final", text: "No entry-point agent configured." }));
      ws.close();
      return;
    }

    const confirmFn = async (detail: { agent: string; grant: GrantKind; detail: string }) => {
      if (opts.autoYes) return true;
      const confirmId = randomUUID();
      const promise = new Promise<boolean>((resolve) => {
        pendingConfirms.set(confirmId, { resolve });
      });
      ws.send(
        JSON.stringify({
          type: "confirm_required",
          confirmId,
          agent: detail.agent,
          grant: detail.grant,
          detail: detail.detail
        })
      );
      return promise;
    };

    const session = sessions.create(
      sessionId,
      opts.program,
      entryAgent,
      confirmFn,
      opts.autoYes,
      (agent, text) => ws.send(JSON.stringify({ type: "chunk", agent, text })),
      (agent, tool, detail) => ws.send(JSON.stringify({ type: "tool_call", agent, tool, detail })),
      (agent, tool, result, isError, ms) =>
        ws.send(
          JSON.stringify({
            type: "tool_result",
            agent,
            tool,
            isError,
            ms,
            result: result.length > 4000 ? `${result.slice(0, 4000)}
… (${result.length - 4000} more characters)` : result
          })
        ),
      opts.historyStore
    );

    ws.send(JSON.stringify({ type: "session", persistent: !!opts.historyStore }));

    ws.on("message", async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "confirm_response") {
        const pending = pendingConfirms.get(msg.confirmId);
        if (pending) {
          pending.resolve(!!msg.ok);
          pendingConfirms.delete(msg.confirmId);
        }
        return;
      }

      if (msg.type === "message") {
        try {
          const finalText = await session.send(
            String(msg.text ?? ""),
            msg.addressedTo ? String(msg.addressedTo) : undefined
          );
          ws.send(JSON.stringify({ type: "final", agent: entryAgent, text: finalText }));
        } catch (err) {
          ws.send(
            JSON.stringify({
              type: "final",
              text: `Error: ${err instanceof Error ? err.message : String(err)}`
            })
          );
        }
      }
    });
  });

  httpServer.listen(opts.port, "127.0.0.1");

  return {
    httpServer,
    close: async () => {
      await closeAllBrowsers();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  };
}

function handleStaticRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const urlPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(WEBUI_DIR, urlPath);
  if (!filePath.startsWith(WEBUI_DIR + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  });
}

async function handleRestMessage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  opts: ServerOptions,
  sessions: SessionStore
): Promise<void> {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const parsed = JSON.parse(body || "{}");
      // Each call without a session_id is a fresh conversation, so unrelated callers never share memory
      const requested = parsed.session_id === undefined ? undefined : String(parsed.session_id);
      if (requested !== undefined && !isValidSessionId(requested)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "session_id may only use letters, digits, '-' and '_' (up to 128 characters)" }));
        return;
      }
      const sessionId = requested ?? randomUUID();
      const entryAgent = opts.program.entryPoints[0];
      if (!entryAgent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "no entry-point agent configured" }));
        return;
      }

      const confirmFn = async () => {
        // REST callers have no interactive channel for a confirm round-trip;
        // grants proceed only when --yes was passed, matching the CLI's own
        // terminal-prompt bypass semantics.
        return opts.autoYes;
      };

      const session = sessions.getOrCreate(sessionId, opts.program, entryAgent, confirmFn, opts.autoYes, undefined, undefined, undefined, opts.historyStore);
      const result = await session.send(String(parsed.text ?? ""));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ result }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });
}

export { WebSocket };
