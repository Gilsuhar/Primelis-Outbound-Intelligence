// @vitest-environment node
import { EventEmitter } from "node:events";
import { createServer, createConnection } from "node:net";
import type { RequestOptions } from "node:https";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: transport.lookup }));
vi.mock("node:https", () => ({ get: transport.get }));
import { readPublicSource } from "./public-sources";
let options: RequestOptions & { autoSelectFamily: boolean };
let status: number;
let body: string;
let contentType: string;
beforeEach(() => {
  vi.stubEnv("HTTP_PROXY", "");
  vi.stubEnv("HTTPS_PROXY", "");
  status = 200;
  contentType = "text/html";
  body =
    "<title>Fixture</title><p>" + "Explicit fictional company source content. ".repeat(5) + "</p>";
  transport.lookup.mockReset().mockResolvedValue([{ address: "93.184.215.14", family: 4 }]);
  transport.get.mockReset().mockImplementation((_url, opts, callback) => {
    options = opts;
    const request = new EventEmitter() as EventEmitter & { destroy: () => void };
    request.destroy = () => {
      request.emit("error", new Error("fixture closed"));
    };
    queueMicrotask(() => {
      const response = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
        resume: () => void;
      };
      response.statusCode = status;
      response.headers = { "content-type": contentType };
      response.resume = () => {};
      callback(response);
      if (status === 200 && /text\/(html|plain)/.test(contentType)) {
        response.emit("data", Buffer.from(body));
        response.emit("end");
      }
    });
    return request;
  });
});
afterEach(() => vi.unstubAllEnvs());
it("extracts content with single-address pinning and retains TLS defaults", async () => {
  const page = await readPublicSource("https://example.com/company");
  expect(page.text).toContain("Explicit fictional company source content.");
  expect(page.url).toBe("https://example.com/company");
  expect(options.autoSelectFamily).toBe(false);
  expect(options.rejectUnauthorized).not.toBe(false);
  const callback = vi.fn();
  options.lookup!("example.com", {}, callback);
  expect(callback).toHaveBeenCalledWith(null, "93.184.215.14", 4);
  expect(transport.lookup).toHaveBeenCalledWith("example.com", { all: true, family: 4 });
});
it("uses the reader's actual options with Node's real socket lookup contract offline", async () => {
  await readPublicSource("https://example.com/");
  const server = createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({
        host: "fixture.invalid",
        port,
        autoSelectFamily: options.autoSelectFamily,
        lookup: (_host, lookupOptions, callback) => {
          expect(lookupOptions.all).not.toBe(true);
          // Loopback belongs only to this isolated fixture, never the public reader.
          callback(null, "127.0.0.1", 4);
        },
      });
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it("rejects mixed public/private DNS answers before HTTPS", async () => {
  transport.lookup.mockResolvedValue([
    { address: "93.184.215.14", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]);
  await expect(readPublicSource("https://example.com/")).rejects.toThrow("SOURCE_DNS_NOT_PUBLIC");
  expect(transport.get).not.toHaveBeenCalled();
});
it.each(["http://example.com/", "https://127.0.0.1/", "https://linkedin.com/company/fixture"])(
  "refuses forbidden URL %s",
  async (url) => {
    await expect(readPublicSource(url)).rejects.toThrow("SOURCE_UNAVAILABLE");
    expect(transport.get).not.toHaveBeenCalled();
  },
);
it("does not follow redirects", async () => {
  status = 301;
  await expect(readPublicSource("https://example.com/")).rejects.toThrow("SOURCE_REDIRECT");
  expect(transport.get).toHaveBeenCalledTimes(1);
});
it("retains the 500 KB response cap", async () => {
  body = "x".repeat(500001);
  await expect(readPublicSource("https://example.com/")).rejects.toThrow("SOURCE_TOO_LARGE");
});
it("refuses unsupported content types", async () => {
  contentType = "application/pdf";
  await expect(readPublicSource("https://example.com/")).rejects.toThrow("SOURCE_CONTENT_TYPE");
});
it("refuses configured proxies before DNS or HTTPS", async () => {
  vi.stubEnv("HTTPS_PROXY", "http://fixture.invalid");
  await expect(readPublicSource("https://example.com/")).rejects.toThrow(
    "PUBLIC_SOURCE_PROXY_UNSUPPORTED",
  );
  expect(transport.lookup).not.toHaveBeenCalled();
  expect(transport.get).not.toHaveBeenCalled();
});
it("reports DNS failures without leaking resolver diagnostics", async () => {
  transport.lookup.mockRejectedValue(new Error("private resolver details"));
  await expect(readPublicSource("https://example.com/")).rejects.toThrow("SOURCE_DNS_FAILED");
  expect(transport.get).not.toHaveBeenCalled();
});
it("reports HTTP refusal without fetching a fallback or following a redirect", async () => {
  status = 403;
  await expect(readPublicSource("https://example.com/")).rejects.toThrow("SOURCE_HTTP_403");
  expect(transport.get).toHaveBeenCalledTimes(1);
});
it("reports extraction rejection for challenge pages", async () => {
  body = "<title>Verify you are human</title>" + "Fixture challenge content. ".repeat(10);
  await expect(readPublicSource("https://example.com/")).rejects.toThrow("SOURCE_CONTENT_REJECTED");
});
it("reports TLS failure without returning certificate or host details", async () => {
  transport.get.mockImplementationOnce(() => {
    const request = new EventEmitter();
    queueMicrotask(() =>
      request.emit(
        "error",
        Object.assign(new Error("private certificate details"), { code: "CERT_HAS_EXPIRED" }),
      ),
    );
    return request;
  });
  await expect(readPublicSource("https://example.com/")).rejects.toThrow("SOURCE_TLS");
});
