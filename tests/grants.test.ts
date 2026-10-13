import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GrantManager, GrantDeniedError, GrantNotDeclaredError } from "../src/runtime/grants/grant-manager.js";
import { runFileAccessTool, PathOutsideScopeError } from "../src/runtime/grants/file-access.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ion-grants-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GrantManager", () => {
  it("asserts a grant is declared before use", () => {
    const gm = new GrantManager("agent", [], async () => true);
    expect(() => gm.assert("file-access")).toThrow(GrantNotDeclaredError);
  });

  it("confirm-once: only prompts on first use of a grant kind", async () => {
    let calls = 0;
    const gm = new GrantManager(
      "agent",
      [{ kind: "file-access", scope: tmpDir, line: 1 }],
      async () => {
        calls++;
        return true;
      }
    );
    await gm.confirmOnce("file-access", "first");
    await gm.confirmOnce("file-access", "second");
    expect(calls).toBe(1);
  });

  it("denies use when the confirm callback returns false", async () => {
    const gm = new GrantManager(
      "agent",
      [{ kind: "shell-exec", line: 1 }],
      async () => false
    );
    await expect(gm.confirmOnce("shell-exec", "run rm -rf")).rejects.toThrow(GrantDeniedError);
  });

  it("--yes / autoYes bypasses confirmation entirely", async () => {
    let calls = 0;
    const gm = new GrantManager(
      "agent",
      [{ kind: "web-browsing", line: 1 }],
      async () => {
        calls++;
        return true;
      },
      true
    );
    await gm.confirmOnce("web-browsing", "fetch");
    expect(calls).toBe(0);
  });
});

describe("file-access tool", () => {
  it("writes then reads a file within the granted root", async () => {
    const gm = new GrantManager("agent", [{ kind: "file-access", scope: tmpDir, line: 1 }], async () => true);
    await runFileAccessTool("write_file", { path: "note.txt", content: "hello" }, gm);
    const contents = await runFileAccessTool("read_file", { path: "note.txt" }, gm);
    expect(contents).toBe("hello");
  });

  it("rejects a path that resolves outside the granted root", async () => {
    const gm = new GrantManager("agent", [{ kind: "file-access", scope: tmpDir, line: 1 }], async () => true);
    await expect(
      runFileAccessTool("read_file", { path: "../../../../Windows/System32/config" }, gm)
    ).rejects.toThrow(PathOutsideScopeError);
  });

  it("lists files in the granted root", async () => {
    const gm = new GrantManager("agent", [{ kind: "file-access", scope: tmpDir, line: 1 }], async () => true);
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "x");
    const listing = await runFileAccessTool("list_files", { path: "." }, gm);
    expect(JSON.parse(listing)).toContain("a.txt");
  });
});
