import { createHash } from "node:crypto";
import { z } from "zod";

const token = z.string().regex(/^[a-zA-Z0-9_-]{3,80}$/);
// Public metadata verified read-only. This finite profile authorizes no other Neon target.
export const NEON_CI_TARGET = {
  organizationId: "org-shy-brook-84467702",
  projectId: "snowy-art-90934943",
  branchId: "br-empty-breeze-b51o9q71",
  host: "ep-green-silence-b5lbunar.c-7.us-east-2.aws.neon.tech",
  name: "ci_acceptance_pilot",
} as const;
export const approvalSchema = z
  .object({
    version: z.literal(1),
    enabled: z.literal(true),
    profile: z.literal("GITHUB_ACTIONS_SIMULATED"),
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    repositoryId: z.string().regex(/^\d+$/),
    ownerId: z.string().regex(/^\d+$/),
    ref: z.literal("refs/heads/main"),
    cohort: token,
    actor: z.string().regex(/^ci-fixture-[a-z0-9-]{8,60}$/),
    database: z
      .object({
        projectId: z.literal(NEON_CI_TARGET.projectId),
        branchId: z.literal(NEON_CI_TARGET.branchId),
        host: z.literal(NEON_CI_TARGET.host),
        name: z.literal(NEON_CI_TARGET.name),
        role: z.literal("ci_acceptance_app"),
        policySha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    approvedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    approvalId: token,
    evidence: z
      .object({
        privateRepository: token,
        noVercelIntegration: token,
        actionsPaidUsageBlocked: token,
        isolatedDatabaseAndGrants: token,
      })
      .strict(),
    setupManualInterventions: z.number().int().min(1).max(1000),
    limits: z
      .object({
        jobs: z.literal(3),
        infrastructureOverageUsd: z.literal(0),
        aiEnabled: z.literal(false),
        dailyUsd: z.literal(1),
        monthlyUsd: z.literal(5),
        concurrent: z.literal(1),
        retries: z.literal(0),
        outbound: z.literal(false),
        maxRunMinutes: z.literal(15),
      })
      .strict(),
  })
  .strict();
export type Approval = z.infer<typeof approvalSchema>;
export const checksum = (text: string) => createHash("sha256").update(text).digest("hex");
export function fail(code: string): never {
  throw new Error(code);
}

export function requireCiApproval(raw: string, env: NodeJS.ProcessEnv, now = new Date()) {
  try {
    if (Buffer.byteLength(raw) > 8192 || checksum(raw) !== env.CI_APPROVAL_SHA256)
      fail("CI_APPROVAL_INVALID");
    const approval = approvalSchema.parse(JSON.parse(raw));
    const start = Date.parse(approval.approvedAt),
      end = Date.parse(approval.expiresAt);
    if (start > +now || end <= +now || end - start > 7 * 86400000) fail("CI_APPROVAL_EXPIRED");
    if (
      env.CI_ACCEPTANCE_ENABLED !== "true" ||
      env.GITHUB_ACTIONS !== "true" ||
      env.CI_ACCEPTANCE_MODE !== "SIMULATED" ||
      env.RUNNER_ENVIRONMENT !== "github-hosted" ||
      env.RUNNER_OS !== "Linux" ||
      env.GITHUB_REPOSITORY !== approval.repository ||
      env.GITHUB_REPOSITORY_ID !== approval.repositoryId ||
      env.GITHUB_REPOSITORY_OWNER_ID !== approval.ownerId ||
      env.GITHUB_REF !== approval.ref ||
      !["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME ?? "") ||
      !/^\d+$/.test(env.GITHUB_RUN_ID ?? "") ||
      env.GITHUB_RUN_ATTEMPT !== "1" ||
      !/^\d+$/.test(env.GITHUB_RUN_NUMBER ?? "") ||
      Number(env.GITHUB_RUN_NUMBER) < 1 ||
      Number(env.GITHUB_RUN_NUMBER) > 14 ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")
    )
      fail("CI_IDENTITY_DENIED");
    // No inherited application, deploy, provider, CRM or privileged database credentials.
    if (
      Object.entries(env).some(
        ([key, value]) =>
          value &&
          /^(VERCEL(?:_|$)|NEXT_PUBLIC_|DATABASE_URL$|DIRECT_URL$|PREVIEW_DATABASE_URL$|OPENAI|LOCAL_|SUPABASE|HUBSPOT|OUTREACH|SIMILARWEB|MAKE_|INTEGRATION_|GETLEADS|AWS_|AZURE_|CLOUDFLARE_|NEON_API|GH_TOKEN$|PAT$)/.test(
            key,
          ),
      )
    )
      fail("CI_FORBIDDEN_ENV");
    return approval;
  } catch (error) {
    if (error instanceof Error && /^CI_[A-Z_]+$/.test(error.message)) throw error;
    return fail("CI_APPROVAL_INVALID");
  }
}
export function requireCiDatabaseUrl(value: string | undefined, approval: Approval) {
  try {
    // Do not rely on callers having parsed a structurally typed Approval beforehand.
    approvalSchema.shape.database.parse(approval.database);
    const url = new URL(value ?? "");
    if (
      url.protocol !== "postgresql:" ||
      url.hostname !== approval.database.host ||
      (url.port && url.port !== "5432") ||
      url.pathname !== "/" + approval.database.name ||
      decodeURIComponent(url.username) !== approval.database.role ||
      !url.password ||
      url.hash ||
      url.searchParams.get("sslmode") !== "require" ||
      url.searchParams.get("sslaccept") !== "strict" ||
      [...url.searchParams.keys()].some(
        (key) =>
          !["sslmode", "sslaccept", "connection_limit", "connect_timeout"].includes(key) ||
          url.searchParams.getAll(key).length !== 1,
      ) ||
      url.searchParams.get("connection_limit") !== "1" ||
      url.searchParams.get("connect_timeout") !== "15"
    )
      fail("CI_DATABASE_IDENTITY_DENIED");
    return value!;
  } catch {
    return fail("CI_DATABASE_IDENTITY_DENIED");
  }
}
export function verifyRepositoryMetadata(value: unknown, approval: Approval) {
  const repo = z
    .object({
      id: z.number().int(),
      full_name: z.string(),
      private: z.literal(true),
      fork: z.literal(false),
      archived: z.literal(false),
      disabled: z.literal(false),
      default_branch: z.literal("main"),
      owner: z.object({ id: z.number().int() }),
    })
    .parse(value);
  if (
    repo.full_name !== approval.repository ||
    String(repo.id) !== approval.repositoryId ||
    String(repo.owner.id) !== approval.ownerId
  )
    fail("CI_REPOSITORY_DENIED");
}
