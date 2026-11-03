import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { verificationError } from "./verification-errors.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
export const sha256 = value => createHash("sha256").update(value).digest("hex");
const normalized = value => value.toString("utf8").replace(/\r\n/g, "\n");

export function reviewedFiles(names, read = path => readFileSync(resolve(root, path))) {
  const manifest = JSON.parse(read("scripts/preview/reviewed-files.json"));
  const files = ["pnpm-lock.yaml", "prisma/schema.prisma", ...names.map(name => `prisma/migrations/${name}/migration.sql`)];
  if (files.length !== Object.keys(manifest).length) throw new Error("PREVIEW_SETUP_FILES_CHANGED");
  const hashes = {};
  const tables = [];
  for (const file of files) {
    const data = read(file);
    if (sha256(normalized(data)) !== manifest[file]) throw new Error("PREVIEW_SETUP_FILES_CHANGED");
    hashes[file] = sha256(data); // Prisma stores the actual file bytes, including line endings.
    if (file.endsWith("migration.sql")) {
      for (const match of normalized(data).matchAll(/CREATE TABLE "([A-Za-z_][A-Za-z0-9_]*)"/g)) tables.push(match[1]);
    }
  }
  return { hashes, tables: [...tables, "_prisma_migrations"].sort() };
}

export async function verifyInitializedSchema(db, plan, files, restricted = false) {
  let stage = "HISTORY";
  try {
    const rows = await db.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM public._prisma_migrations ORDER BY migration_name');
    if (rows.length !== 11 || rows.some((row, index) => row.migration_name !== plan.migrations[index] ||
        row.checksum !== files.hashes[`prisma/migrations/${row.migration_name}/migration.sql`] ||
        !row.finished_at || row.rolled_back_at !== null || row.applied_steps_count !== 1))
      throw new Error("PREVIEW_SETUP_HISTORY_VERIFICATION_FAILED");
    stage = "TABLE_RLS";
    const tables = await db.$queryRawUnsafe(
      "SELECT c.relname AS name, c.relrowsecurity AS rls, " +
      "(has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR " +
      "has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR " +
      "has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') OR " +
      "has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) AS api_access " +
      "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname COLLATE \"C\"",
    );
    if (JSON.stringify(tables.map(row => row.name)) !== JSON.stringify(files.tables) ||
        tables.some(row => row.rls !== true || row.api_access !== false))
      throw new Error("PREVIEW_SETUP_RLS_VERIFICATION_FAILED");
    stage = "UNEXPECTED_OBJECTS";
    const untouched = await db.$queryRawUnsafe(
      "SELECT (SELECT count(id)::int FROM auth.users) AS auth_users, " +
      "(SELECT count(*)::int FROM pg_roles WHERE rolname='recycler_preview_app') AS runtime_roles, " +
      "(SELECT count(*)::int FROM pg_policies WHERE schemaname='public') AS policies",
    );
    if (untouched.length !== 1 || untouched[0].auth_users !== 0 || untouched[0].runtime_roles !== 0 || untouched[0].policies !== (restricted ? files.tables.length : 0))
      throw new Error("PREVIEW_SETUP_UNEXPECTED_OBJECTS");
    if (restricted) {
      // SELECT-only policies scoped solely to the verifier allow truthful counts under RLS.
      // Do not treat invisible rows as evidence of an empty database.
      const policies = await db.$queryRawUnsafe("SELECT schemaname, tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check " +
        "FROM pg_catalog.pg_policies WHERE schemaname='public' OR (schemaname='auth' AND tablename='users') ORDER BY schemaname, tablename COLLATE \"C\"");
      const expected = ["auth.users", ...files.tables.map(name => `public.${name}`)];
      if (JSON.stringify(policies.map(p => `${p.schemaname}.${p.tablename}`)) !== JSON.stringify(expected) ||
          policies.some(p => p.policyname !== "recycler_preview_verify_select" || p.permissive !== "PERMISSIVE" ||
            p.roles !== "{recycler_preview_verify}" || p.cmd !== "SELECT" || p.qual !== "true" || p.with_check !== null))
        throw new Error("PREVIEW_SETUP_RLS_VERIFICATION_FAILED");
    }
    // Counts only; never select customer data. Identifiers come only from reviewed migration files.
    stage = "EMPTY_DATA";
    const counts = await db.$queryRawUnsafe(files.tables.filter(name => name !== "_prisma_migrations")
      .map(name => `SELECT count(*)::int AS count FROM public."${name}"`).join(" UNION ALL "));
    if (counts.some(row => row.count !== 0) || counts.length !== files.tables.length - 1)
      throw new Error("PREVIEW_SETUP_UNEXPECTED_DATA");
    return { migrationCount: rows.length, tableCount: tables.length, checksums: "verified", rls: "verified", apiAccess: "denied" };
  } catch (error) { throw verificationError(error, stage); }
}
