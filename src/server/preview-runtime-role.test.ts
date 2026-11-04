// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import target from "../../scripts/preview/verified-target.json";

describe("prepared synthetic Preview runtime grants (static SQL contract)", () => {
  const sql = readFileSync("scripts/preview/runtime-role.sql", "utf8");
  it("checks the independently pinned target before role creation and commits only after privilege checks", () => {
    expect(sql.indexOf(target.clusterFingerprint)).toBeLessThan(sql.indexOf("CREATE ROLE"));
    expect(sql).toContain("pg_catalog.pg_control_system()");
    expect(sql.indexOf("PREVIEW_RUNTIME_EFFECTIVE_PRIVILEGES_REJECTED")).toBeLessThan(sql.lastIndexOf("COMMIT;"));
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
  });
  it("grants only connection, schema usage and the five columns used by Auth profile lookup", () => {
    expect(sql.match(/^GRANT .+;$/gm)).toEqual([
      "GRANT CONNECT ON DATABASE postgres TO recycler_preview_app;",
      "GRANT USAGE ON SCHEMA public TO recycler_preview_app;",
      'GRANT SELECT (id, "authUserId", email, name, role) ON public."User" TO recycler_preview_app;',
    ]);
    expect(sql).not.toMatch(/GRANT .*WITH GRANT OPTION|GRANT .*auth\.users|CREATE POLICY|ALTER TABLE/);
  });
  it("keeps the role inactive, unprivileged and read-only by default", () => {
    expect(sql).toContain("NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION");
    expect(sql).toContain("SET default_transaction_read_only = on");
    expect(sql).not.toMatch(/PASSWORD|GRANT postgres|GRANT supabase_admin/);
  });
  it("checks effective PUBLIC access, memberships, ownership, sequence and routine escape paths", () => {
    for (const check of ["pg_auth_members", "roleid=app_oid", "relowner=app_oid", "nspowner=app_oid",
      "has_database_privilege", "has_schema_privilege", "has_table_privilege", "has_any_column_privilege",
      "has_column_privilege", "has_sequence_privilege", "has_function_privilege", "relrowsecurity"])
      expect(sql).toContain(check);
    // Never revoke Supabase system-schema privileges to make an audit pass.
    expect(sql).not.toMatch(/REVOKE .* ON .* (?:auth|extensions|pg_catalog)\./);
  });
  it("binds only a confirmed, explicit SALES_USER with a row-specific SELECT policy", () => {
    const bind = readFileSync("scripts/preview/bind-test-user.sql", "utf8");
    expect(bind).toContain(target.clusterFingerprint);
    expect(bind).toContain("NOT rolreplication");
    expect(bind).toContain("email_confirmed_at IS NOT NULL AND NOT coalesce(is_anonymous, false)");
    expect(bind).toContain("FOR SELECT TO recycler_preview_app");
    expect(bind).toContain("role = ''SALES_USER''");
    expect(bind).not.toMatch(/ON CONFLICT|UPDATE auth|INSERT INTO auth/);
  });
});
