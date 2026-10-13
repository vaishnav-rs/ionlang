import { GrantManager } from "./grant-manager.js";
import { ToolSpec } from "../providers/types.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const gmailAccessTools: ToolSpec[] = [
  {
    name: "search_gmail",
    description:
      "Search the user's Gmail inbox using Gmail search syntax (e.g. 'from:alice is:unread', 'subject:invoice'). Returns a list of matching messages with id, subject, sender, date, and snippet.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query." },
        max_results: { type: "string", description: "Max messages to return, defaults to 10." }
      },
      required: ["query"]
    }
  },
  {
    name: "read_gmail_message",
    description: "Read the full decoded body and headers of a single Gmail message by id.",
    parameters: {
      type: "object",
      properties: { message_id: { type: "string", description: "Gmail message id, from search_gmail results." } },
      required: ["message_id"]
    }
  }
];

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function headerValue(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function extractPlainTextBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const text = extractPlainTextBody(part);
    if (text) return text;
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

async function gmailFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`${GMAIL_API}${path}`, { headers: authHeaders(token) });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${errText}`);
  }
  return res.json();
}

export async function runGmailAccessTool(
  toolName: string,
  args: Record<string, unknown>,
  grantManager: GrantManager
): Promise<string> {
  const token = grantManager.getScope("gmail-access");
  if (!token) {
    throw new Error("gmail-access grant has no OAuth token configured");
  }

  if (toolName === "search_gmail") {
    const query = String(args.query ?? "");
    const maxResults = Number(args.max_results ?? 10) || 10;
    await grantManager.confirmOnce("gmail-access", `search gmail for '${query}'`);

    const list = await gmailFetch(
      `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
      token
    );
    const ids: string[] = (list.messages ?? []).map((m: any) => m.id);
    const results = await Promise.all(
      ids.map(async (id) => {
        const msg = await gmailFetch(
          `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          token
        );
        const headers = msg.payload?.headers ?? [];
        return {
          id,
          subject: headerValue(headers, "Subject"),
          from: headerValue(headers, "From"),
          date: headerValue(headers, "Date"),
          snippet: msg.snippet ?? ""
        };
      })
    );
    return JSON.stringify(results);
  }

  if (toolName === "read_gmail_message") {
    const messageId = String(args.message_id ?? "");
    await grantManager.confirmOnce("gmail-access", `read message '${messageId}'`);

    const msg = await gmailFetch(`/messages/${messageId}?format=full`, token);
    const headers = msg.payload?.headers ?? [];
    return JSON.stringify({
      id: messageId,
      subject: headerValue(headers, "Subject"),
      from: headerValue(headers, "From"),
      to: headerValue(headers, "To"),
      date: headerValue(headers, "Date"),
      body: extractPlainTextBody(msg.payload)
    });
  }

  throw new Error(`unknown gmail-access tool '${toolName}'`);
}
