// @vitest-environment node
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
});
it("recovers after process death using disk checkpoints; a third process reads the same completed reports", () => {
  const require = createRequire(import.meta.url);
  const esbuild = createRequire(require.resolve("vite"))("esbuild") as {
    buildSync(options: Record<string, unknown>): void;
  };
  const root = resolve("outputs");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "company-queue-offline-")),
    entry = join(directory, "offline-worker.cjs");
  directories.push(directory);
  esbuild.buildSync({
    entryPoints: [resolve("src/test/company-queue-process.ts")],
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    alias: { "@": resolve("src"), "server-only": resolve("src/test/server-only.ts") },
    logLevel: "silent",
  });
  const env = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : [],
    ),
  );
  const invoke = (phase: string) =>
    spawnSync(process.execPath, [entry, directory, phase], {
      env: { ...env, NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 20000,
    });
  const crashed = invoke("crash");
  expect(crashed.status, crashed.stderr).toBe(73);
  const checkpoint = JSON.parse(readFileSync(join(directory, "fixture-state.json"), "utf8"));
  expect(checkpoint.jobs[2]).toMatchObject({ stage: "EXTRACT", status: "RUNNING" });
  expect(checkpoint.jobs[2].checkpoints).toHaveLength(2);
  const resumed = invoke("resume");
  expect(resumed.status, resumed.stderr).toBe(0);
  const report = JSON.parse(resumed.stdout);
  expect(report.jobs.map((j: { status: string }) => j.status)).toEqual([
    "COMPLETE",
    "COMPLETE",
    "COMPLETE",
  ]);
  expect(report.jobs.map((j: { findings: number }) => j.findings)).toEqual([1, 0, 1]);
  expect(report.jobs[2].recoveries).toBe(1);
  expect(report.jobs[2].checkpointCount).toBe(6);
  expect(
    report.jobs.every(
      (j: { usage: unknown[]; mode: string }) => !j.usage.length && j.mode === "SIMULATED",
    ),
  ).toBe(true);
  const reopened = invoke("inspect");
  expect(reopened.status, reopened.stderr).toBe(0);
  expect(JSON.parse(reopened.stdout)).toEqual(report);
  writeFileSync(
    join(directory, "ACCEPTANCE_REPORT.md"),
    `# Offline durable queue acceptance\n\nSIMULATED fixtures only; no live database or provider.\n\nA worker exited with code 73 after committing the Cedar extraction claim. A fresh process recovered after lease expiry. A third process reopened identical results.\n\n| Company | Queue | Research | Findings | Recovery |\n|---|---|---|---|---|\n${report.jobs.map((j: { runStatus: string; findings: number; recoveries: number }, i: number) => `| Simulated ${["Acme", "Birch", "Cedar"][i]} | COMPLETE | ${j.runStatus} | ${j.findings} | ${j.recoveries} |`).join("\n")}\n\nBirch's revenue guarantee was rejected by the simulated reviewer: the exact quote supports inventory software only. Reports and rejection audits survived process replacement. All sending/enrollment flags remain false.\n\nThis verifies the queue protocol through a test-only disk adapter, not actual PostgreSQL transaction behavior or a deployed service.\n`,
  );
}, 60000);
