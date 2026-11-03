// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createWorkforceBuildInfo, workforceSources } from "../../scripts/workforce-build-info";
import { getWorkforceBuildInfo } from "./workforce-build-info";

const roots: string[] = [];
afterEach(() => {
  roots.forEach((root) => rmSync(root, { recursive: true, force: true }));
  roots.length = 0;
  vi.unstubAllEnvs();
});
function sourceRoot() {
  const root = mkdtempSync(join(tmpdir(), "workforce-build-"));
  roots.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "primelis-outbound-intelligence" }),
  );
  for (const path of workforceSources) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `source for ${path}`);
  }
  return root;
}
describe("safe source-based build identity", () => {
  it("detects stale source even when deployment commit metadata is unchanged", () => {
    const root = sourceRoot();
    const before = createWorkforceBuildInfo(root, "a".repeat(40));
    writeFileSync(join(root, workforceSources[1]), "old service source");
    const after = createWorkforceBuildInfo(root, "a".repeat(40));
    expect(after.gitCommit).toBe(before.gitCommit);
    expect(after.sourceFingerprint).not.toBe(before.sourceFingerprint);
    expect(after.sources[workforceSources[1]]).not.toBe(before.sources[workforceSources[1]]);
    expect(after.sources[workforceSources[2]]).toBe(before.sources[workforceSources[2]]);
  });
  it("fails on the wrong package root or missing application source", () => {
    const root = sourceRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "other-project" }));
    expect(() => createWorkforceBuildInfo(root)).toThrow("WORKFORCE_BUILD_ROOT_MISMATCH");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "primelis-outbound-intelligence" }),
    );
    rmSync(join(root, workforceSources[0]));
    expect(() => createWorkforceBuildInfo(root)).toThrow();
  });
  it("shares only validated metadata with the API and browser; malformed input is ignored", () => {
    const info = createWorkforceBuildInfo(sourceRoot(), "b".repeat(40));
    vi.stubEnv(
      "NEXT_PUBLIC_WORKFORCE_BUILD_INFO",
      JSON.stringify({ ...info, secret: "must-not-be-returned" }),
    );
    expect(getWorkforceBuildInfo()).toEqual(info);
    vi.stubEnv("NEXT_PUBLIC_WORKFORCE_BUILD_INFO", "not-json");
    expect(getWorkforceBuildInfo()).toBeNull();
    vi.stubEnv(
      "NEXT_PUBLIC_WORKFORCE_BUILD_INFO",
      JSON.stringify({ ...info, gitCommit: "not-a-sha" }),
    );
    expect(getWorkforceBuildInfo()).toBeNull();
  });
});
