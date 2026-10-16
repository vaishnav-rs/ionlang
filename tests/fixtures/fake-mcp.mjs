// A tiny MCP server for tests: it offers an "echo" tool and an "add" tool, over stdin and stdout.
import * as readline from "node:readline";

const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");

const tools = [
  {
    name: "echo",
    description: "Repeats the text it is given",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
  },
  {
    name: "add",
    description: "Adds two numbers",
    inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] }
  }
];

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.id === undefined) return; // notifications get no answer
  switch (msg.method) {
    case "initialize":
      send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } } });
      return;
    case "tools/list":
      send({ jsonrpc: "2.0", id: msg.id, result: { tools } });
      return;
    case "tools/call": {
      const { name, arguments: args } = msg.params;
      if (name === "echo") {
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `echo: ${args.text}` }] } });
      } else if (name === "add") {
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: String(args.a + args.b) }] } });
      } else {
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `no tool ${name}` }], isError: true } });
      }
      return;
    }
    default:
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `unknown method ${msg.method}` } });
  }
});
