/** Run in an approved always-on worker, never in a browser or a Vercel request. */
import { setTimeout as delay } from "node:timers/promises";
const target = new URL(process.env.WORKFORCE_PREVIEW_URL ?? "https://not-configured.invalid");
const secret = process.env.INTEGRATION_WORKER_SECRET;
if (
  target.protocol !== "https:" ||
  !target.hostname.endsWith(".vercel.app") ||
  target.username ||
  target.password ||
  target.search ||
  target.hash ||
  (target.pathname !== "/" && target.pathname !== "") ||
  !secret ||
  secret.length < 32
) {
  console.error(
    "Configure a reviewed Vercel Preview origin and a server-side worker secret of at least 32 characters.",
  );
  process.exit(1);
}
let stopping = false,
  failures = 0;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
do {
  try {
    const response = await fetch(new URL("/api/sales-agent/daily/worker", target), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(115000),
      headers: {
        authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
          : {}),
      },
      body: "{}",
    });
    if (!response.ok) {
      console.error(
        `Worker wake-up HTTP ${response.status}; credentials and response body withheld.`,
      );
      failures++;
    } else {
      console.log(
        "Authenticated daily-worker wake-up accepted; inspect persisted dashboard for actual run outcomes.",
      );
      failures = 0;
    }
  } catch {
    console.error(
      "Worker wake-up unavailable; retrying with bounded backoff, no response or credentials logged.",
    );
    failures++;
  }
  if (process.argv.includes("--once")) {
    if (failures) process.exitCode = 1;
    break;
  }
  if (!stopping) await delay(Math.min(300000, 60000 * 2 ** Math.min(failures, 3)));
} while (!stopping);
