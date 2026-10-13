// Verifies every code sample in the guide:
//  ```ion       must parse            ```ion-bad   must NOT parse
//  ```ion-run   is executed, and the next ```output / ```error block must match exactly
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/lang/parser.js";
import { Interpreter } from "../src/lang/interpreter.js";
import { IonError, formatError } from "../src/lang/errors.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "guide", "parts");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

let checked = 0, executed = 0;
const failures: string[] = [];

for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), "utf-8").replace(/\r\n/g, "\n");
  const blocks = [...text.matchAll(/```([\w-]*)\n([\s\S]*?)```/g)].map((m) => ({
    lang: m[1], code: m[2], end: m.index! + m[0].length, start: m.index!
  }));
  const lineOf = (i: number) => text.slice(0, i).split("\n").length;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const where = `${file}:${lineOf(b.start)}`;
    if (b.lang === "ion") {
      checked++;
      try { parse(b.code); } catch (e) { failures.push(`${where} does not parse: ${(e as Error).message}`); }
    } else if (b.lang === "ion-bad") {
      checked++;
      let threw = false;
      try { parse(b.code); } catch { threw = true; }
      if (!threw) failures.push(`${where} was expected to fail but parses`);
    } else if (b.lang === "ion-run") {
      executed++;
      const next = blocks[i + 1];
      if (!next || (next.lang !== "output" && next.lang !== "error") || text.slice(b.end, next.start).trim() !== "") {
        failures.push(`${where} ion-run block has no output/error block right after it`);
        continue;
      }
      const out: string[] = [];
      const interp = new Interpreter({
        io: { say: (t) => void out.push(t), note: () => {}, readLine: async () => null, confirm: async () => true }
      });
      let actual: string;
      try {
        await interp.runSource(b.code);
        actual = out.join("\n");
        if (next.lang === "error") { failures.push(`${where} expected an error but the program succeeded`); continue; }
      } catch (e) {
        if (!(e instanceof IonError)) { failures.push(`${where} crashed: ${(e as Error).message}`); continue; }
        actual = formatError(e, "script.ion", b.code);
        if (next.lang === "output") { failures.push(`${where} failed unexpectedly:\n${actual}`); continue; }
      }
      if (actual.trimEnd() !== next.code.trimEnd()) {
        failures.push(`${where} output differs\n--- book says:\n${next.code.trimEnd()}\n--- actually prints:\n${actual.trimEnd()}`);
      }
    }
  }
}

console.log(`${checked} samples syntax-checked, ${executed} executed and compared.`);
if (failures.length) {
  console.log(`\n${failures.length} PROBLEM(S):\n`);
  for (const f of failures) console.log(f + "\n");
  process.exit(1);
}
console.log("All guide samples are correct.");
