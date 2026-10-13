/** Every error a user can cause in an Ion script. Always carries a line number
 *  and, where possible, a plain-English hint on how to fix it. */
export class IonError extends Error {
  line: number;
  hint?: string;
  /** Set when the error comes from an imported file rather than the main script. */
  file?: string;
  constructor(message: string, line = 0, hint?: string) {
    super(message);
    this.name = "IonError";
    this.line = line;
    this.hint = hint;
  }
}

function distance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

/** Closest candidate to `name`, if one is close enough to be a plausible typo. */
export function closest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = distance(name.toLowerCase(), c.toLowerCase());
    if (d < bestScore) {
      best = c;
      bestScore = d;
    }
  }
  const limit = Math.max(1, Math.floor(name.length / 3));
  return best !== undefined && bestScore <= limit ? best : undefined;
}

export function didYouMean(name: string, candidates: Iterable<string>): string | undefined {
  const c = closest(name, candidates);
  return c ? `Did you mean '${c}'?` : undefined;
}

export function formatError(err: IonError, file: string, source?: string): string {
  const head = err.line > 0 ? `${file}:${err.line}: ${err.message}` : `${file}: ${err.message}`;
  const out = [head];
  if (source && err.line > 0) {
    const text = source.split(/\r?\n/)[err.line - 1];
    if (text !== undefined) out.push(`    ${text.trim()}`);
  }
  if (err.hint) out.push(`  hint: ${err.hint}`);
  return out.join("\n");
}
