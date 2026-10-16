#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tokenize, LexError } from "../lexer/lexer.js";
import { parse as parseLegacy, ParseError } from "../parser/parser.js";
import { analyze, SemanticError } from "../semantic/semantic.js";
import { buildProgramConfig, ProgramBuildError, ProgramConfig } from "../interpreter/program.js";
import { startServer } from "../runtime/server.js";
import { IonError, formatError } from "../lang/errors.js";
import { parse } from "../lang/parser.js";
import { check } from "../lang/check.js";
import { Interpreter } from "../lang/interpreter.js";
import { DEMO_SOURCE } from "../lang/demo.js";
import { toText } from "../lang/values.js";
import { LineReader, loadDotEnv, terminalIO } from "./io.js";
import { formatSource } from "../lang/format.js";
import { audit } from "../runtime/audit.js";
import { FileHistoryStore, HistoryStore } from "../runtime/history-store.js";
import { LANGUAGE_VERSION } from "../lang/version.js";

const program = new Command();

program
  .name("ion")
  .description("Ion: the plain-English language for building AI agents.")
  .version(`${packageVersion()} (Ion language ${LANGUAGE_VERSION})`, "-v, --version", "show the ion and language versions");

/** The `ion` package version from package.json, which sits two folders above both src/cli and dist/cli. */
function packageVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "package.json"), "utf-8")) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

/** Old-style files start with the literal line `ion init`. */
function isLegacy(source: string): boolean {
  const first = source.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== "" && !l.startsWith("#"));
  return first === "ion init";
}

function readSource(file: string): string | undefined {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch (err) {
    console.error(`ion: could not read '${file}': ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return undefined;
  }
}

function showIonError(err: IonError, file: string, source: string): void {
  const errFile = err.file ?? file;
  let src = source;
  if (err.file) {
    try { src = fs.readFileSync(err.file, "utf-8"); } catch { /* keep main source */ }
  }
  console.error(formatError(err, errFile, src));
}

/** Conversations kept between runs, when `--data` is given. */
let historyStore: HistoryStore | undefined;

interface RunFlags {
  data?: string;
  log: boolean;
  logContent: boolean;
  budget?: string;
  trace: boolean;
}

/** Set up the audit log, token budget, tracing and conversation storage for one run. */
function configureRun(file: string | undefined, flags: RunFlags): void {
  const budget = flags.budget === undefined ? undefined : Number(flags.budget);
  if (budget !== undefined && (!Number.isInteger(budget) || budget < 1)) {
    console.error("ion: --budget needs a whole number of tokens, like --budget 200000");
    process.exit(1);
  }
  const dir = file ? path.dirname(path.resolve(file)) : process.cwd();
  const day = new Date().toISOString().slice(0, 10);
  audit.configure({
    logFile: flags.log ? path.join(dir, ".ion", "logs", `${day}.jsonl`) : undefined,
    logContent: flags.logContent,
    budgetTokens: budget,
    trace: flags.trace ? (line) => console.error(`  ${line}`) : undefined
  });
  historyStore = flags.data ? new FileHistoryStore(path.resolve(flags.data)) : undefined;
}

/** Options shared by `run` and `preview`. */
function addRunOptions(cmd: Command): Command {
  return cmd
    .option("--data <folder>", "keep conversations in this folder so they survive restarts")
    .option("--no-log", "don't write the run log to .ion/logs")
    .option("--log-content", "include message and tool-result text in the run log (off by default)", false)
    .option("--budget <tokens>", "stop once this many model tokens have been used")
    .option("--trace", "print each model call, tool call and permission decision as it happens", false);
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
}

/** Start the chat/API server and block until Ctrl+C. */
function serveUntilStopped(config: ProgramConfig, port: number, headless: boolean, autoYes: boolean, open = true, allowedOrigins: string[] = []): Promise<void> {
  const { close } = startServer({ program: config, port, headless, autoYes, allowedOrigins, historyStore });
  console.log(`ion: serving on http://localhost:${port}`);
  if (headless) console.log("ion: headless mode. POST {\"text\": \"...\"} to /message, or connect to /stream.");
  else if (open) openBrowser(`http://localhost:${port}`);
  return new Promise((resolve) => {
    process.once("SIGINT", async () => {
      console.log("\nion: shutting down...");
      await close();
      resolve();
    });
  });
}

addRunOptions(program
  .command("run")
  .description("Run an .ion script")
  .argument("<file>", "path to an .ion file")
  .option("--headless", "with 'serve': API only, no web UI and no browser", false)
  .option("--port <n>", "port to use for 'serve' (overrides the script)")
  .option("--yes", "auto-approve every permission prompt", false)
  .option("--allow-origin <origin...>", "let a web page at this origin (like http://localhost:5173) call the API"))
  .action(async (file: string, options: { headless: boolean; port?: string; yes: boolean; allowOrigin?: string[] } & RunFlags) => {
    const source = readSource(file);
    if (source === undefined) return;
    loadDotEnv([path.dirname(path.resolve(file)), process.cwd()]);
    configureRun(file, options);

    if (isLegacy(source)) return runLegacy(file, source, options);

    const reader = new LineReader();
    try {
      const interp = new Interpreter({
        io: terminalIO(reader, options.yes),
        file,
        autoYes: options.yes,
        serve: (config, port) =>
          serveUntilStopped(config, options.port ? parseInt(options.port, 10) : port, options.headless, options.yes, true, options.allowOrigin ?? [])
      });
      await interp.runSource(source);
    } catch (err) {
      if (err instanceof IonError) showIonError(err, file, source);
      else console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      reader.close();
    }
  });

addRunOptions(program
  .command("preview")
  .description("Open the chat web UI. With no file it shows a demo team that needs no API key")
  .argument("[file]", "an .ion file to preview (optional)")
  .option("--port <n>", "port to use", "4310")
  .option("--no-open", "don't open the browser automatically")
  .option("--yes", "auto-approve every permission prompt", false))
  .action(async (file: string | undefined, options: { port: string; open: boolean; yes: boolean } & RunFlags) => {
    let source = DEMO_SOURCE;
    if (file) {
      const text = readSource(file);
      if (text === undefined) return;
      if (isLegacy(text)) {
        console.error("ion: 'preview' works with the newer syntax. Use `ion run` for 'ion init' files.");
        process.exitCode = 1;
        return;
      }
      source = text;
      loadDotEnv([path.dirname(path.resolve(file)), process.cwd()]);
    }
    configureRun(file, options);
    const port = parseInt(options.port, 10);
    const reader = new LineReader();
    try {
      const interp = new Interpreter({
        io: terminalIO(reader, options.yes),
        file,
        autoYes: options.yes,
        serve: (config, p) => serveUntilStopped(config, options.port !== "4310" ? port : p, false, options.yes, options.open)
      });
      await interp.runSource(source);
      if (!(await interp.serveDefault(port))) {
        console.error("ion: this script defines no agents, so there is nothing to preview.");
        process.exitCode = 1;
      }
    } catch (err) {
      if (err instanceof IonError) showIonError(err, file ?? "demo", source);
      else console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      reader.close();
    }
  });

program
  .command("check")
  .description("Find mistakes in an .ion script without running it")
  .argument("<file>", "path to an .ion file")
  .action((file: string) => {
    const source = readSource(file);
    if (source === undefined) return;
    if (isLegacy(source)) {
      try {
        buildLegacy(source, false);
        console.log(`${file}: ok (legacy 'ion init' syntax)`);
      } catch (err) {
        reportLegacyError(err, file);
        process.exitCode = 1;
      }
      return;
    }
    try {
      const problems = check(parse(source));
      if (problems.length === 0) {
        console.log(`${file}: ok`);
        return;
      }
      for (const p of problems) {
        console.error(formatError(new IonError(p.message, p.line, p.hint), file, source));
      }
      process.exitCode = 1;
    } catch (err) {
      if (err instanceof IonError) showIonError(err, file, source);
      else console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("repl")
  .description("Type Ion code and see it run, one piece at a time")
  .option("--yes", "auto-approve every permission prompt", false)
  .action(async (options: { yes: boolean }) => {
    loadDotEnv([process.cwd()]);
    const reader = new LineReader();
    const interp = new Interpreter({ io: terminalIO(reader, options.yes), autoYes: options.yes });
    console.log('Ion REPL. Try: say "hello"   (Ctrl+C or "exit" to leave)');
    for (;;) {
      let line = await reader.read("ion> ");
      if (line === null || line.trim() === "exit") break;
      if (line.trim() === "") continue;
      // a line ending in ':' starts a block: keep reading until an empty line
      if (line.trimEnd().endsWith(":")) {
        for (;;) {
          const more = await reader.read("...  ");
          if (more === null || more.trim() === "") break;
          line += "\n" + more;
        }
      }
      try {
        const result = await interp.runSnippet(line);
        if (result.isValue && result.value !== null && result.value !== undefined) console.log(toText(result.value));
      } catch (err) {
        if (err instanceof IonError) console.error(`  ${err.message}${err.hint ? `\n  hint: ${err.hint}` : ""}`);
        else console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    reader.close();
  });

program
  .command("test")
  .description("Run the 'test' blocks in a script, or in every .ion file in a folder")
  .argument("<path>", "an .ion file, or a folder of them")
  .option("--yes", "let tests approve permission prompts instead of denying them", false)
  .action(async (target: string, options: { yes: boolean }) => {
    let files: string[];
    try {
      files = fs.statSync(target).isDirectory()
        ? fs.readdirSync(target).filter((f) => f.endsWith(".ion")).sort().map((f) => path.join(target, f))
        : [target];
    } catch (err) {
      console.error(`ion: could not read '${target}': ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
      return;
    }

    let passed = 0;
    let failed = 0;
    for (const file of files) {
      const source = readSource(file);
      if (source === undefined) { failed++; continue; }
      if (isLegacy(source)) {
        console.log(`${file}: skipped (old 'ion init' files have no tests)`);
        continue;
      }
      loadDotEnv([path.dirname(path.resolve(file)), process.cwd()]);
      console.log(file);
      const io = {
        say: (text: string) => console.log(`    ${text}`),
        note: (text: string) => console.log(`    ${text}`),
        readLine: async () => null,
        confirm: async () => options.yes
      };
      try {
        const results = await new Interpreter({ io, file, autoYes: options.yes, collectTests: true }).runTests(source);
        for (const r of results) {
          if (r.ok) {
            passed++;
            console.log(`  ok    ${r.name}`);
          } else {
            failed++;
            console.log(`  FAIL  ${r.name}`);
            const where = r.line ? `${file}:${r.line}: ` : "";
            console.log(`        ${where}${r.message}`);
            if (r.hint) console.log(`        hint: ${r.hint}`);
          }
        }
        if (results.length === 0) console.log("  (no tests here)");
      } catch (err) {
        failed++;
        if (err instanceof IonError) console.log(formatError(err, file, source).replace(/^/gm, "  "));
        else console.log(`  ${err instanceof Error ? err.message : String(err)}`);
      }
      console.log("");
    }

    console.log(`${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  });

program
  .command("lsp")
  .description("Run the Ion language server, for editors (it talks over stdin and stdout)")
  .action(async () => {
    const { startLanguageServer } = await import("../lsp/server.js");
    startLanguageServer();
  });

program
  .command("fmt")
  .description("Tidy an .ion file's indentation and spacing")
  .argument("<file>", "the .ion file to format (changed in place)")
  .option("--check", "don't change the file; exit with an error if it isn't formatted", false)
  .action((file: string, options: { check: boolean }) => {
    const source = readSource(file);
    if (source === undefined) return;
    if (isLegacy(source)) {
      console.error(`${file}: 'ion fmt' works with the newer syntax, not 'ion init' files.`);
      process.exitCode = 1;
      return;
    }
    let formatted: string;
    try {
      formatted = formatSource(source);
    } catch (err) {
      if (err instanceof IonError) showIonError(err, file, source);
      else console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      return;
    }
    if (formatted === source.replace(/\r\n?/g, "\n")) {
      if (!options.check) console.log(`${file}: already formatted`);
      return;
    }
    if (options.check) {
      console.error(`${file}: not formatted. Run 'ion fmt ${file}' to fix it.`);
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(file, formatted, "utf-8");
    console.log(`${file}: formatted`);
  });

// ---- legacy `ion init` files ---------------------------------------------

function buildLegacy(source: string, resolveKeys = true): ProgramConfig {
  const resolved = analyze(parseLegacy(tokenize(source)));
  if (!resolveKeys) return { type: resolved.type, agents: [], entryPoints: resolved.entryPoints };
  return buildProgramConfig(resolved);
}

function reportLegacyError(err: unknown, file: string): void {
  if (err instanceof LexError || err instanceof ParseError || err instanceof SemanticError) {
    console.error(`${file}:${err.line}: ${err.message}`);
  } else if (err instanceof ProgramBuildError) {
    console.error(`${file}: ${err.message}`);
  } else {
    console.error(err instanceof Error ? err.message : String(err));
  }
}

async function runLegacy(
  file: string,
  source: string,
  options: { headless: boolean; port?: string; yes: boolean }
): Promise<void> {
  try {
    const config = buildLegacy(source);
    await serveUntilStopped(config, parseInt(options.port ?? "4310", 10), options.headless, options.yes);
  } catch (err) {
    reportLegacyError(err, file);
    process.exitCode = 1;
  }
}

program.parseAsync(process.argv);
