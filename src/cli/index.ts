#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
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

const program = new Command();

program
  .name("ion")
  .description("Ion: the plain-English language for building AI agents.");

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

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
}

/** Start the chat/API server and block until Ctrl+C. */
function serveUntilStopped(config: ProgramConfig, port: number, headless: boolean, autoYes: boolean, open = true, allowedOrigins: string[] = []): Promise<void> {
  const { close } = startServer({ program: config, port, headless, autoYes, allowedOrigins });
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

program
  .command("run")
  .description("Run an .ion script")
  .argument("<file>", "path to an .ion file")
  .option("--headless", "with 'serve': API only, no web UI and no browser", false)
  .option("--port <n>", "port to use for 'serve' (overrides the script)")
  .option("--yes", "auto-approve every permission prompt", false)
  .option("--allow-origin <origin...>", "let a web page at this origin (like http://localhost:5173) call the API")
  .action(async (file: string, options: { headless: boolean; port?: string; yes: boolean; allowOrigin?: string[] }) => {
    const source = readSource(file);
    if (source === undefined) return;
    loadDotEnv([path.dirname(path.resolve(file)), process.cwd()]);

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

program
  .command("preview")
  .description("Open the chat web UI. With no file it shows a demo team that needs no API key")
  .argument("[file]", "an .ion file to preview (optional)")
  .option("--port <n>", "port to use", "4310")
  .option("--no-open", "don't open the browser automatically")
  .option("--yes", "auto-approve every permission prompt", false)
  .action(async (file: string | undefined, options: { port: string; open: boolean; yes: boolean }) => {
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
