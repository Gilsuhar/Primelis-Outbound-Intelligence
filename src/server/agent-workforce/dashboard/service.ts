import "server-only";
import { checkWorkforceDraftAccess } from "../draft-access";
import { qualityReviewPassed } from "../oiq";
import { opportunityPriority, compareOpportunityPriority } from "../opportunity-priority";
import { researchIdentity } from "../prospect-research/engine";
import { integrationEligibilityBlockers } from "@/server/integrations/eligibility";
import { PrismaIntegrationStore, type IntegrationStore } from "@/server/integrations/store";
import { isInOwnedIntakeScope } from "@/features/sales-agent/intake-scope";
import { stages, type WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import type {
  DashboardData,
  DashboardProspect,
  IntegrationHealth,
  RunSummary,
} from "@/features/agent-workforce/dashboard/contracts";
import { dashboardReviewSchema } from "@/features/agent-workforce/dashboard/contracts";
import {
  getSalesAgentDailyReview,
  reviewEvidenceSnapshot,
  snapshotSchema,
} from "@/server/services/sales-agent-collection-service";
import { PrismaEvidenceStore, type EvidenceStore } from "@/server/sales-agent/evidence-store";
import { LocalSuppressionAdapter } from "@/server/sales-agent/local-suppression";
import { PrismaWorkforceStore, type WorkforceStore } from "../store";
import { validateDraftResearch, validateSequence } from "../evidence-validation";
import { checkWorkforceEligibility } from "../safety";
import { loadApprovedProductKnowledge } from "../knowledge-agent";

export function summarizeRun(run: WorkforceRun, now: Date): RunSummary {
  return {
    id: run.id,
    ...(run.prospectResearch
      ? {
          prospectResearch: {
            ...run.prospectResearch,
            ...(Date.parse(run.prospectResearch.expiresAt) <= now.getTime()
              ? { status: "STALE" as const, opportunity: null }
              : {}),
          },
        }
      : {}),
    intake: run.intake,
    status: run.status,
    stage: run.prospectResearch
      ? (Object.entries(run.prospectResearch.stages).find(
          ([, s]) => s.status === "RUNNING" || s.status === "WAITING",
        )?.[0] ?? "REVIEW")
      : run.stage,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    issues: run.issues,
    // Send quoted findings and bounded source previews; full documents stay in the actor-scoped run.
    research: {
      ...run.research,
      sources: run.research.sources.map((source) => ({
        ...source,
        excerpt: source.excerpt.slice(0, 1200),
      })),
    },
    strategy: run.strategy,
    brandSearch: run.brandSearch,
    qualityVerdict: run.critic?.verdict ?? null,
    // This is research/quality readiness only; contact eligibility is checked independently below.
    draftStatus:
      run.status === "READY_FOR_REVIEW" &&
      run.sequence &&
      qualityReviewPassed(run, now) &&
      run.critic?.verdict === "PASS" &&
      Object.values(run.critic.checks).every(Boolean) &&
      !run.issues.length &&
      !validateDraftResearch(run, now).length &&
      !validateSequence(run, run.sequence).length
        ? "PENDING_HUMAN_REVIEW"
        : "HOLD",
    stages: run.prospectResearch
      ? Object.entries(run.prospectResearch.stages).map(([stage, state]) => ({
          stage,
          status:
            state.status === "COMPLETE"
              ? ("COMPLETED" as const)
              : state.status === "DATA_UNAVAILABLE"
                ? ("BLOCKED" as const)
                : state.status === "RUNNING" &&
                    (!run.leaseUntil || Date.parse(run.leaseUntil) <= now.getTime())
                  ? ("INTERRUPTED" as const)
                  : state.status,
          at: state.finishedAt ?? state.startedAt,
        }))
      : stages.map((stage) => {
          const last = run.events.filter((event) => event.stage === stage).at(-1);
          const blocked =
            run.stage === stage && run.status !== "RUNNING" && run.status !== "READY_FOR_REVIEW";
          const status = blocked
            ? last?.state === "FAILED"
              ? "FAILED"
              : "BLOCKED"
            : last?.state === "FAILED"
              ? "FAILED"
              : last?.state === "COMPLETED"
                ? "COMPLETED"
                : last?.state === "STARTED"
                  ? run.leaseUntil && Date.parse(run.leaseUntil) > now.getTime()
                    ? "RUNNING"
                    : "INTERRUPTED"
                  : "WAITING";
          return { stage, status, at: last?.at ?? null };
        }),
  };
}
export type DashboardDependencies = {
  evidence?: EvidenceStore;
  integrations?: IntegrationStore;
  runs?: WorkforceStore;
  now?: () => Date;
  configured?: { hubspot: boolean; openai: boolean };
  knowledge?: typeof loadApprovedProductKnowledge;
};
export async function getWorkforceDashboard(
  actor: string,
  deps: DashboardDependencies = {},
): Promise<DashboardData> {
  if (!actor.trim()) throw new Error("UNAUTHENTICATED");
  const evidence = deps.evidence ?? new PrismaEvidenceStore();
  const runsStore = deps.runs ?? new PrismaWorkforceStore();
  const now = (deps.now ?? (() => new Date()))();
  const [review, savedRuns, snapshots] = await Promise.allSettled([
    getSalesAgentDailyReview(actor, {
      store: evidence,
      now: () => now,
      integrationStore:
        deps.integrations ?? (!deps.evidence ? new PrismaIntegrationStore() : undefined),
    }),
    runsStore.list(actor),
    evidence.list(actor),
  ]);
  const evidenceAvailable =
    review.status === "fulfilled" && review.value.ok && snapshots.status === "fulfilled";
  const raw =
    snapshots.status === "fulfilled"
      ? snapshots.value.flatMap((item) => {
          const p = snapshotSchema.safeParse(item);
          return p.success ? [p.data] : [];
        })
      : [];
  const runs =
    savedRuns.status === "fulfilled"
      ? savedRuns.value
          .filter(
            (run) =>
              !run.prospectResearch ||
              raw.some(
                (s) =>
                  s.contact.hubspotRecordId === run.intake.hubspotRecordId &&
                  researchIdentity(s) === run.prospectResearch!.identityHash,
              ),
          )
          .map((run) => summarizeRun(run, now))
      : [];
  const rows = review.status === "fulfilled" && review.value.ok ? review.value.data.rows : [];
  const prospects: DashboardProspect[] = [];
  const seen = new Set<string>();
  let currentKnowledge: ReturnType<typeof loadApprovedProductKnowledge> | undefined;
  for (const row of rows) {
    const id = row.contact.hubspotRecordId;
    if (seen.has(id) || !isInOwnedIntakeScope(row.contact)) continue;
    seen.add(id);
    // Never attach research from a namesake or another HubSpot record.
    const matching = runs.filter(
      (run) =>
        run.intake.hubspotRecordId === id &&
        (!run.prospectResearch ||
          raw.some(
            (s) =>
              s.contact.hubspotRecordId === id &&
              researchIdentity(s) === run.prospectResearch!.identityHash,
          )) &&
        run.intake.companyDomain.toLowerCase() === row.contact.companyDomain?.toLowerCase() &&
        run.intake.prospectName.trim().toLowerCase() === row.contact.fullName.trim().toLowerCase(),
    );
    const currentRole = row.provenance.find(
      (item) => item.field === "role" && item.accepted && item.freshness === "FRESH",
    );
    // Ranking needs full quoted sources, not the excerpt-truncated client projection.
    const priorityRun =
      savedRuns.status === "fulfilled"
        ? savedRuns.value
            .filter((r) => r.prospectResearch && matching.some((m) => m.id === r.id))
            .sort(
              (a, b) =>
                b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt),
            )[0]
        : undefined;
    const candidate =
      savedRuns.status === "fulfilled"
        ? savedRuns.value.find(
            (item) =>
              String(currentRole?.value ?? "")
                .trim()
                .toLowerCase() === item.intake.prospectTitle.trim().toLowerCase() &&
              matching.some(
                (summary) =>
                  summary.id === item.id && summary.draftStatus === "PENDING_HUMAN_REVIEW",
              ),
          )
        : undefined;
    let draftReady = false;
    if (row.plan.decision.status === "READY" && candidate) {
      const protectedRun = await protectRunDrafts(actor, candidate, {
        now,
        eligibility: async () => ({
          status: row.plan.decision.status,
          reasons: row.plan.decision.reasons,
          blockDrafting: false,
        }),
        knowledge: () => (currentKnowledge ??= (deps.knowledge ?? loadApprovedProductKnowledge)()),
      });
      draftReady = protectedRun.sequence !== null;
    }
    prospects.push({
      ...row,
      // The queue carries evidence, never legacy template bodies or unreviewed AI drafts.
      drafting: { ...row.drafting, emails: [] },
      opportunityPriority: opportunityPriority(priorityRun, now),
      review: raw.find((item) => item.contact.hubspotRecordId === id)?.dashboardReview ?? null,
      runIds: matching.map((run) => run.id),
      draftReady,
      draftRunId: draftReady ? candidate!.id : null,
    });
  }
  prospects.sort(
    (a, b) =>
      Number(a.plan.decision.status === "REJECTED") -
        Number(b.plan.decision.status === "REJECTED") ||
      compareOpportunityPriority(a.opportunityPriority!, b.opportunityPriority!) ||
      a.contact.hubspotRecordId.localeCompare(b.contact.hubspotRecordId),
  );
  const configured = deps.configured ?? {
    hubspot: !!process.env.HUBSPOT_PRIVATE_APP_TOKEN,
    openai:
      !!process.env.OPENAI_API_KEY &&
      (!process.env.AI_PROVIDER || process.env.AI_PROVIDER.toLowerCase() === "openai"),
  };
  const hubspotObservation = raw
    .filter((item) =>
      item.providers.some((p) => p.provider === "HUBSPOT" && p.status === "CONNECTED"),
    )
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0];
  const successfulModelRun =
    savedRuns.status === "fulfilled"
      ? savedRuns.value
          .filter((run) => run.usage.some((u) => u.model !== "mock-test-only" && u.attempts > 0))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      : undefined;
  const verificationAttempts = raw
    .flatMap((snapshot) => Object.values(snapshot.verification ?? {}))
    .filter((attempt) => !!attempt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const verificationConfigured =
    !!(
      process.env.EMAIL_VERIFICATION_PROVIDER === "ZEROBOUNCE" && process.env.ZEROBOUNCE_API_KEY
    ) ||
    !!(
      process.env.VERIFICATION_GATEWAY_URL &&
      process.env.VERIFICATION_GATEWAY_TOKEN &&
      process.env.VERIFICATION_GATEWAY_PROVIDER_ID
    );
  const lastVerification = verificationAttempts[0];
  const integrations: IntegrationHealth[] = [
    {
      id: "HUBSPOT",
      label: "HubSpot",
      status: configured.hubspot
        ? hubspotObservation
          ? "LAST_SUCCESS"
          : "CONFIGURED_UNTESTED"
        : "NOT_CONFIGURED",
      observedAt: hubspotObservation?.collectedAt ?? null,
      detail:
        "Owner-scoped, read-only contacts/company collection. A configured token is not proof of access; opportunity clearance is still required.",
    },
    {
      id: "OUTREACH",
      label: "Outreach",
      status: "NOT_IMPLEMENTED",
      observedAt: null,
      detail:
        "Read-only synchronization requires configured OAuth and an authenticated check. Unknown outbound, suppression and active sequence history means HOLD. Writes and enrollment are disabled.",
    },
    {
      id: "SIMILARWEB",
      label: "Similarweb",
      status: "NOT_IMPLEMENTED",
      observedAt: null,
      detail:
        "No live Similarweb adapter is registered. Traffic/search intelligence is unavailable; no estimates substituted.",
    },
    {
      id: "OPENAI",
      label: "OpenAI",
      status: configured.openai
        ? successfulModelRun
          ? "LAST_SUCCESS"
          : "CONFIGURED_UNTESTED"
        : "NOT_CONFIGURED",
      observedAt: successfulModelRun?.updatedAt ?? null,
      detail:
        "Server-side Responses API and web-search tool. Last recorded success is historical, not a current connectivity test; web retrieval and approved knowledge are separate prerequisites.",
    },
    {
      id: "EMAIL_VERIFICATION",
      label: "Email & employment verification",
      status: !verificationConfigured
        ? "NOT_CONFIGURED"
        : lastVerification?.state === "FAILED"
          ? "ERROR"
          : lastVerification?.state === "COMPLETED"
            ? "LAST_SUCCESS"
            : "CONFIGURED_UNTESTED",
      observedAt: lastVerification?.result?.proof.checkedAt ?? null,
      detail:
        "Optional ZeroBounce email validation and authorized verification gateway adapters. Configuration is not proof; last recorded response does not establish current eligibility. Employment requires independently sourced employer, seniority and Search evidence. Boring green cannot clear verification.",
    },
  ];
  // Existing fixture-injected dashboards remain isolated from live storage.
  if (deps.integrations || !deps.evidence) {
    const store = deps.integrations ?? new PrismaIntegrationStore();
    for (const provider of ["HUBSPOT", "OUTREACH"] as const) {
      const target = integrations.find((entry) => entry.id === provider)!;
      try {
        const { state } = await store.get(actor, provider);
        const stale = !state.checkedAt || now.getTime() - Date.parse(state.checkedAt) > 86400000;
        target.status =
          state.status === "CONNECTED" && stale ? "CONFIGURED_UNTESTED" : state.status;
        target.observedAt = state.checkedAt;
        target.detail = state.detail;
        target.sync = state;
      } catch {
        target.status = "ERROR";
        target.detail =
          "Integration persistence unavailable. Apply the reviewed migration to the Preview database and configure server-side credentials. No connection has been verified.";
      }
    }
  }
  return {
    evaluatedAt: now.toISOString(),
    prospects,
    runs,
    integrations,
    evidenceAvailable,
    runsAvailable: savedRuns.status === "fulfilled",
    metrics: {
      reviewedToday: evidenceAvailable
        ? prospects.filter(
            (p) =>
              p.review &&
              new Date(p.review.reviewedAt).toISOString().slice(0, 10) ===
                now.toISOString().slice(0, 10),
          ).length
        : null,
      eligible: evidenceAvailable
        ? prospects.filter((p) => p.plan.decision.status === "READY").length
        : null,
      hold: evidenceAvailable
        ? prospects.filter((p) => p.plan.decision.status === "HOLD").length
        : null,
      rejected: evidenceAvailable
        ? prospects.filter((p) => p.plan.decision.status === "REJECTED").length
        : null,
    },
    warnings: [
      ...(review.status === "fulfilled" && review.value.ok
        ? review.value.data.warnings
        : [
            "Evidence database unavailable. Configure DATABASE_URL and retry; queue metrics are unknown, not zero.",
          ]),
      ...(savedRuns.status !== "fulfilled"
        ? ["Research run storage is unavailable; no run results were substituted."]
        : []),
      ...(rows.length > prospects.length
        ? [
            "Legacy or out-of-scope snapshots are excluded from this queue. Collect newly created or assigned owner-scoped contacts; legacy evidence review remains available.",
          ]
        : []),
    ],
  };
}

/** Explicit human review writes only to this actor's local evidence history, never to CRM. */
export async function markProspectReviewed(
  actor: string,
  id: string,
  deps: DashboardDependencies = {},
) {
  const store = deps.evidence ?? new PrismaEvidenceStore();
  const now = (deps.now ?? (() => new Date()))();
  const suppression = new LocalSuppressionAdapter(await store.suppressionRecords());
  // Suppression records are loaded outside the transaction, but are re-evaluated for every read.
  // Editing is serialized under the existing per-actor advisory lock.
  const local = await store.list(actor);
  const parsed = local
    .map((raw) => snapshotSchema.safeParse(raw))
    .find((p) => p.success && p.data.contact.hubspotRecordId === id);
  if (!parsed?.success || !isInOwnedIntakeScope(parsed.data.contact)) throw new Error("NOT_FOUND");
  const latestSuppression = await suppression.collect(parsed.data.contact, now);
  const integrationBlocks =
    deps.integrations || !deps.evidence
      ? await integrationEligibilityBlockers(actor, now, deps.integrations)
      : [];
  const changed = await store.edit(actor, id, (raw) => {
    const p = snapshotSchema.safeParse(raw);
    if (!p.success || !isInOwnedIntakeScope(p.data.contact)) return null;
    const decision = reviewEvidenceSnapshot(
      {
        ...p.data,
        blockers: [...p.data.blockers, ...integrationBlocks],
        observations: [...p.data.observations, ...latestSuppression.observations],
      },
      now,
    ).plan.decision;
    return {
      ...p.data,
      provenanceAtCollection: [],
      dashboardReview: dashboardReviewSchema.parse({
        reviewedAt: now.toISOString(),
        decision,
        approved: false,
      }),
    };
  });
  if (!changed) throw new Error("NOT_FOUND");
}

/** Never return stored draft bodies on the strength of a stale eligibility snapshot. */
export async function protectRunDrafts(
  actor: string,
  raw: WorkforceRun,
  deps: {
    eligibility?: typeof checkWorkforceEligibility;
    knowledge?: typeof loadApprovedProductKnowledge;
    now?: Date;
  } = {},
) {
  if (raw.draftStudio) {
    const { DraftStudioEngine } = await import("../draft-studio/engine");
    return new DraftStudioEngine().read(actor, raw.id);
  }
  if (!raw.sequence) return raw;
  const run = structuredClone(raw);
  run.eligibility = {
    status: "HOLD",
    reasons: ["Current eligibility could not be verified"],
    blockDrafting: true,
  };
  try {
    run.eligibility = await (deps.eligibility ?? checkWorkforceEligibility)(
      actor,
      run.intake,
      deps.now ?? new Date(),
    );
    const current = await (deps.knowledge ?? loadApprovedProductKnowledge)();
    const revoked = run.knowledge.some(
      (k) =>
        !current.some(
          (c) =>
            c.id === k.id &&
            c.text === k.text &&
            c.restrictions === k.restrictions &&
            JSON.stringify(c.sourceIds) === JSON.stringify(k.sourceIds) &&
            JSON.stringify(c.sourceUrls) === JSON.stringify(k.sourceUrls),
        ),
    );
    if (
      !(
        deps.eligibility
          ? { draftAllowed: run.eligibility.status === "READY" && !run.eligibility.blockDrafting }
          : await checkWorkforceDraftAccess(actor, run.intake, deps.now ?? new Date())
      ).draftAllowed ||
      summarizeRun(run, deps.now ?? new Date()).draftStatus === "HOLD" ||
      revoked
    )
      throw new Error("HOLD");
  } catch {
    run.sequence = null;
    run.issues = [
      ...run.issues,
      "Draft Studio is locked: refresh mandatory eligibility, approved knowledge and research/quality checks. Research completion does not grant draft readiness.",
    ];
  }
  return run;
}
