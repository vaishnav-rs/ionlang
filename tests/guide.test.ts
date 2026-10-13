import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import * as path from "node:path";

describe("the guide", () => {
  it("every code sample parses and every shown output matches what really runs", () => {
    const root = path.join(__dirname, "..");
    const out = execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/verify-guide.ts"], {
      cwd: root,
      encoding: "utf-8"
    });
    expect(out).toContain("All guide samples are correct.");
  }, 60000);
});
