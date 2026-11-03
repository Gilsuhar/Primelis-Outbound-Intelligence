// Isolated browser fixture: no user profile, real OAuth, credentials or application server.
import { spawn } from "node:child_process";
import { createServer, type RequestListener } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function outreachChromeFixture(
  handle: (
    request: {
      path: string;
      method: string;
      headers: Record<string, string | undefined>;
      body: string;
    },
    origin: string,
    providerOrigin: string,
  ) => Promise<Response | null>,
) {
  const profile = await mkdtemp(join(tmpdir(), "outreach-oauth-chrome-"));
  let origin = "";
  let providerOrigin = "";
  let failure: unknown;
  const server = createServer(async (req, res) => {
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const headers = Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join("; ") : value,
        ]),
      );
      const response = await handle(
        { path: req.url!, method: req.method!, headers, body },
        origin,
        providerOrigin,
      );
      if (!response) {
        req.socket.destroy();
        return;
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch (error) {
      failure = error;
      res.writeHead(500).end("Offline fixture failed");
    }
  });
  // A second loopback origin models the provider redirect without contacting Outreach.
  const providerServer = createServer(server.listeners("request")[0] as RequestListener);
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    await new Promise<void>((resolve) => providerServer.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("FIXTURE_ADDRESS_MISSING");
    origin = `http://127.0.0.1:${address.port}`;
    const providerAddress = providerServer.address();
    if (!providerAddress || typeof providerAddress === "string")
      throw new Error("FIXTURE_PROVIDER_ADDRESS_MISSING");
    providerOrigin = `http://127.0.0.1:${providerAddress.port}`;
    const dom = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.env.OUTREACH_TEST_CHROME!,
        [
          "--headless=new",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-sync",
          "--no-first-run",
          "--no-default-browser-check",
          `--user-data-dir=${profile}`,
          "--dump-dom",
          "--timeout=5000",
          "--virtual-time-budget=3000",
          `${origin}/fixture-start`,
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("OFFLINE_CHROME_TIMEOUT"));
      }, 20000);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(output);
        else reject(new Error("OFFLINE_CHROME_FAILED"));
      });
    });
    if (failure) throw failure;
    return dom;
  } finally {
    server.closeAllConnections();
    providerServer.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => providerServer.close(() => resolve()));
    // Only the unique fixture profile created above, never an existing browser profile.
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
