import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { ChatMessage } from "./providers/types.js";

/** Conversation memory for one session, by agent name (or "session|agent" in the terminal). */
export type SavedHistories = Record<string, ChatMessage[]>;

/** Where conversations are kept between runs. */
export interface HistoryStore {
  load(sessionKey: string): SavedHistories;
  save(sessionKey: string, histories: SavedHistories): void;
}

/** Keeps each session in its own JSON file under `dir`. Nothing is saved unless the caller asks for a store. */
export class FileHistoryStore implements HistoryStore {
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** The file for a session. The key is hashed, so a session id can never escape the folder. */
  private fileFor(sessionKey: string): string {
    const name = crypto.createHash("sha256").update(sessionKey).digest("hex").slice(0, 40);
    return path.join(this.dir, `${name}.json`);
  }

  load(sessionKey: string): SavedHistories {
    try {
      return JSON.parse(fs.readFileSync(this.fileFor(sessionKey), "utf-8")) as SavedHistories;
    } catch {
      return {}; // no file yet, or unreadable: start a fresh conversation
    }
  }

  save(sessionKey: string, histories: SavedHistories): void {
    const file = this.fileFor(sessionKey);
    const tmp = `${file}.tmp`;
    // write to a temporary file, then rename, so a crash never leaves half a file behind
    fs.writeFileSync(tmp, JSON.stringify(histories), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, file);
  }
}

/** A session id a client may choose: letters, digits, dashes and underscores, up to 128 characters. */
export function isValidSessionId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}
