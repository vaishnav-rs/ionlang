import { describe, it, expect } from "vitest";
import * as net from "node:net";
import { choosePort, isPortFree, suggestPorts } from "../src/cli/port.js";

/** Holds a port open for the length of `fn`, so it looks taken to Ion. */
async function occupy(port: number, fn: () => Promise<void>): Promise<void> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  try {
    await fn();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** An "ask" that answers from a list, the way a person would type. */
function answers(...lines: (string | null)[]) {
  const asked: string[] = [];
  const ask = async (prompt: string) => {
    asked.push(prompt);
    return lines.length ? lines.shift()! : null;
  };
  return { ask, asked };
}

describe("choosing a port", () => {
  it("uses the requested port when it is free, without asking", async () => {
    const { ask, asked } = answers();
    const port = await choosePort(47101, ask, () => undefined);
    expect(port).toBe(47101);
    expect(asked).toEqual([]);
  });

  it("offers two free ports nearby, and uses the one the person picks", async () => {
    await occupy(47110, async () => {
      const [first, second] = await suggestPorts(47111, 2);
      const said: string[] = [];
      const { ask, asked } = answers("2");
      const port = await choosePort(47110, ask, (l) => said.push(l));
      expect(port).toBe(second);
      expect(first).not.toBe(second);
      expect(said.join("\n")).toContain("Port 47110 is already in use");
      expect(said.join("\n")).toContain(`1) use port ${first}`);
      expect(said.join("\n")).toContain(`2) use port ${second}`);
      expect(asked).toEqual(["Choose 1, 2 or 3: "]);
    });
  });

  it("lets the person type their own port", async () => {
    await occupy(47120, async () => {
      const { ask } = answers("3", "47125");
      expect(await choosePort(47120, ask, () => undefined)).toBe(47125);
    });
  });

  it("asks again for a choice it doesn't understand", async () => {
    await occupy(47130, async () => {
      const said: string[] = [];
      const { ask } = answers("maybe", "1");
      const [first] = await suggestPorts(47131, 1);
      expect(await choosePort(47130, ask, (l) => said.push(l))).toBe(first);
      expect(said).toContain("Please type 1, 2 or 3.");
    });
  });

  it("refuses a typed port that is also in use, and asks again", async () => {
    await occupy(47140, async () => {
      await occupy(47141, async () => {
        const said: string[] = [];
        const { ask } = answers("3", "47141", "3", "47142");
        expect(await choosePort(47140, ask, (l) => said.push(l))).toBe(47142);
        expect(said).toContain("Port 47141 is in use too. Try another.");
      });
    });
  });

  it("rejects a number that is not a port", async () => {
    await occupy(47150, async () => {
      const said: string[] = [];
      const { ask } = answers("3", "99999", "3", "47151");
      expect(await choosePort(47150, ask, (l) => said.push(l))).toBe(47151);
      expect(said).toContain('"99999" isn\'t a port number from 1 to 65535.');
    });
  });

  it("gives up cleanly when the input ends", async () => {
    await occupy(47160, async () => {
      const { ask } = answers();
      await expect(choosePort(47160, ask, () => undefined)).rejects.toThrow(/no port was chosen/);
    });
  });

  it("reports whether a port is free", async () => {
    expect(await isPortFree(47170)).toBe(true);
    await occupy(47170, async () => {
      expect(await isPortFree(47170)).toBe(false);
    });
  });
});
