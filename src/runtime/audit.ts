import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The run's record of what happened: every model call, tool call, permission decision,
 * and error, written as one JSON line per event. It also counts tokens against an optional
 * budget, and keeps secrets out of everything it writes.
 *
 * By default the log holds metadata only. Message and tool-result text is left out unless
 * `logContent` is set, because prompts often contain private information.
 */

export interface AuditOptions {
  /** Append events to this JSON-lines file. */
  logFile?: string;
  /** Include message and tool-result text in the log. Off by default. */
  logContent?: boolean;
  /** Stop model calls once this many tokens have been used (input + output). */
  budgetTokens?: number;
  /** Print a one-line summary of each event as it happens. */
  trace?: (line: string) => void;
}

export class BudgetExceededError extends Error {}

/**
 * Fields that can hold private text: messages, tool arguments and results, what a permission
 * was asked for (a URL, a search, a command), and error text (which can echo a prompt).
 * They are dropped unless logContent is on.
 */
const CONTENT_FIELDS = new Set(["text", "prompt", "result", "args", "detail", "message", "reason"]);
/** Field names whose values are never written, whatever they hold. */
const HIDDEN_FIELD = /key|token|secret|password|auth|credential/i;
/** Shorter values are too common to redact safely (e.g. "1", "yes"). */
const MIN_SECRET_LENGTH = 6;
const HIDDEN = "[hidden]";

export class Audit {
  private options: AuditOptions = {};
  private secrets = new Set<string>();
  private inputTokens = 0;
  private outputTokens = 0;

  /** Turn logging, budgets and tracing on or off for this process. */
  configure(options: AuditOptions): void {
    this.options = { ...this.options, ...options };
    if (this.options.logFile) fs.mkdirSync(path.dirname(this.options.logFile), { recursive: true });
  }

  /** Remember a secret so it never appears in the log, traces or error text. */
  addSecret(value: string | undefined): void {
    if (value && value.length >= MIN_SECRET_LENGTH) this.secrets.add(value);
  }

  /** Replace every known secret in `text` with a placeholder. */
  redact(text: string): string {
    let out = text;
    // longest first, so a secret that contains another one is fully hidden
    for (const s of [...this.secrets].sort((a, b) => b.length - a.length)) out = out.split(s).join(HIDDEN);
    return out;
  }

  get tokensUsed(): number {
    return this.inputTokens + this.outputTokens;
  }

  /** Throws before a model call if the budget is already spent. */
  checkBudget(): void {
    const budget = this.options.budgetTokens;
    if (budget !== undefined && this.tokensUsed >= budget) {
      throw new BudgetExceededError(
        `This run has used its token budget of ${budget} tokens (it used ${this.tokensUsed}). Run it again with a bigger --budget.`
      );
    }
  }

  /** Count the tokens a provider reported for one call. */
  spend(usage: { inputTokens: number; outputTokens: number } | undefined): void {
    if (!usage) return;
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
  }

  /** Record one event. `summary` is the short line shown by tracing. */
  record(type: string, fields: Record<string, unknown>, summary?: string): void {
    const event: Record<string, unknown> = { time: new Date().toISOString(), type };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (HIDDEN_FIELD.test(key)) event[key] = HIDDEN;
      else if (CONTENT_FIELDS.has(key) && !this.options.logContent) continue;
      else event[key] = value;
    }
    if (this.options.logFile) {
      fs.appendFileSync(this.options.logFile, this.redact(JSON.stringify(event)) + "\n", "utf-8");
    }
    if (this.options.trace && summary !== undefined) this.options.trace(this.redact(summary));
  }

  /** Forget everything: counters, secrets and options. Used by tests. */
  reset(): void {
    this.options = {};
    this.secrets.clear();
    this.inputTokens = 0;
    this.outputTokens = 0;
  }
}

/** The one recorder for this process. */
export const audit = new Audit();
