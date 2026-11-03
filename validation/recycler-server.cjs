/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated test server. Production routes/authentication are not changed.
const http = require("node:http");
const next = require("next");
if (process.env.RECYCLER_ACCEPTANCE !== "synthetic-local-only") throw new Error("TEST_ONLY");
const app = next({ dev: true, hostname: "127.0.0.1", port: 3000 });
const handle = app.getRequestHandler();
app.prepare().then(() => {
  http
    .createServer((req, res) => {
      const pathname = new URL(req.url, "http://127.0.0.1:3000").pathname;
      // A provider route can never run in this harness, even if browser interception fails.
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(
          JSON.stringify({
            ok: false,
            message: "Synthetic acceptance server: provider operations disabled.",
          }),
        );
        return;
      }
      if (
        !["/sales-agent/recycler", "/local-login", "/login"].includes(pathname) &&
        !pathname.startsWith("/_next/") &&
        !pathname.startsWith("/brand/")
      ) {
        res.writeHead(404).end();
        return;
      }
      handle(req, res);
    })
    .listen(3000, "127.0.0.1", () => console.log("RECYCLER_ACCEPTANCE_READY"));
});
