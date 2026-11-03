// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { reviewedFiles } from "../../scripts/preview/verification.mjs";
import target from "../../scripts/preview/verified-target.json";
import manifest from "../../scripts/preview/reviewed-files.json";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const migration = (name: string) => read(`prisma/migrations/${name}/migration.sql`);
let generated: string;

beforeAll(() => {
  // The pinned engine generates SQL from the model offline. This SQL is never executed.
  const result = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"),
    "migrate", "diff", "--from-empty", "--to-schema-datamodel", resolve("prisma/schema.prisma"), "--script"], {
    encoding: "utf8", timeout: 30000,
    env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
      CHECKPOINT_DISABLE: "1", NODE_OPTIONS: process.env.NODE_OPTIONS,
      PRISMA_SCHEMA_ENGINE_BINARY: process.env.PRISMA_SCHEMA_ENGINE_BINARY },
  });
  expect(result.status).toBe(0);
  generated = result.stdout;
}, 40000);

describe("Prisma model preserves reviewed migration semantics", () => {
  it.each(["IntegrationState", "IntegrationAuditEvent"])("preserves %s user-key restriction and delete cascade", table => {
    const original = migration("20261016000000_read_only_integration_sync");
    expect(original).toContain('"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE');
    expect(original).not.toContain("ON UPDATE"); // PostgreSQL defaults to NO ACTION.
    expect(generated).toContain(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;`);
  });

  it("retains the composite identity boundary, FK name and cascade behavior", () => {
    const expected = 'ALTER TABLE "ProspectFact" ADD CONSTRAINT "ProspectFact_sourceId_fkey" FOREIGN KEY ("sourceId", "prospectId") REFERENCES "ProspectSource"("id", "prospectId") ON DELETE CASCADE ON UPDATE CASCADE;';
    const original = migration("20260823000100_prospect_memory_phase_1");
    expect(original.replace(/\s+/g, " ")).toContain(expected.replace('REFERENCES "ProspectSource"("id",', 'REFERENCES "ProspectSource"(id,'));
    expect(generated).toContain(expected);
    expect(generated).not.toContain('CONSTRAINT "ProspectFact_sourceId_prospectId_fkey"');
  });

  it.each(["retrievedKnowledgeIds", "sourceIds"])("preserves GeneratedDraft.%s empty-array default", field => {
    const original = migration("20260713000200_reply_to_prospect_drafts");
    expect(original).toContain(`ADD COLUMN "${field}" TEXT[] DEFAULT ARRAY[]::TEXT[]`);
    expect(original).toContain(`"${field}" = COALESCE("${field}", ARRAY[]::TEXT[])`);
    expect(original).toContain(`ALTER COLUMN "${field}" SET NOT NULL`);
    const draft = /CREATE TABLE "GeneratedDraft" \(([\s\S]*?)\n\);/.exec(generated)?.[1];
    expect(draft).toContain(`"${field}" TEXT[] DEFAULT ARRAY[]::TEXT[]`);
  });

  it("preserves all eleven applied migration checksums and the frozen lockfile", () => {
    // Pinned before schema reconciliation: do not regenerate this baseline to accept SQL edits.
    const entries = Object.entries(manifest).filter(([path]) => path.endsWith("migration.sql"));
    expect(entries).toHaveLength(11);
    expect(createHash("sha256").update(JSON.stringify(entries)).digest("hex"))
      .toBe("196f062d98d9183e75023f92a2e334822f9f1690488c105613e3fa156e592c3f");
    expect(manifest["pnpm-lock.yaml"]).toBe("5f90d08bf5035811dc009ea189c01b370189042e3bde09fb93d78da96738fecf");
    expect(reviewedFiles(target.migrations, path => Buffer.from(read(path))).tables).toHaveLength(50);
  });

  it("retains the database-only provider check and array null restrictions in applied SQL", () => {
    expect(migration("20261016000000_read_only_integration_sync"))
      .toContain('CHECK ("provider" IN (\'HUBSPOT\', \'OUTREACH\'))');
    // Prisma cannot model this CHECK. Never drop it to make model-generated DDL identical.
    expect(migration("20260713000300_account_assessments")).toMatch(/"verifiedSignals" TEXT\[\] NOT NULL/);
  });
});
