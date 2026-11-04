// Real isolated Chrome + actual Next page; synthetic transport and read-only profile fixture.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "outputs/recycler-acceptance");
await mkdir(output, { recursive: true });
const origin = "http://127.0.0.1:3000";
// Never attach this fixture to an existing app or load local credential files.
assert.deepEqual(
  (await readdir(root)).filter((name) => /^\.env($|\.)/.test(name) && name !== ".env.example"),
  [],
  "Remove credential files from this isolated test checkout before running",
);
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(3000, "127.0.0.1", resolve);
});
await new Promise((resolve) => probe.close(resolve));
const token = randomBytes(32).toString("hex");
const env = { ...process.env };
for (const key of Object.keys(env))
  if (
    /^(DATABASE|DIRECT_URL|PREVIEW_|NEXT_PUBLIC_|SUPABASE|OPENAI|ANTHROPIC|AI_|HUBSPOT|OUTREACH|INTEGRATION|WORKFORCE|LOCAL_|COMPANY_|NEON|VERCEL|GETLEADS|ZEROBOUNCE|VERIFICATION|SERPAPI|WRITE_)/.test(
      key,
    ) ||
    /(TOKEN|SECRET|PASSWORD|API_KEY|ENCRYPTION)/.test(key)
  )
    delete env[key];
Object.assign(env, {
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  AI_PROVIDER: "mock",
  RECYCLER_ACCEPTANCE: "synthetic-local-only",
  LOCAL_DEV_LOGIN: "true",
  LOCAL_DEV_SESSION_TOKEN: token,
  INTEGRATION_OPERATOR_USER_ID: "local-development-agent-workforce",
  DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:5432/agent_workforce_test",
  NODE_OPTIONS: `--require="${join(root, "validation/recycler-profile.cjs").replaceAll("\\", "/")}"`,
});
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`TIMEOUT: ${label}`);
}
const log = createWriteStream(join(output, "server.log"));
const server = spawn(process.execPath, ["validation/recycler-server.cjs"], {
  cwd: root,
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(log);
server.stderr.pipe(log);
const profile = await mkdtemp(join(tmpdir(), "recycler-acceptance-"));
let chrome, ws;
const report = { checks: [], observations: {}, errors: [], externalRequests: [], screenshots: [] };
let sequence = 0;
const pending = new Map();
const handlers = new Map();
let pendingRead;
let readCount = 0;
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const text = () => evaluate('document.body?.innerText ?? ""');
async function click(label) {
  await evaluate(
    `(() => { const e = [...document.querySelectorAll('button,summary')].find(e => e.getAttribute('aria-label') === ${JSON.stringify(label)} || e.textContent.trim() === ${JSON.stringify(label)}); if (!e) throw Error('Control not found'); e.click(); })()`,
  );
  await delay(150);
}
async function change(label, value) {
  await evaluate(
    `(() => { const e = document.querySelector('[aria-label="${label}"]'); const setter = Object.getOwnPropertyDescriptor(e.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLSelectElement.prototype, 'value').set; setter.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName === 'INPUT' ? 'input' : 'change', { bubbles: true })); })()`,
  );
  await delay(100);
}
async function screenshot(name) {
  const image = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(output, name + ".png"), Buffer.from(image.data, "base64"));
  report.screenshots.push(name + ".png");
}
function check(name, value) {
  assert.ok(value, name);
  report.checks.push(name);
}
async function completeRead(status, body, contentType = "application/json") {
  await until(() => pendingRead, "explicit read request");
  const requestId = pendingRead;
  pendingRead = undefined;
  await send("Fetch.fulfillRequest", {
    requestId,
    responseCode: status,
    responseHeaders: [{ name: "Content-Type", value: contentType }],
    body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)).toString("base64"),
  });
  await until(async () => !(await text()).includes("Reading…"), "read completes");
}
try {
  await until(
    async () => {
      if (server.exitCode !== null) throw new Error("Acceptance server exited; inspect server.log");
      try {
        return (await fetch(origin + "/local-login")).ok;
      } catch {
        return false;
      }
    },
    "Next ready",
    120000,
  );
  const anonymous = await fetch(origin + "/sales-agent/recycler", { redirect: "manual" });
  check(
    "anonymous request still requires local session",
    anonymous.status === 307 && anonymous.headers.get("location")?.includes("/local-login"),
  );
  const invalidSession = await fetch(origin + "/sales-agent/recycler", {
    redirect: "manual",
    headers: { Cookie: "primelis-local-development=invalid" },
  });
  check("invalid session rejected", invalidSession.status === 307);
  const blockedApi = await fetch(origin + "/api/sales-agent/recycler", { method: "POST" });
  check("test server cannot invoke provider route", blockedApi.status === 503);
  chrome = spawn(
    process.env.OUTREACH_TEST_CHROME ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--headless=new",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  const port = await until(async () => {
    try {
      return (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
    } catch {
      return false;
    }
  }, "Chrome ready");
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call?.reject(new Error(JSON.stringify(message.error)));
      else call?.resolve(message.result);
    } else handlers.get(message.method)?.(message.params);
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  handlers.set("Runtime.exceptionThrown", ({ exceptionDetails }) =>
    report.errors.push(
      exceptionDetails.text + ": " + (exceptionDetails.exception?.description ?? ""),
    ),
  );
  handlers.set("Fetch.requestPaused", async ({ requestId, request }) => {
    const url = new URL(request.url);
    if (url.origin !== origin) {
      report.externalRequests.push(url.origin);
      await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    } else if (url.pathname === "/api/sales-agent/recycler" && request.method === "POST") {
      readCount++;
      pendingRead = requestId; // Deliberate loading state; fixtures are fulfilled below.
    } else await send("Fetch.continueRequest", { requestId });
  });
  await send("Fetch.enable", { patterns: [{ urlPattern: "http*" }] });
  await send("Network.setCookie", {
    name: "primelis-local-development",
    value: token,
    url: origin,
    httpOnly: true,
    sameSite: "Strict",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: origin + "/sales-agent/recycler" });
  await until(
    async () => (await text()).includes("6 candidates reviewed"),
    "synthetic page",
    120000,
  );
  await delay(1000);
  check(
    "synthetic discovery and decisions",
    (await text()).includes("1 eligible · 4 on hold · 1 disqualified"),
  );
  check("page rendering does not collect providers", readCount === 0);
  check(
    "navigation destination has a visible label",
    await evaluate(
      "[...document.querySelectorAll('a[href=\"/sales-agent/recycler\"]')].every(e => e.textContent.includes('Daily Prospect Recycler'))",
    ),
  );
  await screenshot("desktop-workspace");
  await click("Inspect Alex Example (fictional)");
  check(
    "details receive keyboard focus",
    await evaluate("document.activeElement.textContent === 'Prospect details'"),
  );
  check(
    "opening details brings them into view",
    await evaluate(
      "document.activeElement.getBoundingClientRect().top >= 0 && document.activeElement.getBoundingClientRect().top < innerHeight",
    ),
  );
  await screenshot("desktop-details");
  check(
    "research, email drafts and review boundary",
    /Fictional research and drafts/.test(await text()) &&
      /First email:/.test(await text()) &&
      /Sending not approved/.test(await text()),
  );
  check(
    "each email is explicitly unsent and pending review",
    await evaluate(
      "[...document.querySelectorAll('article p')].filter(e => e.textContent === 'Draft only · Pending human review · Not sent').length === 2",
    ),
  );
  await click("Company qualification and source observations");
  check(
    "owner gate and company thresholds visible",
    /HubSpot owner: 1087915602/.test(await text()) &&
      /80 employees and USD 30 million/.test(await text()),
  );
  await click("Activity timeline");
  check("outbound timeline visible", /HUBSPOT OUTBOUND SENT/.test(await text()));
  report.observations.detailFocus = await evaluate("document.activeElement.tagName");
  await click("Evidence coverage and timestamps");
  check(
    "authoritative Outreach no-record evidence visible",
    /OUTREACH history: NOT_PRESENT; authoritative: yes/.test(await text()),
  );
  await click("Close details");
  check(
    "closing details restores focus",
    await evaluate(
      "document.activeElement.getAttribute('aria-label') === 'Inspect Alex Example (fictional)'",
    ),
  );
  check(
    "confirmed unsubscribe shown in disqualified row",
    await evaluate(
      "[...document.querySelectorAll('tbody tr')].find(e => e.textContent.includes('Casey Optout')).textContent.toLowerCase().includes('unsubscribed')",
    ),
  );
  await change("Search candidates", "nothing-matches");
  check("filtered empty state", (await text()).includes("No candidates match"));
  await click("Show offline demo");
  report.observations.demoRestoresVisibleRows = !(await text()).includes("No candidates match");
  check("demo reset clears filters", report.observations.demoRestoresVisibleRows);
  await change("Search candidates", "");
  await change("Review status", "HOLD");
  check("hold filter", (await text()).includes("Prospect review (4)"));
  await change("Review status", "ALL");
  await change("Sort candidates", "NAME");
  report.observations.sortedNames = await evaluate(
    "[...document.querySelectorAll('tbody button')].map(e => e.textContent)",
  );
  check(
    "contact sort is alphabetical",
    JSON.stringify(report.observations.sortedNames) ===
      JSON.stringify([...report.observations.sortedNames].sort((a, b) => a.localeCompare(b))),
  );
  await change("Sort candidates", "COMPANY");
  check(
    "company sorting",
    await evaluate(
      "document.querySelector('tbody tr td').textContent.trim().startsWith('example.com')",
    ),
  );
  await change("Sort candidates", "OUTBOUND_OLDEST");
  check(
    "oldest outbound sorting",
    await evaluate(
      "document.querySelector('tbody button').textContent === 'Alex Example (fictional)'",
    ),
  );
  await change("Sort candidates", "OUTBOUND_NEWEST");
  check(
    "newest outbound sorting",
    await evaluate("document.querySelector('tbody button').textContent === 'Jordan Delivery'"),
  );
  check(
    "ambiguous same-email prospects remain separate and held",
    await evaluate(
      "[...document.querySelectorAll('tbody tr')].filter(e => e.textContent.includes('Sam Conflict') && e.textContent.includes('HOLD')).length === 2",
    ),
  );
  await change("Search candidates", "synthetic-hubspot");
  check("HubSpot ID search", (await text()).includes("Prospect review (1)"));
  await click("Clear filters");
  await click("Inspect Jordan Delivery");
  await click("Evidence coverage and timestamps");
  check(
    "incomplete Outreach history never clears eligibility",
    /OUTREACH history: PARTIAL; authoritative: no/.test(await text()) &&
      (await evaluate(
        "document.querySelector('article').innerText.includes('HOLD') && !document.querySelector('article').innerText.includes('First email:')",
      )),
  );
  await click("Close details");
  await click("Read up to 5 live records");
  check(
    "pending read visibly preserves previous evaluation",
    /Reading prospects/.test(await text()) && /6 candidates reviewed/.test(await text()),
  );
  check(
    "read button disabled while pending",
    await evaluate(
      "[...document.querySelectorAll('button')].find(e => e.textContent === 'Reading…').disabled",
    ),
  );
  await screenshot("desktop-loading");
  await completeRead(503, "<html>synthetic upstream failure</html>", "text/html");
  check(
    "non-JSON failure has actionable message and preserves prior list",
    /Prospects could not be loaded/.test(await text()) &&
      /6 candidates reviewed/.test(await text()) &&
      !(await text()).includes("Unexpected token"),
  );
  await screenshot("desktop-failure");
  check("no automatic retry", readCount === 1);
  const fixture = JSON.parse(
    await readFile(join(root, "src/data/fixtures/recycler-product-row.json"), "utf8"),
  );
  const empty = {
    mode: "DEMO",
    evaluatedAt: fixture.decision.evaluatedAt,
    rows: [],
    issues: [],
    discovery: [{ provider: "HUBSPOT", status: "COMPLETE", count: 0 }],
  };
  await click("Read up to 5 live records");
  await completeRead(200, { ok: true, data: empty });
  check(
    "empty collection is distinct from filters and never grants clearance",
    /No prospects were returned/.test(await text()) &&
      /empty list is not clearance/.test(await text()),
  );
  check(
    "empty collection cannot export eligible prospects",
    await evaluate(
      "[...document.querySelectorAll('button')].find(e => e.textContent === 'Export eligible Top 50').disabled",
    ),
  );
  await screenshot("desktop-empty");
  await click("Read up to 5 live records");
  await completeRead(200, {
    ok: true,
    data: { ...empty, issues: [{ resource: "history", code: "HISTORY_INCOMPLETE" }] },
  });
  check(
    "partial collection explains missing coverage",
    /Collection incomplete: history: HISTORY_INCOMPLETE/.test(await text()),
  );
  await screenshot("desktop-incomplete");
  await click("Show offline demo");
  check(
    "demo reset restores all six candidates after empty collection",
    /6 candidates reviewed/.test(await text()),
  );
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: output });
  await rm(join(output, "recycler-demo-top50.csv"), { force: true });
  await click("Export eligible Top 50");
  const csv = await until(async () => {
    try {
      return await readFile(join(output, "recycler-demo-top50.csv"), "utf8");
    } catch {
      return false;
    }
  }, "synthetic review export");
  check(
    "export contains only eligible fictional row and review boundary",
    csv.includes("Alex Example (fictional)") &&
      !csv.includes("Casey Optout") &&
      csv.includes("not approved to send"),
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate("window.scrollTo(0,0)");
  await screenshot("mobile-workspace");
  report.observations.mobileWidths = await evaluate(
    "({ viewport: innerWidth, document: document.documentElement.scrollWidth })",
  );
  check(
    "mobile page has no horizontal overflow",
    report.observations.mobileWidths.document === 390,
  );
  await evaluate("document.querySelector('[aria-label=\"Scrollable prospect table\"]').focus()");
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await delay(300);
  check(
    "mobile table supports keyboard horizontal scrolling",
    await evaluate(
      "document.querySelector('[aria-label=\"Scrollable prospect table\"]').scrollLeft > 0",
    ),
  );
  await screenshot("mobile-table");
  await click("Inspect Alex Example (fictional)");
  report.observations.detailsAutoVisible = await evaluate(
    "document.activeElement.getBoundingClientRect().top < innerHeight",
  );
  check("mobile details are brought into view", report.observations.detailsAutoVisible);
  await screenshot("mobile-details");
  await evaluate(
    "[...document.querySelectorAll('article h4')].find(e => e.textContent.startsWith('First email:')).parentElement.scrollIntoView()",
  );
  await screenshot("mobile-draft");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 740,
    deviceScaleFactor: 1,
    mobile: true,
  });
  check(
    "narrow mobile details do not overflow",
    await evaluate("document.documentElement.scrollWidth === 320"),
  );
  check(
    "no send/enroll/approve controls",
    await evaluate(
      "![...document.querySelectorAll('button')].some(e => /^(send|enroll|approve)\\b/i.test(e.textContent.trim()))",
    ),
  );
  check("no external browser requests", report.externalRequests.length === 0);
  check("no browser runtime exceptions", report.errors.length === 0);
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
  if (ws?.readyState === WebSocket.OPEN) {
    await writeFile(join(output, "failure-visible.txt"), await text());
    await screenshot("failure-state");
  }
} finally {
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  ws?.close();
  chrome?.kill();
  server.kill();
  log.end();
  // Only the unique profile generated above; never an existing browser profile.
  assert.equal(dirname(profile), resolve(tmpdir()));
  assert.ok(profile.startsWith(join(resolve(tmpdir()), "recycler-acceptance-")));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
