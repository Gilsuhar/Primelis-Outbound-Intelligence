/** Fictional authorization/companies, public pinned target metadata, no real credentials.
 * Offline adapters only; never an authorization or connection for hosted execution. */
import { NEON_CI_TARGET, type Approval } from "./policy";
export const fictionalApproval: Approval = {
  version: 1,
  enabled: true,
  profile: "GITHUB_ACTIONS_SIMULATED",
  repository: "fictional-owner/fictional-ci",
  repositoryId: "123",
  ownerId: "456",
  ref: "refs/heads/main",
  cohort: "fictional-cohort",
  actor: "ci-fixture-fictional",
  database: {
    projectId: NEON_CI_TARGET.projectId,
    branchId: NEON_CI_TARGET.branchId,
    host: NEON_CI_TARGET.host,
    name: NEON_CI_TARGET.name,
    role: "ci_acceptance_app",
    policySha256: "a".repeat(64),
  },
  approvedAt: "2026-10-19T08:00:00.000Z",
  expiresAt: "2026-10-25T08:00:00.000Z",
  approvalId: "fictional-approval",
  evidence: {
    privateRepository: "fictional-review",
    noVercelIntegration: "fictional-review",
    actionsPaidUsageBlocked: "fictional-review",
    isolatedDatabaseAndGrants: "fictional-review",
  },
  setupManualInterventions: 2,
  limits: {
    jobs: 3,
    infrastructureOverageUsd: 0,
    aiEnabled: false,
    dailyUsd: 1,
    monthlyUsd: 5,
    concurrent: 1,
    retries: 0,
    outbound: false,
    maxRunMinutes: 15,
  },
};
