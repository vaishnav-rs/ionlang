// Builds Ion as a single program file (ion.exe on Windows, ion on macOS and Linux) that needs
// no Node.js installed. It bundles the CLI with esbuild, then adds the bundle to a copy of the
// Node.js runtime with Node's built-in single-executable support.
//
//   npm run build:binary
//
// Output: dist-bin/ion-<os>-<arch>[.exe], then a smoke test that starts the chat page.

import * as esbuild from "esbuild";
import { inject } from "postject";
import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = path.join(root, "build");
const outDir = path.join(root, "dist-bin");
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));

const osName = { win32: "windows", darwin: "macos", linux: "linux" }[process.platform] ?? process.platform;
const archName = process.arch;
const exeName = `ion-${osName}-${archName}${process.platform === "win32" ? ".exe" : ""}`;

fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(path.join(build, "bin"), { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

// 1. The chat page, so the program can serve it without its folder.
const webui = path.join(root, "src", "runtime", "webui");
const pages = {};
(function collect(dir, prefix = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, `${prefix}/${entry.name}`);
    else pages[`${prefix}/${entry.name}`] = fs.readFileSync(full).toString("base64");
  }
})(webui);
if (!pages["/index.html"]) throw new Error("the chat page (src/runtime/webui/index.html) is missing");

// 2. Bundle the CLI into one CommonJS file. Values that depend on the file layout are set here.
const banner = [
  `var __ionMetaUrl = require("node:url").pathToFileURL(typeof __filename === "string" ? __filename : process.execPath).href;`,
  `var __ION_VERSION__ = ${JSON.stringify(pkg.version)};`,
  `var __ION_WEBUI__ = ${JSON.stringify(pages)};`
].join("\n");

await esbuild.build({
  entryPoints: [path.join(root, "src", "cli", "index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: path.join(build, "bin", "ion.cjs"),
  banner: { js: banner },
  define: { "import.meta.url": "__ionMetaUrl" },
  // Browser automation loads Playwright only when a script asks for it, and it is not bundled.
  // The optional speed-ups for the WebSocket library are not needed either.
  external: ["playwright", "bufferutil", "utf-8-validate"],
  logLevel: "warning"
});

// 3. Turn the bundle into a blob Node can run from inside a program file.
fs.writeFileSync(
  path.join(build, "sea-config.json"),
  JSON.stringify({
    main: path.join(build, "bin", "ion.cjs"),
    output: path.join(build, "bin", "sea-prep.blob"),
    disableExperimentalSEAWarning: true
  })
);
execFileSync(process.execPath, ["--experimental-sea-config", path.join(build, "sea-config.json")], { stdio: "inherit" });

// 4. Copy the Node.js runtime and inject the blob into the copy.
const target = path.join(outDir, exeName);
fs.copyFileSync(process.execPath, target);
if (process.platform === "darwin") execFileSync("codesign", ["--remove-signature", target]);
await inject(target, "NODE_SEA_BLOB", fs.readFileSync(path.join(build, "bin", "sea-prep.blob")), {
  sentinelFuse: SEA_FUSE,
  ...(process.platform === "darwin" ? { machoSegmentName: "NODE_SEA" } : {})
});
// macOS runs modified binaries only when they carry a signature; an ad-hoc one is enough to run.
if (process.platform === "darwin") execFileSync("codesign", ["--force", "--sign", "-", target]);

// 5. Smoke test: the program reports its version and serves its chat page.
const version = execFileSync(target, ["--version"], { encoding: "utf-8" }).trim();
if (version !== `${pkg.version} (Ion language 1.0)`) throw new Error(`unexpected version output: ${version}`);

const port = 43871;
const child = spawn(target, ["preview", "--no-open", "--yes", "--port", String(port)], { cwd: root, stdio: "ignore" });
try {
  let page = "";
  for (let i = 0; i < 60 && !page; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) page = await res.text();
    } catch {
      /* not up yet */
    }
  }
  if (!page.includes("<html") && !page.includes("<!doctype")) throw new Error("the chat page did not load from the program");
} finally {
  child.kill();
}

const size = (fs.statSync(target).size / 1024 / 1024).toFixed(1);
console.log(`built ${path.relative(root, target)} (${size} MB), ${version}, chat page embedded`);
