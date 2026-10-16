import { ChildProcess, spawn } from "node:child_process";

/**
 * A client for MCP (Model Context Protocol) servers. An MCP server is a program that offers
 * tools; this talks to it over its standard input and output, one JSON message per line.
 * See https://modelcontextprotocol.io for the protocol.
 */

const PROTOCOL_VERSION = "2024-11-05";
const REQUEST_TIMEOUT_MS = 30_000;
/** The first start can download the server (npx does this), so it gets longer. */
const START_TIMEOUT_MS = 180_000;

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] };
}

/** Servers still running, so they can be stopped when Ion exits. */
const running = new Set<ChildProcess>();
process.on("exit", () => {
  for (const proc of running) proc.kill();
});

export class McpClient implements McpSession {
  private proc: ChildProcess;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private buffer = "";
  private stderrTail = "";
  private closed = false;

  constructor(readonly command: string) {
    // a shell runs the command line, so `npx -y some-server` works the same way it does in a terminal
    this.proc = spawn(command, { shell: true, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    running.add(this.proc);
    // A running server must not keep Ion alive once the script is done: requests keep their own
    // timers, and the server is stopped when Ion exits.
    this.proc.unref();
    // the pipes are sockets at runtime, which have unref(); Node's stream types don't declare it
    for (const pipe of [this.proc.stdin, this.proc.stdout, this.proc.stderr] as unknown as Array<{ unref?: () => void }>) pipe?.unref?.();
    this.proc.stdout!.setEncoding("utf-8");
    this.proc.stdout!.on("data", (chunk: string) => this.onData(chunk));
    this.proc.stderr!.setEncoding("utf-8");
    this.proc.stderr!.on("data", (chunk: string) => (this.stderrTail = (this.stderrTail + chunk).slice(-400)));
    this.proc.on("error", (err) => this.failAll(new Error(`could not start '${command}': ${err.message}`)));
    this.proc.on("exit", (code) => {
      running.delete(this.proc);
      this.closed = true;
      const detail = this.stderrTail.trim();
      this.failAll(new Error(`the MCP server '${command}' stopped (exit code ${code})${detail ? `: ${detail}` : ""}`));
    });
  }

  /** Starts the conversation with the server. Must be called once before anything else. */
  async initialize(): Promise<void> {
    await this.request(
      "initialize",
      { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "ion", version: "1.0" } },
      START_TIMEOUT_MS
    );
    this.notify("notifications/initialized", {});
  }

  /** Every tool the server offers, following pagination if the server splits its list. */
  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.request("tools/list", cursor ? { cursor } : {});
      tools.push(...(page.tools ?? []));
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  /** Runs one tool and returns its text output. */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request("tools/call", { name, arguments: args });
    const text = (result.content ?? [])
      .filter((part: any) => part.type === "text")
      .map((part: any) => String(part.text))
      .join("\n");
    if (result.isError) throw new Error(text || `the tool '${name}' failed`);
    return text || JSON.stringify(result);
  }

  close(): void {
    if (!this.closed) this.proc.kill();
  }

  private request(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
    if (this.closed) return Promise.reject(new Error(`the MCP server '${this.command}' is not running`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`the MCP server '${this.command}' did not answer '${method}' in time`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private send(message: object): void {
    this.proc.stdin!.write(JSON.stringify(message) + "\n");
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        continue; // not a protocol message (some servers print logs on stdout): ignore it
      }
      // only answers to our requests matter here; server notifications are ignored
      if (message.id === undefined || (!message.result && !message.error)) continue;
      const waiting = this.pending.get(message.id);
      if (!waiting) continue;
      this.pending.delete(message.id);
      clearTimeout(waiting.timer);
      if (message.error) waiting.reject(new Error(String(message.error.message ?? "the MCP server reported an error")));
      else waiting.resolve(message.result);
    }
  }

  private failAll(err: Error): void {
    for (const [id, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(err);
      this.pending.delete(id);
    }
  }
}

/** The methods every MCP client offers, whichever way it talks to its server. */
export interface McpSession {
  readonly command: string;
  initialize(): Promise<void>;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  close(): void;
}

/**
 * An MCP server reached over HTTP (the "streamable HTTP" transport): each message is a POST to
 * the server's address. The answer is plain JSON or a stream of server-sent events, and the server
 * may hand out a session id that every later request must send back.
 */
export class McpHttpClient implements McpSession {
  private sessionId: string | undefined;
  private nextId = 1;

  constructor(readonly command: string, private url: string, private bearer?: string) {}

  async initialize(): Promise<void> {
    await this.request("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "ion", version: "1.0" } }, START_TIMEOUT_MS);
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, REQUEST_TIMEOUT_MS);
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.request("tools/list", cursor ? { cursor } : {});
      tools.push(...(page.tools ?? []));
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request("tools/call", { name, arguments: args });
    const text = (result.content ?? []).filter((part: any) => part.type === "text").map((part: any) => String(part.text)).join("\n");
    if (result.isError) throw new Error(text || `the tool '${name}' failed`);
    return text || JSON.stringify(result);
  }

  close(): void {
    // nothing stays open between requests; the server session simply stops being used
    this.sessionId = undefined;
  }

  private async request(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
    const id = this.nextId++;
    const answer = await this.post({ jsonrpc: "2.0", id, method, params }, timeoutMs);
    const message = Array.isArray(answer) ? answer.find((m) => m.id === id) : answer?.id === id ? answer : undefined;
    if (!message) throw new Error(`the MCP server at ${this.url} did not answer '${method}'`);
    if (message.error) throw new Error(String(message.error.message ?? "the MCP server reported an error"));
    return message.result;
  }

  /** One POST. Returns the parsed JSON-RPC message(s), or undefined for an acknowledgement with no body. */
  private async post(body: object, timeoutMs: number): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION
    };
    if (this.bearer) headers.Authorization = `Bearer ${this.bearer}`;
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    let res: Response;
    try {
      res = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new Error(`could not reach the MCP server at ${this.url}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const session = res.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`the MCP server answered ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    if (res.status === 202 || res.status === 204) return undefined;

    const text = await res.text();
    if (!text.trim()) return undefined;
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      const messages: unknown[] = [];
      for (const block of text.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        if (data) messages.push(JSON.parse(data));
      }
      return messages.length === 1 ? messages[0] : messages;
    }
    return JSON.parse(text);
  }
}
