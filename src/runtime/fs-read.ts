import * as fs from "node:fs";
import * as path from "node:path";

export interface DirEntry {
  name: string;
  type: "folder" | "file" | "other";
  size: number;
  modified: string;
}

const typeOf = (d: fs.Dirent): DirEntry["type"] => (d.isSymbolicLink() ? "other" : d.isDirectory() ? "folder" : d.isFile() ? "file" : "other");

function statSafe(p: string): { size: number; modified: string } {
  try {
    const s = fs.statSync(p);
    return { size: s.isFile() ? s.size : 0, modified: s.mtime.toISOString() };
  } catch {
    return { size: 0, modified: "" };
  }
}

/** The entries of one folder, folders first. Symbolic links and junctions are reported as "other". */
export function listDir(dir: string): DirEntry[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((d) => ({ name: d.name, type: typeOf(d), ...statSafe(path.join(dir, d.name)) }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : b.type === "folder" ? 1 : 0));
}

export interface WalkEntry extends DirEntry {
  path: string;
}

/**
 * Lists everything under a folder, depth first, with limits. Never follows symbolic links or junctions
 * (so it can't loop, or wander outside the folder). `skip` holds lowercase file and folder names to ignore.
 */
export function walkDir(root: string, opts: { maxEntries: number; maxDepth: number; skip: Set<string> }): { entries: WalkEntry[]; truncated: boolean } {
  const entries: WalkEntry[] = [];
  let truncated = false;
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  while (stack.length && !truncated) {
    const { dir, depth } = stack.pop()!;
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable folder: skip it quietly
    }
    const folders: { dir: string; depth: number }[] = [];
    for (const d of children) {
      if (opts.skip.has(d.name.toLowerCase())) continue;
      if (entries.length >= opts.maxEntries) { truncated = true; break; }
      const full = path.join(dir, d.name);
      const type = typeOf(d);
      entries.push({ path: full.replace(/\\/g, "/"), name: d.name, type, ...statSafe(full) });
      if (type === "folder" && depth + 1 < opts.maxDepth) folders.push({ dir: full, depth: depth + 1 });
    }
    stack.push(...folders.reverse());
  }
  return { entries, truncated };
}

export function fileInfo(p: string): { exists: boolean; type?: string; size?: number; modified?: string } {
  try {
    const s = fs.lstatSync(p);
    return { exists: true, type: s.isSymbolicLink() ? "other" : s.isDirectory() ? "folder" : s.isFile() ? "file" : "other", size: s.isFile() ? s.size : 0, modified: s.mtime.toISOString() };
  } catch {
    return { exists: false };
  }
}

/** The real location of a path: symbolic links and ".." resolved, forward slashes. Throws if it doesn't exist. */
export function realPath(p: string): string {
  return fs.realpathSync(p).replace(/\\/g, "/");
}

/** Reads at most `maxChars` characters from the start of a text file without loading the rest. */
export function readText(p: string, maxChars?: number): string {
  if (maxChars === undefined) return fs.readFileSync(p, "utf-8");
  const fd = fs.openSync(p, "r");
  try {
    const buf = Buffer.alloc(Math.max(0, maxChars) * 4 + 4); // UTF-8 uses at most 4 bytes per character
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf-8").slice(0, maxChars);
  } finally {
    fs.closeSync(fd);
  }
}
