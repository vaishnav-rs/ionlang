import * as fs from "node:fs/promises";
import * as path from "node:path";
import { GrantManager } from "./grant-manager.js";
import { ToolSpec } from "../providers/types.js";

export class PathOutsideScopeError extends Error {}

/** Raised for files that usually hold keys or passwords. Whatever an agent reads is sent to its model. */
export class SecretFileError extends Error {}

/** Names that suggest a file holds secrets. Matching is on each part of the path. */
const SECRET_NAME = /^\.env(\..*)?$|^\.(ion|git|ssh|aws|gnupg)$|\.(pem|key|p12|pfx)$|^id_(rsa|dsa|ecdsa|ed25519)|secret|credential|password|api[-_]?key/i;

export function isSecretPath(relative: string): boolean {
  return relative.split(/[\\/]/).some((part) => part !== "" && SECRET_NAME.test(part));
}

function resolveWithinScope(scope: string, target: string): string {
  const root = path.resolve(scope);
  const resolved = path.resolve(root, target);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathOutsideScopeError(
      `path '${target}' resolves outside the granted root '${root}'`
    );
  }
  if (isSecretPath(rel)) {
    throw new SecretFileError(
      `'${target}' looks like it holds secrets, so an agent can't read, list or write it. Keep keys in environment variables instead.`
    );
  }
  return resolved;
}

/** Follows symbolic links, so a link inside the folder can't point an agent at a secret file outside its rules. */
async function checkRealPath(scope: string, full: string): Promise<void> {
  let real: string;
  try {
    real = await fs.realpath(full);
  } catch {
    return; // doesn't exist yet (a new file being written): nothing to follow
  }
  const root = await fs.realpath(path.resolve(scope)).catch(() => path.resolve(scope));
  const rel = path.relative(root, real);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathOutsideScopeError(`'${path.relative(root, full)}' is a link to a place outside the granted folder`);
  }
  if (isSecretPath(rel)) {
    throw new SecretFileError(`'${path.relative(root, full)}' links to a file that looks like it holds secrets, so an agent can't use it.`);
  }
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
    await checkRealPath(scope, full);
    return await fs.readFile(full, "utf-8");
  }

  if (toolName === "write_file") {
    const target = String(args.path ?? "");
    const content = String(args.content ?? "");
    await grantManager.confirmOnce("file-access", `write '${target}'`);
    const full = resolveWithinScope(scope, target);
    await checkRealPath(scope, full);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf-8");
    return `wrote ${content.length} bytes to ${target}`;
  }

  if (toolName === "list_files") {
    const target = String(args.path ?? ".");
    await grantManager.confirmOnce("file-access", `list '${target}'`);
    const full = resolveWithinScope(scope, target);
    await checkRealPath(scope, full);
    // secret-looking names are hidden from the listing, so the agent never learns they exist
    const entries = (await fs.readdir(full)).filter((name) => !isSecretPath(name));
    return JSON.stringify(entries);
  }

  throw new Error(`unknown file-access tool '${toolName}'`);
}
