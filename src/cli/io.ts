import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { IonIO } from "../lang/interpreter.js";
import { loadEnvFile } from "../runtime/env.js";

/** One shared stdin reader so `ask user`, `chat with` and permission prompts
 *  never fight over the same stream (also works with piped input). */
export class LineReader {
  private rl: readline.Interface;
  private queue: string[] = [];
  private waiters: ((line: string | null) => void)[] = [];
  private closed = false;

  constructor() {
    this.rl = readline.createInterface({ input: process.stdin, terminal: false });
    this.rl.on("line", (line) => {
      const w = this.waiters.shift();
      if (w) w(line);
      else this.queue.push(line);
    });
    this.rl.on("close", () => {
      this.closed = true;
      this.waiters.splice(0).forEach((w) => w(null));
    });
  }

  read(prompt: string): Promise<string | null> {
    process.stdout.write(prompt);
    if (this.queue.length) return Promise.resolve(this.queue.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  close(): void {
    this.rl.close();
  }
}

export function terminalIO(reader: LineReader, autoYes: boolean): IonIO {
  return {
    say: (text) => console.log(text),
    note: (text) => console.log(`  \x1b[2m> ${text}\x1b[0m`),
    readLine: (prompt) => reader.read(prompt),
    confirm: async ({ agent, grant, detail }) => {
      if (autoYes) return true;
      const answer = await reader.read(`  Allow '${agent}' to use ${grant} (${detail})? [y/N] `);
      return (answer ?? "").trim().toLowerCase().startsWith("y");
    }
  };
}

/** Load KEY=value lines from a .env file next to the script (or in the cwd).
 *  Never overrides variables that are already set. */
export function loadDotEnv(dirs: string[]): void {
  for (const dir of dirs) {
    const file = path.join(dir, ".env");
    if (!fs.existsSync(file)) continue;
    loadEnvFile(file);
    return;
  }
}
