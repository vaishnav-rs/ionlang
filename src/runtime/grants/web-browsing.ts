import { GrantManager } from "./grant-manager.js";
import { ToolSpec } from "../providers/types.js";

export const webBrowsingTools: ToolSpec[] = [
  {
    name: "fetch_url",
    description: "Fetch the raw text/HTML content of a URL over HTTP.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "URL to fetch." } },
      required: ["url"]
    }
  },
  {
    name: "browse_page",
    description:
      "Open a visible browser window, navigate to a URL, and return the page's visible text. Use for pages that require JS rendering or interaction.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "URL to navigate to." } },
      required: ["url"]
    }
  }
];

interface BrowserSession {
  close(): Promise<void>;
}

const activeBrowsers: BrowserSession[] = [];

export async function closeAllBrowsers(): Promise<void> {
  await Promise.all(activeBrowsers.map((b) => b.close().catch(() => undefined)));
  activeBrowsers.length = 0;
}

export async function runWebBrowsingTool(
  toolName: string,
  args: Record<string, unknown>,
  grantManager: GrantManager
): Promise<string> {
  if (toolName === "fetch_url") {
    const url = String(args.url ?? "");
    await grantManager.confirmOnce("web-browsing", `fetch '${url}'`);
    const res = await fetch(url);
    return await res.text();
  }

  if (toolName === "browse_page") {
    const url = String(args.url ?? "");
    await grantManager.confirmOnce("web-browsing", `open browser and navigate to '${url}'`);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: false });
    const session: BrowserSession = { close: () => browser.close() };
    activeBrowsers.push(session);
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const text = await page.innerText("body");
      return text;
    } finally {
      await browser.close();
      const idx = activeBrowsers.indexOf(session);
      if (idx >= 0) activeBrowsers.splice(idx, 1);
    }
  }

  throw new Error(`unknown web-browsing tool '${toolName}'`);
}
