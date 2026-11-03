// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { pilotTestEnv } from "./test-support";
it("the actual dispatcher calls only its fixture endpoint and rejects a LIVE or credential-contaminated environment", () => {
  mkdirSync(resolve("outputs"), { recursive: true });
  const directory = mkdtempSync(resolve("outputs/company-queue-offline-worker-")),
    mock = join(directory, "mock-network.mjs");
  writeFileSync(
    mock,
    `globalThis.fetch = async (url, init) => {
    if (url.href !== "https://fixture-pilot.vercel.app/api/sales-agent/company-queue/worker" || init.method !== "POST" || init.redirect !== "error" || init.body !== "{}") throw new Error("FORBIDDEN_ENDPOINT");
    return Response.json({ok: true, mode: "SIMULATED", providerRequests: 0});
  };`,
  );
  const env = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : [],
    ),
  );
  // The standalone dispatcher retains its existing local behavior; hosted Preview never runs it.
  const profile = { ...pilotTestEnv, PREVIEW_DATABASE_URL: undefined, VERCEL_ENV: undefined,
    NEXT_PUBLIC_VERCEL_ENV: undefined, VERCEL_PROJECT_ID: undefined, VERCEL_URL: undefined };
  const invoke = (patch: Partial<NodeJS.ProcessEnv> = {}) =>
    spawnSync(
      process.execPath,
      ["--import", pathToFileURL(mock).href, resolve("scripts/company-pilot-worker.mjs"), "--once"],
      { env: { ...env, ...profile, ...patch }, encoding: "utf8", timeout: 10000 },
    );
  const accepted = invoke();
  expect(accepted.status, accepted.stderr).toBe(0);
  expect(accepted.stdout).toContain("Fixture worker wake completed");
  const previewDenied = invoke({ VERCEL_ENV: "preview" });
  expect(previewDenied.status).toBe(1);
  expect(previewDenied.stderr).toContain("PREVIEW_OPERATION_DENIED:worker");
  expect(previewDenied.stdout).not.toContain("Fixture worker wake completed");
  for (const patch of [
    { COMPANY_PILOT_MODE: "LIVE" },
    { OPENAI_API_KEY: "fictional-forbidden-value" },
    { COMPANY_PILOT_MAX_RETRIES: "1" },
  ]) {
    const denied = invoke(patch);
    expect(denied.status).toBe(1);
    expect(denied.stderr).toContain("configuration rejected");
    expect(denied.stderr).not.toContain("fictional-forbidden-value");
  }
});
