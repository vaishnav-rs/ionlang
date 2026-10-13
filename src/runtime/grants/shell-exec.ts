import { spawn } from "node:child_process";
import { GrantManager } from "./grant-manager.js";
import { ToolSpec } from "../providers/types.js";

export const shellExecTools: ToolSpec[] = [
  {
    name: "run_command",
    description: "Run a shell command and capture its stdout, stderr, and exit code.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "Command to execute." } },
      required: ["command"]
    }
  }
];

export async function runShellExecTool(
  toolName: string,
  args: Record<string, unknown>,
  grantManager: GrantManager
): Promise<string> {
  if (toolName !== "run_command") {
    throw new Error(`unknown shell-exec tool '${toolName}'`);
  }
  const command = String(args.command ?? "");
  await grantManager.confirmOnce("shell-exec", `run '${command}'`);

  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = spawn(isWin ? "cmd.exe" : "/bin/sh", [isWin ? "/c" : "-c", command], {
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      resolve(JSON.stringify({ stdout, stderr, exitCode: code }));
    });
  });
}
