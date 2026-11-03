// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { provisioningChecks, provisioningAuditQuery, failedProvisioningChecks } from "../../scripts/preview/role-provisioning-checks.mjs";
import { verificationRoleProposal } from "../../scripts/preview/verification-role-proposal.mjs";
import { privilegeQuery } from "../../scripts/preview/read-only-context.mjs";
import { reviewedFiles } from "../../scripts/preview/verification.mjs";
import target from "../../scripts/preview/verified-target.json";

describe("verification-role provisioning security audit", () => {
  const approved = () => Object.fromEntries(provisioningChecks.map(([id]) => [id, true]));
  it("reports only the four independently observed blockers", () => {
    expect(failedProvisioningChecks([{ ...approved(), IDENTITY_GRANT_AUTHORITY: false, AUTH_SCHEMA_GRANT_AUTHORITY: false,
      AUTH_POLICY_AUTHORITY: false, PUBLIC_ROUTINES_CLEARED: false }])).toEqual([
      "IDENTITY_GRANT_AUTHORITY", "AUTH_SCHEMA_GRANT_AUTHORITY", "AUTH_POLICY_AUTHORITY", "PUBLIC_ROUTINES_CLEARED",
    ]);
  });
  it.each(provisioningChecks.map(([id]) => id))("fails closed for %s before a role can be created", id => {
    for (const value of [false, null, undefined, "true"]) expect(failedProvisioningChecks([{ ...approved(), [id]: value }])).toEqual([id]);
    const sql = verificationRoleProposal();
    expect(sql.indexOf(`PREVIEW_VERIFY_${id}`)).toBeGreaterThan(sql.indexOf("PREVIEW_SETUP_TARGET_REJECTED"));
    expect(sql.indexOf(`PREVIEW_VERIFY_${id}`)).toBeLessThan(sql.indexOf("CREATE ROLE recycler_preview_verify"));
  });
  it("rejects missing, ambiguous and untrusted rows without exposing their contents", () => {
    for (const value of [null, [], [{}, {}], ["private-value"]])
      expect(failedProvisioningChecks(value)).toEqual(["PROVISIONING_RESULT_SHAPE"]);
    expect(failedProvisioningChecks([approved()])).toEqual([]);
  });
  it("restricts the audit to one fixed catalog SELECT and returns booleans only", () => {
    expect(provisioningAuditQuery).toMatch(/^SELECT /);
    const syntax = provisioningAuditQuery.replace(/'(?:[^']|'')*'/g, "''");
    expect(syntax).not.toMatch(/;|\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|SET|DO|CALL)\b/);
    expect(provisioningAuditQuery).not.toMatch(/rolpassword|prosrc|pg_get_functiondef|FROM auth\.users|FROM public\./);
  });
  it("retains all-column schema visibility on exactly the reviewed public tables, without future grants", () => {
    const sql = verificationRoleProposal(), files = reviewedFiles(target.migrations);
    const grants = [...sql.matchAll(/GRANT SELECT ON TABLE public\."([^"]+)" TO recycler_preview_verify;/g)].map(m => m[1]);
    expect(grants).toEqual(files.tables); expect(grants).toHaveLength(50);
    expect(sql).not.toMatch(/GRANT .* ON ALL TABLES|ALTER DEFAULT PRIVILEGES|GRANT .* WITH GRANT OPTION/);
  });
  it("limits Auth reads to a non-null ID and rejects wider Auth access at runtime", () => {
    const sql = verificationRoleProposal();
    expect(sql).toContain("GRANT SELECT (id) ON TABLE auth.users TO recycler_preview_verify;");
    expect(sql).not.toContain("GRANT SELECT ON TABLE auth.users");
    expect(sql).toContain("PREVIEW_VERIFY_AUTH_ID_NOT_NULL");
    expect(privilegeQuery).toContain("a.attname<>'id' AND has_column_privilege");
    expect(privilegeQuery).toContain("AS auth_id_only"); expect(privilegeQuery).toContain("AS auth_id_not_null");
    expect(readFileSync("scripts/preview/verification.mjs", "utf8")).toContain("count(id)::int FROM auth.users");
  });
  it("does not relax routine checks, acquire managed roles or revoke managed routine access", () => {
    const sql = verificationRoleProposal();
    expect(sql).toContain("PREVIEW_VERIFY_PUBLIC_ROUTINES_CLEARED");
    expect(sql).not.toMatch(/REVOKE EXECUTE|SET ROLE supabase|GRANT (?:postgres|supabase_admin|pg_monitor|pg_read_all_data)\b/);
    expect(sql).not.toContain("REVOKE CREATE ON SCHEMA public");
    expect(sql).toContain("PREVIEW_VERIFY_NO_PUBLIC_SCHEMA_CREATE");
    expect(sql).toContain("REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;");
  });
  it("checks API column grants as well as table grants before and after provisioning", () => {
    const before = verificationRoleProposal();
    const after = readFileSync("scripts/preview/verification.mjs", "utf8");
    for (const role of ["anon", "authenticated"]) {
      expect(before).toContain(`has_any_column_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')`);
      expect(after).toContain(`has_any_column_privilege('${role}', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')`);
    }
  });
});
