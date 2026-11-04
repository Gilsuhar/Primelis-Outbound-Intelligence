// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runtimeAccessFailures, runtimeAccessQuery, inspectRuntimeAccess } from "../../scripts/preview/runtime-access.mjs";

const profileOnly = () => ({ schema_usage: true, table_read: false, object_write: false,
  unexpected_column_read: false, memberships: false });
describe("effective runtime access from PostgreSQL catalog evidence", () => {
  it("accepts the five-column profile grant without whole-table read access", () => {
    expect(runtimeAccessFailures([profileOnly()])).toEqual([]);
  });
  it("distinguishes the two observed PUBLIC SELECT grants from usable view access", () => {
    const view = { ...profileOnly(), schema_usage: false, table_read: true, unexpected_column_read: true };
    expect(runtimeAccessFailures([profileOnly(), view, view])).toEqual([]);
    expect(runtimeAccessFailures([{ ...view, schema_usage: true }])).toEqual(["UNEXPECTED_EFFECTIVE_READ"]);
  });
  it.each([false, true])("rejects unexpected memberships even when effective schema usage is %s", schema_usage => {
    expect(runtimeAccessFailures([{ ...profileOnly(), schema_usage, memberships: true }])).toEqual(["ROLE_MEMBERSHIPS"]);
  });
  it.each(["table_read", "unexpected_column_read"])("rejects unexpected accessible extension grants: %s", flag => {
    expect(runtimeAccessFailures([{ ...profileOnly(), [flag]: true }])).toEqual(["UNEXPECTED_EFFECTIVE_READ"]);
  });
  it("rejects effective writes independently of allowed profile reads", () => {
    expect(runtimeAccessFailures([{ ...profileOnly(), object_write: true }])).toEqual(["UNEXPECTED_EFFECTIVE_WRITE"]);
  });
  it.each([undefined, [], [{}], [{ ...profileOnly(), schema_usage: null }]])("fails closed on incomplete catalog evidence %#", value => {
    expect(runtimeAccessFailures(value)).toEqual(["ACCESS_EVIDENCE_INCOMPLETE"]);
  });
  it("uses one fixed SELECT, without logging or requesting object contents", async () => {
    const reader = { $queryRawUnsafe: vi.fn().mockResolvedValue([profileOnly()]) };
    expect(await inspectRuntimeAccess(reader)).toEqual([]);
    expect(reader.$queryRawUnsafe).toHaveBeenCalledOnce();
    expect(reader.$queryRawUnsafe).toHaveBeenCalledWith(runtimeAccessQuery);
    const syntax = runtimeAccessQuery.replace(/'(?:[^']|'')*'/g, "''");
    expect(syntax).not.toMatch(/;|\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|SET|DO|CALL)\b/);
    expect(runtimeAccessQuery).toContain("has_schema_privilege('recycler_preview_app',n.oid,'USAGE')");
    expect(runtimeAccessQuery).not.toContain("FROM public.");
  });
  it("keeps schema checks in each SQL object guard, without exempting extensions", () => {
    const sql = readFileSync("scripts/preview/runtime-role.sql", "utf8");
    const guards = sql.slice(sql.indexOf("DO $privileges$")).split("OR EXISTS");
    for (const fn of ["has_table_privilege", "has_column_privilege('recycler_preview_app',c.oid",
      "has_function_privilege"]) {
      const part = guards.find(p => p.includes(fn));
      expect(part, fn).toContain("has_schema_privilege('recycler_preview_app',n.oid,'USAGE')");
    }
    expect(sql).not.toMatch(/NOT IN \([^)]*'extensions'|nspname\s*<>\s*'extensions'/);
    expect(sql).toContain("member=app_oid OR (roleid=app_oid");
    expect(sql).toContain("MAINTAIN");
    // Sequence operations can use OIDs without resolving a schema-qualified name.
    expect(guards.find(p => p.includes("has_sequence_privilege"))).not.toContain("has_schema_privilege");
  });
  it("never changes extension-owned routines or system-schema privileges", () => {
    const sql = readFileSync("scripts/preview/runtime-role.sql", "utf8");
    expect(sql).not.toContain("REVOKE EXECUTE ON ALL FUNCTIONS");
    expect(sql).not.toMatch(/REVOKE ALL ON ALL (?:TABLES|SEQUENCES)/);
    const revoke = sql.slice(sql.indexOf("DO $routines$"), sql.indexOf("END $routines$;"));
    expect(revoke).toContain("n.nspname='public'");
    expect(revoke).toContain("NOT EXISTS (SELECT 1 FROM pg_depend");
    expect(revoke).toContain("d.classid='pg_proc'::regclass");
    expect(revoke).toContain("d.objid=p.oid AND d.deptype='e'");
    expect(sql).not.toMatch(/ALTER TABLE|ALTER SCHEMA|INSERT INTO|UPDATE auth|GRANT .*auth\./);
  });
});
