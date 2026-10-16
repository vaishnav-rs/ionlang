import * as net from "node:net";

/** True when nothing is listening on this port on this computer. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

/** The first free ports after `from`, so the suggestions are close to what was asked for. */
export async function suggestPorts(from: number, count = 2): Promise<number[]> {
  const found: number[] = [];
  for (let port = from; port <= 65535 && found.length < count; port++) {
    if (await isPortFree(port)) found.push(port);
  }
  return found;
}

/** Reads one line from the person; null means the input has ended. */
export type Ask = (prompt: string) => Promise<string | null>;

/**
 * Makes sure the server can use `requested`. If another program has the port, offers two free
 * ports nearby or lets the person type their own, and returns the port to use.
 */
export async function choosePort(requested: number, ask: Ask, say: (line: string) => void): Promise<number> {
  if (await isPortFree(requested)) return requested;

  const [first, second] = await suggestPorts(requested + 1, 2);
  say(`Port ${requested} is already in use by another program.`);
  for (;;) {
    say(`  1) use port ${first}`);
    say(`  2) use port ${second}`);
    say("  3) type my own port");
    const answer = (await ask("Choose 1, 2 or 3: "))?.trim();
    if (answer === undefined || answer === null) throw new Error("no port was chosen");

    if (answer === "1" || answer === "2") {
      const port = answer === "1" ? first : second;
      if (await isPortFree(port)) return port;
      say(`Port ${port} was just taken. Pick another option.`);
      continue;
    }
    if (answer === "3") {
      const typed = (await ask("Port number (1 to 65535): "))?.trim();
      if (typed === undefined || typed === null) throw new Error("no port was chosen");
      const port = Number(typed);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        say(`"${typed}" isn't a port number from 1 to 65535.`);
        continue;
      }
      if (await isPortFree(port)) return port;
      say(`Port ${port} is in use too. Try another.`);
      continue;
    }
    say("Please type 1, 2 or 3.");
  }
}
