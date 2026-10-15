import "server-only";
import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { validatePublicCompanyUrl } from "@/features/connected-research/url-safety";
import { stripHtml } from "@/features/connected-research/website-extractor";

export function isPublicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  );
}
export function allowedSourceUrl(raw: string) {
  const checked = validatePublicCompanyUrl(raw);
  if (
    !checked.ok ||
    checked.url.protocol !== "https:" ||
    (checked.url.port && checked.url.port !== "443") ||
    raw.length > 1500
  )
    return false;
  const host = checked.url.hostname.toLowerCase();
  // Public bios elsewhere are allowed; never fetch gated professional/social profiles.
  return !["linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com"].some(
    (name) => host === name || host.endsWith("." + name),
  );
}
export type PublicPage = { url: string; title: string; text: string };
export type SourceReader = (url: string) => Promise<PublicPage>;
/** Public HTTPS only; DNS addresses validated and pinned to prevent rebinding. No cookies or redirects. */
export const readPublicSource: SourceReader = async (raw) => {
  // This pinned transport runs on Vercel; never bypass a managed workspace proxy.
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
    throw new Error("PUBLIC_SOURCE_PROXY_UNSUPPORTED");
  if (!allowedSourceUrl(raw)) throw new Error("SOURCE_UNAVAILABLE");
  const url = new URL(raw);
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_resolve, reject) => {
      dnsTimer = setTimeout(() => reject(new Error("SOURCE_DNS_TIMEOUT")), 3000);
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some((entry) => !isPublicIpv4(entry.address)))
    throw new Error("SOURCE_UNAVAILABLE");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      request.destroy();
      reject(new Error("SOURCE_TIMEOUT"));
    }, 7000);
    const request = get(
      url,
      {
        headers: { "user-agent": "Primelis-Signal-Research/1.0", accept: "text/html,text/plain" },
        lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4),
      },
      (response) => {
        const type = response.headers["content-type"] ?? "";
        if (response.statusCode !== 200 || !/text\/(html|plain)/.test(type)) {
          response.resume();
          clearTimeout(timer);
          reject(new Error("SOURCE_UNAVAILABLE"));
          return;
        }
        const buffers: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 500_000) {
            request.destroy();
            reject(new Error("SOURCE_TOO_LARGE"));
          } else buffers.push(chunk);
        });
        response.on("error", () => {
          clearTimeout(timer);
          reject(new Error("SOURCE_UNAVAILABLE"));
        });
        response.on("end", () => {
          clearTimeout(timer);
          const html = Buffer.concat(buffers).toString("utf8");
          const title = stripHtml(
            html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url.hostname,
          ).slice(0, 300);
          const text = stripHtml(html)
            .replace(/&amp;/g, "&")
            .replace(/&nbsp;|&#160;/g, " ")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .slice(0, 18000);
          if (text.length < 80 || /just a moment|verify you are human|access denied/i.test(title))
            reject(new Error("SOURCE_UNAVAILABLE"));
          else resolve({ url: url.href, title, text });
        });
      },
    );
    request.on("error", () => {
      clearTimeout(timer);
      reject(new Error("SOURCE_UNAVAILABLE"));
    });
  });
};
