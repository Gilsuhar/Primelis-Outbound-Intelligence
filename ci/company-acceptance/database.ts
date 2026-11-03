import type { MinimalPrismaClient } from "../../src/lib/prisma";
import { PostgresQueuePersistence } from "../../src/server/agent-workforce/company-queue/postgres-store";
import { auditSchema, type Audit, type AuditStore } from "./acceptance";
import { checksum, fail, type Approval } from "./policy";
import { requireVerifiedCiTransport } from "./transport";

export async function verifyDatabase(db: MinimalPrismaClient, a: Approval, approvalHash: string) {
  requireVerifiedCiTransport(db, a);
  const rows = await db.$queryRaw<
    {
      database: string;
      role: string;
      elevated: boolean;
      databaseCreate: boolean;
      schemaCreate: boolean;
      ownsObjects: boolean;
      canDelete: boolean;
      inheritedRoles: boolean;
    }[]
  >`
    SELECT current_database() AS database, current_user AS role,
      (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
       FROM pg_roles WHERE rolname=current_user) AS elevated,
      has_database_privilege(current_user,current_database(),'CREATE') AS "databaseCreate",
      has_schema_privilege(current_user,'public','CREATE') AS "schemaCreate",
      EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace
             AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS "ownsObjects",
      has_table_privilege(current_user,'"GeneratedDraft"','DELETE') AS "canDelete",
      EXISTS(SELECT 1 FROM pg_auth_members
        WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS "inheritedRoles"`;
  const row = rows[0];
  if (
    rows.length !== 1 ||
    !row ||
    row.database !== a.database.name ||
    row.role !== a.database.role ||
    row.elevated !== false ||
    row.databaseCreate !== false ||
    row.schemaCreate !== false ||
    row.ownsObjects !== false ||
    row.canDelete !== false ||
    row.inheritedRoles !== false
  )
    fail("CI_DATABASE_GRANTS_DENIED");
  // A separately approved administrator initializes this non-secret identity row.
  // The runtime role must have SELECT-only access to it (verified in hosted grant acceptance).
  const marker = await db.$queryRaw<{ draftContent: string }[]>`
    SELECT "draftContent" FROM "GeneratedDraft"
    WHERE id=${"ci-identity-" + a.cohort} AND "userId"=${a.actor}
    AND workflow='CI_ACCEPTANCE_IDENTITY_V1'`;
  if (
    marker.length !== 1 ||
    marker[0].draftContent !==
      JSON.stringify({
        profile: a.profile,
        projectId: a.database.projectId,
        cohort: a.cohort,
        actor: a.actor,
        approvalHash,
      })
  )
    fail("CI_DATABASE_MARKER_DENIED");
  // Require RLS to keep this role from altering the identity marker or other actors/workflows.
  const rls = await db.$queryRaw<{ enabled: boolean; forced: boolean; policies: number }[]>`
    SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public'
       AND tablename='GeneratedDraft') AS policies
    FROM pg_class WHERE oid='"GeneratedDraft"'::regclass`;
  if (rls.length !== 1 || !rls[0].enabled || !rls[0].forced || rls[0].policies < 1)
    fail("CI_DATABASE_RLS_REQUIRED");
  const policies = await db.$queryRaw<unknown[]>`
    SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies
    WHERE schemaname='public' AND tablename='GeneratedDraft' ORDER BY policyname`;
  // Pin the reviewed catalog, not merely the presence of some permissive policy.
  if (checksum(JSON.stringify(policies)) !== a.database.policySha256)
    fail("CI_DATABASE_POLICY_CHANGED");
}
export function ciStores(db: MinimalPrismaClient, a: Approval) {
  const store = new PostgresQueuePersistence(async (actor) => {
    if (actor !== a.actor) fail("CI_ACTOR_DENIED");
    return db;
  });
  const id = "ci-audit-" + a.cohort;
  const load = async (client: MinimalPrismaClient) => {
    const rows = await client.$queryRaw<{ draftContent: string }[]>`
      SELECT "draftContent" FROM "GeneratedDraft" WHERE id=${id}
      AND "userId"=${a.actor} AND workflow='CI_ACCEPTANCE_AUDIT_V1'`;
    if (rows.length > 1) fail("CI_AUDIT_INVALID");
    return rows[0] ? auditSchema.parse(JSON.parse(rows[0].draftContent)) : null;
  };
  const audit: AuditStore = {
    read: () => load(db),
    save: async (value: Audit, expected) => {
      const content = JSON.stringify(auditSchema.parse(value));
      if (Buffer.byteLength(content) > 8192) fail("CI_AUDIT_INVALID");
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${id},0))`;
        const prior = await load(tx);
        if ((prior?.phase ?? null) !== expected) fail("CI_AUDIT_CONFLICT");
        const count = await tx.$executeRaw`
          INSERT INTO "GeneratedDraft" (id,"userId",workflow,"draftContent","retrievedKnowledgeIds","sourceIds","draftStatus","updatedAt")
          VALUES (${id},${a.actor},'CI_ACCEPTANCE_AUDIT_V1',${content},'{}','{}','DRAFT',NOW())
          ON CONFLICT (id) DO UPDATE SET "draftContent"=EXCLUDED."draftContent","updatedAt"=NOW()
          WHERE "GeneratedDraft"."userId"=${a.actor} AND "GeneratedDraft".workflow='CI_ACCEPTANCE_AUDIT_V1'`;
        if (count !== 1) fail("CI_AUDIT_CONFLICT");
      });
    },
  };
  return { store, audit };
}
