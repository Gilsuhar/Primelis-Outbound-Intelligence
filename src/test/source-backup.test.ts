// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it.skipIf(process.platform !== "win32")(
  "verifies a source snapshot while excluding environment files, dependencies and database files",
  () => {
    const root = mkdtempSync(join(tmpdir(), "aw-backup-regression-"));
    execFileSync("git", ["init", "--quiet", root]);
    for (const folder of ["src", "ci", "node_modules", "prisma", "outputs"])
      mkdirSync(join(root, folder));
    writeFileSync(join(root, ".gitignore"), "node_modules\noutputs\n");
    writeFileSync(join(root, "src", "safe.ts"), 'export const value = "safe";\n');
    writeFileSync(join(root, "ci", "pilot.ts"), 'export const enabled = false;\n');
    writeFileSync(join(root, "ci", ".env"), "FICTIONAL_SECRET=never-copy\n");
    const sample = 'export const fake = "sk-proj-' + "x".repeat(30) + '";\n';
    writeFileSync(join(root, "src", "sample.test.ts"), sample);
    writeFileSync(join(root, ".env.local"), "FICTIONAL_SECRET=never-copy\n");
    writeFileSync(join(root, "prisma", "test.db"), "not a database; excluded fixture");
    writeFileSync(join(root, "node_modules", "unused.js"), "excluded dependency");
    // An unborn Git HEAD is acceptable for snapshot testing; source inventory needs no commit.
    const output = execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        resolve("local-activation/Backup-Source.ps1"),
        "-RepositoryRoot",
        root,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const result = JSON.parse(output);
    expect(result.verified).toBe(true);
    const manifest = JSON.parse(readFileSync(join(result.directory, "verification.json"), "utf8"));
    expect(manifest.files.map((f: { path: string }) => f.path)).toEqual([
      ".gitignore",
      "ci/pilot.ts",
      "src/safe.ts",
      "src/sample.test.ts",
    ]);
    expect(
      manifest.files.find((f: { path: string }) => f.path.endsWith("sample.test.ts")).redacted,
    ).toBe(true);
    expect(manifest.excluded.map((f: { path: string }) => f.path)).toEqual([
      ".env.local",
      "ci/.env",
      "prisma/test.db",
    ]);
    expect(readFileSync(join(root, "src", "sample.test.ts"), "utf8")).toBe(sample);
    expect(JSON.stringify(manifest)).not.toContain("never-copy");
  },
  20000,
);
