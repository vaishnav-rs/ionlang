import * as fs from "node:fs/promises";
import * as path from "node:path";
import { GrantManager } from "./grant-manager.js";
import { ToolSpec } from "../providers/types.js";

export class PathOutsideScopeError extends Error {}

function resolveWithinScope(scope: string, target: string): string {
  const root = path.resolve(scope);
  const resolved = path.resolve(root, target);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathOutsideScopeError(
      `path '${target}' resolves outside the granted root '${root}'`
    );
  }
  return resolved;
}

export const fileAccessTools: ToolSpec[] = [
  {
    name: "read_file",
    description: "Read the contents of a text file within the agent's granted file-access root.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Path relative to the granted root." } },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write text content to a file within the agent's granted file-access root.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the granted root." },
        content: { type: "string", description: "Content to write." }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "list_files",
    description: "List files in a directory within the agent's granted file-access root.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path relative to the granted root, defaults to root." } }
    }
  }
];

export async function runFileAccessTool(
  toolName: string,
  args: Record<string, unknown>,
  grantManager: GrantManager
): Promise<string> {
  const scope = grantManager.getScope("file-access");
  if (!scope) {
    throw new Error("file-access grant has no scope configured");
  }

  if (toolName === "read_file") {
    const target = String(args.path ?? "");
    await grantManager.confirmOnce("file-access", `read '${target}'`);
    const full = resolveWithinScope(scope, target);
    return await fs.readFile(full, "utf-8");
  }

  if (toolName === "write_file") {
    const target = String(args.path ?? "");
    const content = String(args.content ?? "");
    await grantManager.confirmOnce("file-access", `write '${target}'`);
    const full = resolveWithinScope(scope, target);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf-8");
    return `wrote ${content.length} bytes to ${target}`;
  }

  if (toolName === "list_files") {
    const target = String(args.path ?? ".");
    await grantManager.confirmOnce("file-access", `list '${target}'`);
    const full = resolveWithinScope(scope, target);
    const entries = await fs.readdir(full);
    return JSON.stringify(entries);
  }

  throw new Error(`unknown file-access tool '${toolName}'`);
}
