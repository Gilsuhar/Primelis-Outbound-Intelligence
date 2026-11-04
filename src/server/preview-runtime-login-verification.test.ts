// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { verifyRuntimePrisma, runtimeSessionQuery, deniedRuntimeReads } from "../../scripts/preview/verify-runtime-prisma.mjs";
import { runtimeAccessQuery } from "../../scripts/preview/runtime-access.mjs";
import { approvedAuthUserId, approvedEmail } from "../../scripts/preview/bind-profile.mjs";
import { runtimeDatabaseUrl } from "../lib/preview-runtime-tls";
import { previewFixture } from "../test/preview-fixture";

const fields = ["database_match", "role_match", "transaction_read_only", "default_read_only", "attributes", "memberships",
  "database_privileges", "schema_privileges", "ownership", "sequences", "routines", "profile_columns", "grant_options", "rls_api"];
function fixture() {
  const evidence = Object.fromEntries(fields.map(field => [field, true]));
  const access = { schema_usage: true, table_read: false, object_write: false, unexpected_column_read: false, memberships: false };
  const profile = { id: "preview-" + approvedAuthUserId, authUserId: approvedAuthUserId, email: approvedEmail, name: "Preview reviewer", role: "SALES_USER" };
  const tx = {
    $queryRawUnsafe: vi.fn(async (query: string): Promise<unknown> => {
      if (query === runtimeSessionQuery) return [evidence];
      if (query === runtimeAccessQuery) return [access];
      if (deniedRuntimeReads.includes(query)) throw { code: "P2010", meta: { code: "42501" } };
      throw new Error("UNREVIEWED_QUERY");
    }),
    user: { findFirst: vi.fn().mockResolvedValueOnce(profile).mockResolvedValueOnce(null), findMany: vi.fn().mockResolvedValue([profile]) },
  };
  const client = { $transaction: vi.fn(async (run: (reader: typeof tx) => Promise<void>) => run(tx)) };
  return { client, tx, evidence, access, profile };
}

describe("prepared real-runtime Prisma acceptance (mocked here; no live compatibility claim)", () => {
  it("checks the real lookup shape and separately protects every permission-probe transaction", async () => {
    const f = fixture();
    expect(await verifyRuntimePrisma(f.client)).toEqual({ status: "RUNTIME_PRISMA_VERIFIED", visibleProfiles: 1,
      allowedColumns: 5, deniedReads: 4, writePrivileges: "DENIED", readOnly: "VERIFIED" });
    expect(f.client.$transaction).toHaveBeenCalledTimes(5);
    expect(f.tx.$queryRawUnsafe.mock.calls.filter(([q]) => q === runtimeSessionQuery)).toHaveLength(5);
    expect(f.tx.user.findFirst).toHaveBeenNthCalledWith(1, { where: { OR: [{ authUserId: approvedAuthUserId },
      { email: { equals: approvedEmail, mode: "insensitive" } }] }, select: { id: true, authUserId: true, email: true, name: true, role: true } });
    expect(f.tx.$queryRawUnsafe.mock.calls.map(([q]) => q).filter(q => deniedRuntimeReads.includes(q))).toEqual(deniedRuntimeReads);
  });
  it.each(fields)("fails closed on incorrect session/catalog evidence: %s", async field => {
    const f = fixture(); f.evidence[field] = false;
    await expect(verifyRuntimePrisma(f.client)).rejects.toThrow("SESSION");
    expect(f.tx.$queryRawUnsafe).toHaveBeenCalledTimes(1); expect(f.tx.user.findFirst).not.toHaveBeenCalled();
  });
  it.each([{ rows: [] }, { rows: [{ role_match: true }] }, { rows: [{}, {}] }])("rejects incomplete or ambiguous evidence %#", async ({ rows }) => {
    const f = fixture(); f.tx.$queryRawUnsafe.mockResolvedValueOnce(rows);
    await expect(verifyRuntimePrisma(f.client)).rejects.toThrow("SESSION");
  });
  it.each(["table_read", "object_write", "unexpected_column_read", "memberships"] as const)("rejects unexpected %s", async key => {
    const f = fixture(); f.access[key] = true;
    await expect(verifyRuntimePrisma(f.client)).rejects.toThrow("PRIVILEGES");
    expect(f.tx.user.findFirst).not.toHaveBeenCalled();
  });
  it("rejects an unapproved visible profile", async () => {
    const f = fixture(); f.tx.user.findMany.mockResolvedValue([f.profile, { ...f.profile, id: "unapproved" }]);
    await expect(verifyRuntimePrisma(f.client)).rejects.toThrow("VISIBLE_PROFILES");
  });
  it("rejects a mismatched authorized profile", async () => {
    const f = fixture(); f.tx.user.findFirst.mockReset().mockResolvedValue({ ...f.profile, role: "KNOWLEDGE_ADMIN" });
    await expect(verifyRuntimePrisma(f.client)).rejects.toThrow("PROFILE");
  });
  it("rejects an unrelated lookup returning a row", async () => {
    const f = fixture(); f.tx.user.findFirst.mockReset().mockResolvedValue(f.profile);
    await expect(verifyRuntimePrisma(f.client)).rejects.toThrow("UNAUTHORIZED_PROFILE");
  });
  it("does not count network errors as expected permission denials", async () => {
    const f = fixture(); f.tx.$queryRawUnsafe.mockImplementation(async q => {
      if (q === runtimeSessionQuery) return [f.evidence]; if (q === runtimeAccessQuery) return [f.access];
      throw new Error("PRIVATE_CONNECTION_DETAIL");
    });
    await expect(verifyRuntimePrisma(f.client)).rejects.toThrow("PREVIEW_RUNTIME_VERIFY_CONNECTION_OR_QUERY");
    expect(f.client.$transaction).toHaveBeenCalledTimes(2);
  });
  it("does not count a session-query permission error as the intended denial probe", async () => {
    const f = fixture(); let sessionCount = 0;
    f.tx.$queryRawUnsafe.mockImplementation(async q => {
      if (q === runtimeSessionQuery) {
        if (++sessionCount > 1) throw { code: "P2010", meta: { code: "42501" } };
        return [f.evidence];
      }
      if (q === runtimeAccessQuery) return [f.access];
      throw new Error("INTENDED_PROBE_MUST_NOT_RUN");
    });
    await expect(verifyRuntimePrisma(f.client)).rejects.toThrow("CONNECTION_OR_QUERY");
    expect(f.client.$transaction).toHaveBeenCalledTimes(2);
    expect(f.tx.$queryRawUnsafe.mock.calls.some(([q]) => deniedRuntimeReads.includes(q))).toBe(false);
  });
  it("rejects successful access to an unauthorized column/table", async () => {
    const f = fixture(); f.tx.$queryRawUnsafe.mockImplementation(async q => q === runtimeSessionQuery ? [f.evidence] : q === runtimeAccessQuery ? [f.access] : []);
    await expect(verifyRuntimePrisma(f.client)).rejects.toThrow("DENIED_READ_SUCCEEDED");
  });
  it("never runs DDL/DML or activation as a negative test", () => {
    for (const query of [runtimeSessionQuery, runtimeAccessQuery, ...deniedRuntimeReads]) {
      expect(query.trim()).toMatch(/^SELECT\b/);
      const syntax = query.replace(/'(?:[^']|'')*'/g, "''");
      expect(syntax).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|COPY|TRUNCATE)\b/i);
    }
    const source = readFileSync("scripts/preview/verify-runtime-prisma.mjs", "utf8");
    expect(source).not.toMatch(/process\.env|new PrismaClient|\.\$executeRaw|execFile|spawn\(|randomBytes|console\./);
  });
  it.each([undefined, "", "postgresql://postgres:synthetic@invalid.test/postgres"])("runtime URL fails closed without valid restricted credentials %#", value => {
    expect(() => runtimeDatabaseUrl({ ...previewFixture(), PREVIEW_DATABASE_URL: value })).toThrow("ISOLATION_REQUIRED");
  });
});
