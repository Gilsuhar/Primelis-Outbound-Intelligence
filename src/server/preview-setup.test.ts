// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { setupPlan, initializePreview as runInitialization } from "../../scripts/preview/setup.mjs";
import { reviewedFiles } from "../../scripts/preview/verification.mjs";
import target from "../../scripts/preview/verified-target.json";
const ref = target.projectRef;
const identity = () => [{ database: "postgres", operator: "postgres", fingerprint: target.clusterFingerprint }];
const initializePreview = (env: Record<string, string | undefined>, execute: boolean,
  dependencies: Pick<Parameters<typeof runInitialization>[2], "connect" | "migrate">) =>
  runInitialization(env, execute, { probe: vi.fn().mockResolvedValue({ tls: "verified" }),
    authorize: vi.fn().mockResolvedValue(undefined), diff: vi.fn().mockResolvedValue(undefined), ...dependencies });
const fixture = () => ({
  PREVIEW_SETUP_APPROVED_PROJECT_REF: ref,
  PREVIEW_SETUP_PROJECT_NAME: "agent-workforce-preview",
  PREVIEW_SETUP_APPROVAL: `initialize:${ref}`,
  PREVIEW_SETUP_APPROVED_ENDPOINT: `db.${ref}.supabase.co:5432`,
  PREVIEW_SETUP_DATABASE_URL: `postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/postgres?sslmode=require&sslaccept=strict`,
});
describe("operator-only fresh Preview schema preparation", () => {
  it("orders exactly the existing eleven migrations", () => {
    const plan = setupPlan(fixture());
    expect(plan.migrations).toHaveLength(11);
    expect(plan.migrations).toEqual([...plan.migrations].sort());
  });
  it.each([
    { VERCEL_ENV: "preview" }, { VERCEL_ENV: "production" }, { CI: "true" },
    { DATABASE_URL: "production" }, { DIRECT_URL: "production" },
    { PREVIEW_SETUP_APPROVED_PROJECT_REF: "mfxqiyidmdppvdzeboke" },
    { PREVIEW_SETUP_APPROVED_PROJECT_REF: "ofxqdwpyqbvskrcfpdmx" },
    { PREVIEW_SETUP_APPROVED_PROJECT_REF: "" }, { PREVIEW_SETUP_APPROVAL: "" },
    { PREVIEW_SETUP_APPROVED_ENDPOINT: "other:5432" },
    { PREVIEW_SETUP_DATABASE_URL: fixture().PREVIEW_SETUP_DATABASE_URL.replace("require", "disable") },
    { PREVIEW_SETUP_DATABASE_URL: fixture().PREVIEW_SETUP_DATABASE_URL.replace("strict", "accept_invalid_certs") },
    { PREVIEW_SETUP_DATABASE_URL: fixture().PREVIEW_SETUP_DATABASE_URL + "&sslmode=require" },
    { PREVIEW_SETUP_DATABASE_URL: fixture().PREVIEW_SETUP_DATABASE_URL + "&extra=true" },
  ])("rejects unsafe configuration before I/O: %j", async patch => {
    const connect = vi.fn();
    await expect(initializePreview({ ...fixture(), ...patch }, true, { connect, migrate: vi.fn() })).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
  it("plans without connecting", async () => {
    const connect = vi.fn();
    expect(await initializePreview(fixture(), false, { connect, migrate: vi.fn() })).toEqual({ status: "PLAN_VALIDATED", migrationCount: 11 });
    expect(connect).not.toHaveBeenCalled();
  });
  it.each([{ tables: [] }, { tables: [{ tablename: "existing" }] }])("requires a fresh public schema", async ({ tables }) => {
    const files = reviewedFiles(target.migrations);
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValueOnce(identity()).mockResolvedValueOnce(tables)
      .mockResolvedValueOnce(target.migrations.map(name => ({ migration_name: name,
        checksum: files.hashes[`prisma/migrations/${name}/migration.sql`], finished_at: new Date(),
        rolled_back_at: null, applied_steps_count: 1 })))
      .mockResolvedValueOnce(files.tables.map(name => ({ name, rls: true, api_access: false })))
      .mockResolvedValueOnce([{ auth_users: 0, runtime_roles: 0, policies: 0 }])
      .mockResolvedValueOnce(files.tables.slice(1).map(() => ({ count: 0 }))), $disconnect: vi.fn() };
    const migrate = vi.fn();
    const operation = initializePreview(fixture(), true, { connect: vi.fn().mockResolvedValue(db), migrate });
    if (tables.length) { await expect(operation).rejects.toThrow("NOT_EMPTY"); expect(migrate).not.toHaveBeenCalled(); }
    else { expect((await operation).status).toBe("SCHEMA_INITIALIZED_AND_VERIFIED"); expect(migrate).toHaveBeenCalledOnce(); }
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });
  it.each(["ofxqdwpyqbvskrcfpdmx", "mfxqiyidmdppvdzeboke", "aaaaaaaaaaaaaaaaaaaa"])(
    "rejects a self-consistent but unverified target %s before connecting", async other => {
      const env = Object.fromEntries(Object.entries(fixture()).map(([key, value]) => [key, value.replaceAll(ref, other)]));
      const connect = vi.fn();
      const migrate = vi.fn();
      await expect(initializePreview(env, true, { connect, migrate })).rejects.toThrow("CONFIGURATION_REJECTED");
      expect(connect).not.toHaveBeenCalled();
      expect(migrate).not.toHaveBeenCalled();
    },
  );
  it.each([
    [], [{}], [...identity(), ...identity()],
    [{ ...identity()[0], fingerprint: "different-cluster" }],
    [{ ...identity()[0], database: "other" }],
    [{ ...identity()[0], operator: "other" }],
  ].map(rows => ({ rows })))("rejects missing or mismatched server identity %#", async ({ rows }) => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue(rows), $disconnect: vi.fn() };
    const migrate = vi.fn();
    await expect(initializePreview(fixture(), true, { connect: vi.fn().mockResolvedValue(db), migrate })).rejects.toThrow("TARGET_REJECTED");
    expect(db.$queryRawUnsafe).toHaveBeenCalledOnce();
    expect(migrate).not.toHaveBeenCalled();
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });
  it("stops without retry when identity inspection is unavailable", async () => {
    const db = { $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("permission denied")), $disconnect: vi.fn() };
    const connect = vi.fn().mockResolvedValue(db);
    const migrate = vi.fn();
    await expect(initializePreview(fixture(), true, { connect, migrate })).rejects.toThrow("permission denied");
    expect(connect).toHaveBeenCalledOnce();
    expect(db.$queryRawUnsafe).toHaveBeenCalledOnce();
    expect(migrate).not.toHaveBeenCalled();
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });
  it("does not migrate over an existing view or enum", async () => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValueOnce(identity()).mockResolvedValueOnce([{ name: "existing_type_or_view" }]), $disconnect: vi.fn() };
    const migrate = vi.fn();
    await expect(initializePreview(fixture(), true, { connect: vi.fn().mockResolvedValue(db), migrate })).rejects.toThrow("NOT_EMPTY");
    expect(db.$queryRawUnsafe.mock.calls[1][0]).toContain("pg_catalog.pg_class");
    expect(db.$queryRawUnsafe.mock.calls[1][0]).toContain("pg_catalog.pg_type");
    expect(migrate).not.toHaveBeenCalled();
  });
  it("rejects substituted intermediate migrations even when count and endpoints match", () => {
    const changed = [...target.migrations];
    changed[4] = "20260713000401_unreviewed";
    expect(() => setupPlan(fixture(), changed)).toThrow("CONFIGURATION_REJECTED");
  });
  it("does not retry migration failure and always disconnects", async () => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValueOnce(identity()).mockResolvedValueOnce([]), $disconnect: vi.fn() };
    const migrate = vi.fn().mockRejectedValue(new Error("migration failure"));
    await expect(initializePreview(fixture(), true, { connect: vi.fn().mockResolvedValue(db), migrate })).rejects.toThrow("migration failure");
    expect(migrate).toHaveBeenCalledOnce();
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });
  it.each(["runtime-role.sql", "bind-test-user.sql"])("guards standalone %s before mutations in one transaction", file => {
    const sql = readFileSync(`scripts/preview/${file}`, "utf8").replace(/^--.*$/gm, "").trim();
    expect(sql).toMatch(/^BEGIN;\s+DO \$target\$/);
    const guardEnd = sql.indexOf("END $target$;");
    const guard = sql.slice(0, guardEnd);
    expect(guard).toContain("pg_catalog.pg_control_system()");
    expect(guard).toContain(target.clusterFingerprint);
    expect(guard).toContain("IS DISTINCT FROM");
    expect(guard).toContain("current_database() <> 'postgres'");
    expect(guard).toContain("session_user <> 'postgres'");
    expect(guard).toContain("RAISE EXCEPTION 'PREVIEW_SETUP_TARGET_REJECTED'");
    expect(guard).not.toContain("current_setting(");
    expect(guard).not.toMatch(/\b(CREATE ROLE|INSERT INTO|GRANT|REVOKE|ALTER TABLE)\b/);
    expect(sql.endsWith("COMMIT;")).toBe(true);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
    if (file === "runtime-role.sql") {
      expect(guard).toContain("PREVIEW_SETUP_MIGRATIONS_INCOMPLETE");
      expect(sql.indexOf("CREATE ROLE")).toBeGreaterThan(guardEnd);
      expect(sql).toContain("NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    } else {
      expect(guard).toContain("PREVIEW_SETUP_ROLE_NOT_READY");
      expect(sql.indexOf("INSERT INTO")).toBeGreaterThan(guardEnd);
      expect(sql).toContain("email_confirmed_at IS NOT NULL AND NOT coalesce(is_anonymous, false)");
      expect(sql).toContain("FOR SELECT TO recycler_preview_app");
      expect(sql).not.toContain("ON CONFLICT");
    }
  });
  it("does not add automatic migrations, workers or providers to build/install", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts.build).toBe("next build");
    expect(pkg.scripts.postinstall).toBe("prisma generate");
    for (const name of ["prebuild", "postbuild", "preinstall", "install"]) expect(pkg.scripts[name]).toBeUndefined();
  });
});
