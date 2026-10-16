import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { Interpreter, IonIO } from "../src/lang/interpreter.js";
import { McpHttpClient } from "../src/runtime/mcp.js";

/**
 * A small MCP server over HTTP for tests. It checks the bearer token, hands out a session id that
 * every later request must send back, and answers tools/call as a server-sent event stream.
 */
let server: http.Server;
let url: string;
const seen: { auth?: string; session?: string; methods: string[] }[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const auth = req.headers.authorization;
      const session = req.headers["mcp-session-id"] as string | undefined;
      const msg = JSON.parse(body);
      seen.push({ auth, session, methods: [msg.method] });

      if (auth !== "Bearer test-token") {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("missing or wrong token");
        return;
      }
      if (msg.method === "notifications/initialized") {
        res.writeHead(202);
        res.end();
        return;
      }
      if (msg.method === "initialize") {
        res.writeHead(200, { "Content-Type": "application/json", "Mcp-Session-Id": "session-42" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: {} } }));
        return;
      }
      if (session !== "session-42") {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("no session");
        return;
      }
      if (msg.method === "tools/list") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "weather", description: "Gives the weather", inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } }] } }));
        return;
      }
      if (msg.method === "tools/call") {
        // answered as a stream of events, the other form a server may use
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `Sunny in ${msg.params.arguments.city}` }] } })}\n\n`);
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "unknown method" } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const io: IonIO = { say: () => undefined, note: () => undefined, readLine: async () => null, confirm: async () => true };

describe("MCP servers over HTTP", () => {
  it("connects, lists tools, and calls them with the session and the token", async () => {
    process.env.ION_TEST_MCP_TOKEN = "test-token";
    const out: string[] = [];
    const interp = new Interpreter({ io: { ...io, say: (t) => void out.push(t) } });
    try {
      await interp.runSource(`mcp weather:
    url "${url}"
    key from env "ION_TEST_MCP_TOKEN"

agent forecaster:
    model "mock"
    can use weather
    can run commands

say ask forecaster 'CALL weather__weather {"city": "Oslo"}'
`);
    } finally {
      interp.close();
      delete process.env.ION_TEST_MCP_TOKEN;
    }
    expect(out.join("\n")).toContain("Done: Sunny in Oslo");
    expect(seen.some((s) => s.auth === "Bearer test-token")).toBe(true);
    expect(seen.some((s) => s.session === "session-42")).toBe(true);
  });

  it("explains a wrong token without crashing the script", async () => {
    const interp = new Interpreter({ io });
    try {
      await expect(
        interp.runSource(`mcp weather:
    url "${url}"
    key "wrong-token"

agent forecaster:
    model "mock"
    can use weather
    can run commands
`)
      ).rejects.toThrow(/couldn't connect to the MCP server 'weather'.*401/);
    } finally {
      interp.close();
    }
  });

  it("refuses an address that isn't a web address", async () => {
    const interp = new Interpreter({ io });
    await expect(interp.runSource('mcp weather:\n    url "ftp://example.com/mcp"\n')).rejects.toThrow(/starting with http/);
  });

  it("speaks to the server directly", async () => {
    const client = new McpHttpClient(url, url, "test-token");
    await client.initialize();
    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["weather"]);
    expect(await client.callTool("weather", { city: "Bergen" })).toBe("Sunny in Bergen");
    client.close();
  });
});
