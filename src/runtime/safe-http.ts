import * as dns from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";

/** Thrown when a request would reach this computer or a private network. */
export class BlockedAddressError extends Error {}

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  let a = address.toLowerCase();
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4 written inside an IPv6 address
  if (mapped) a = mapped[1];

  if (net.isIPv4(a)) {
    const [p, q] = a.split(".").map(Number);
    return (
      p === 0 || p === 10 || p === 127 ||
      (p === 169 && q === 254) ||
      (p === 172 && q >= 16 && q <= 31) ||
      (p === 192 && q === 168) ||
      (p === 100 && q >= 64 && q <= 127) ||
      p >= 224
    );
  }
  if (net.isIPv6(a)) {
    return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith("ff");
  }
  return true; // not an address we understand: refuse
}

export interface PublicResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
  url: string;
}

export interface PublicRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/**
 * An HTTP(S) request that can only reach the public internet. The address check happens at the moment
 * the connection is made (not before), so a name that secretly resolves to 127.0.0.1, or a redirect
 * to an internal address, cannot slip through.
 */
export async function publicRequest(rawUrl: string, opts: PublicRequestOptions = {}): Promise<PublicResponse> {
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  let url = rawUrl;
  let method = (opts.method ?? "GET").toUpperCase();
  let body = opts.body;

  for (let hop = 0; ; hop++) {
    const res = await once(url, method, opts.headers ?? {}, body, opts.timeoutMs ?? 30000, maxBytes);
    const location = res.headers.location;
    if ([301, 302, 303, 307, 308].includes(res.status) && location) {
      if (hop >= maxRedirects) throw new Error(`too many redirects (more than ${maxRedirects})`);
      url = new URL(location, url).toString();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
      }
      continue;
    }
    return res;
  }
}

function once(url: string, method: string, headers: Record<string, string>, body: string | undefined, timeoutMs: number, maxBytes: number): Promise<PublicResponse> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error(`'${url}' is not a valid web address`));
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return reject(new Error(`only http and https addresses are allowed, not ${u.protocol}`));
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isPrivateAddress(host)) return reject(new BlockedAddressError("that address is on a private or local network"));

    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      {
        method,
        headers: { "Accept-Encoding": "identity", ...headers },
        lookup: ((hostname: string, options: dns.LookupOptions, cb: (...a: unknown[]) => void) => {
          dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
            if (err) return cb(err);
            if (addrs.some((x) => isPrivateAddress(x.address))) return cb(new BlockedAddressError("that name points to a private or local network"));
            if (options.all) return cb(null, addrs);
            cb(null, addrs[0].address, addrs[0].family);
          });
        }) as never
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (c: Buffer) => {
          if (truncated) return;
          size += c.length;
          if (size > maxBytes) {
            chunks.push(c.subarray(0, c.length - (size - maxBytes)));
            truncated = true;
            res.destroy();
          } else chunks.push(c);
        });
        const finish = () => {
          const headersOut: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) headersOut[k] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
          resolve({ status: res.statusCode ?? 0, headers: headersOut, body: Buffer.concat(chunks), truncated, url });
        };
        res.on("end", finish);
        res.on("close", () => truncated && finish());
        res.on("error", (e) => (truncated ? finish() : reject(e)));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error(`it took longer than ${Math.round(timeoutMs / 1000)} seconds`), { name: "TimeoutError" })));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Decodes a response body using the charset the server declared (UTF-8 if unknown). */
export function decodeBody(body: Buffer, contentType = ""): string {
  const label = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(label ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
