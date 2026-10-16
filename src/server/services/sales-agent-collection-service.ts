import "server-only";
import { integrationEligibilityBlockers } from "@/server/integrations/eligibility";
import type { IntegrationStore } from "@/server/integrations/store";

import { z } from "zod";
import { dashboardReviewSchema } from "@/features/agent-workforce/dashboard/contracts";

import {
  normalizeCollectedEvidence,
  observationSchema,
  type IntakeContact,
} from "@/features/sales-agent/evidence";
import { buildSalesAgentDrafts, draftResearchSchema } from "@/features/sales-agent/draft-engine";
import { planProspectWorkflow } from "@/features/sales-agent/orchestrator";
import {
  MAX_EVIDENCE_AGE_DAYS,
  parseTimestamp,
  SIGNAL_HUBSPOT_OWNER_ID,
} from "@/features/sales-agent/qualification";
import {
  PrismaEvidenceStore,
  type EvidenceSnapshot,
  type EvidenceStore,
} from "@/server/sales-agent/evidence-store";
import { HubSpotReadOnlyIntake } from "@/server/sales-agent/hubspot-intake";
import { LocalSuppressionAdapter } from "@/server/sales-agent/local-suppression";
import {
  disconnectedProviders,
  type ContactIntakeAdapter,
  type ProspectEvidenceAdapter,
  type ProviderStatus,
} from "@/server/sales-agent/providers";
import { err, ok } from "./result";
import {
  recheckDraftProofs,
  verifyApprovedDraftProof,
} from "@/server/sales-agent/approved-draft-proof";

export type CollectionDependencies = {
  integrationStore?: IntegrationStore;
  intake?: ContactIntakeAdapter;
  providers?: ProspectEvidenceAdapter[];
  store?: EvidenceStore;
  now?: () => Date;
  verifyProof?: typeof verifyApprovedDraftProof;
};
const contactSchema = z.object({
  hubspotRecordId: z.string().min(1),
  ownerId: z.string(),
  fullName: z.string(),
  email: z.string().optional(),
  companyName: z.string().optional(),
  companyDomain: z.string().optional(),
  emailModifiedAt: z.string().optional(),
  hubspotRecordUrl: z.string().url().optional(),
  outreachProspectId: z.string().optional(),
  hubspotCreatedAt: z.string().optional(),
  ownerAssignedAt: z.string().optional(),
  intakeSince: z.string().optional(),
  observedAt: z.string(),
  observations: z.array(observationSchema),
  warnings: z.array(z.string()),
});
export const snapshotSchema = z.object({
  integrationReceipts: z
    .object({
      HUBSPOT: z
        .object({ jobId: z.string(), operation: z.enum(["IMPORTED", "UPDATED"]) })
        .optional(),
      OUTREACH: z
        .object({ jobId: z.string(), operation: z.enum(["IMPORTED", "UPDATED"]) })
        .optional(),
    })
    .optional(),
  version: z.literal(1),
  dashboardReview: dashboardReviewSchema.optional(),
  contact: contactSchema,
  observations: z.array(observationSchema),
  blockers: z.array(z.string()),
  providers: z.array(
    z.object({
      provider: observationSchema.shape.provider,
      status: z.enum(["CONNECTED", "NOT_CONFIGURED", "ERROR"]),
      message: z.string(),
    }),
  ),
  collectedAt: z.string(),
  research: z.array(draftResearchSchema).max(100).optional(),
});

export function reviewEvidenceSnapshot(
  snapshot: Omit<EvidenceSnapshot, "provenanceAtCollection">,
  now: Date,
) {
  const normalized = normalizeCollectedEvidence(snapshot.contact, snapshot.observations, now);
  const plan = planProspectWorkflow(normalized.input, now);
  const blockers = [
    ...new Set([...snapshot.blockers, ...snapshot.contact.warnings, ...normalized.conflicts]),
  ];
  const observed = parseTimestamp(snapshot.contact.observedAt);
  if (
    observed === null ||
    observed > now.getTime() ||
    now.getTime() - observed > MAX_EVIDENCE_AGE_DAYS * 86_400_000
  )
    blockers.push("HubSpot identity/owner observation is stale or invalid; recollect intake");
  if (snapshot.contact.ownerId !== SIGNAL_HUBSPOT_OWNER_ID)
    blockers.push("Unauthorized HubSpot owner");
  if (blockers.length) {
    if (plan.decision.status === "READY") plan.decision.reasons = [];
    if (plan.decision.status !== "REJECTED") plan.decision.status = "HOLD";
    plan.decision.reasons.push(...blockers);
    plan.decision.missingVerificationRequirements.push(...blockers);
    plan.decision.nextActions.push(...blockers.map((reason) => `Verify and resolve: ${reason}`));
    plan.tasks =
      plan.decision.status === "REJECTED"
        ? []
        : plan.decision.nextActions.map((action) => ({
            stage: "QUALIFICATION" as const,
            action,
            requiresHumanApproval: false,
          }));
  }
  return {
    contact: snapshot.contact,
    collectedAt: snapshot.collectedAt,
    evaluatedAt: now.toISOString(),
    provenance: normalized.provenance,
    plan,
    humanApproval: {
      required: true,
      granted: false,
      requirements: [
        "Resolve all missing evidence and conflicts",
        "Human-verified SERP evidence and review of all four emails before any future enrollment",
      ],
    },
    providers: snapshot.providers,
    drafting: buildSalesAgentDrafts(snapshot.contact, plan, snapshot.research, now),
  };
}
export type DailyReviewRow = ReturnType<typeof reviewEvidenceSnapshot>;

export async function collectSalesAgentEvidence(
  actorId: string,
  after?: string,
  deps: CollectionDependencies = {},
) {
  if (!actorId.trim()) return err("UNAUTHENTICATED", "Sign in to collect evidence");
  const clock = deps.now ?? (() => new Date());
  const store = deps.store ?? new PrismaEvidenceStore();
  if (!deps.intake && !process.env.HUBSPOT_PRIVATE_APP_TOKEN)
    return err(
      "NOT_CONFIGURED",
      "Configure HUBSPOT_PRIVATE_APP_TOKEN with read-only contact/company access",
    );
  let stage: "database" | "hubspot" | "save" = "database";
  try {
    // Fail before external reads when persistence/suppression checks are unavailable.
    console.info("[sales-agent-collection] stage=suppression_start");
    const records = await store.suppressionRecords();
    console.info("[sales-agent-collection] stage=suppression_ok");
    stage = "hubspot";
    console.info("[sales-agent-collection] stage=hubspot_start");
    const batch = await (deps.intake ?? new HubSpotReadOnlyIntake()).listOwnedContacts(after);
    console.info("[sales-agent-collection] stage=hubspot_ok count=" + batch.contacts.length);
    const adapters = [new LocalSuppressionAdapter(records), ...(deps.providers ?? [])];
    const seen = new Map<string, IntakeContact>();
    const excluded = new Set<string>();
    for (const raw of batch.contacts) {
      const contact = contactSchema.parse(raw);
      if (contact.ownerId !== SIGNAL_HUBSPOT_OWNER_ID) {
        excluded.add(contact.hubspotRecordId);
        continue;
      }
      const prior = seen.get(contact.hubspotRecordId);
      if (prior && JSON.stringify(prior) !== JSON.stringify(contact)) {
        prior.warnings.push("Conflicting duplicate HubSpot record; recollect and resolve identity");
      } else if (!prior) seen.set(contact.hubspotRecordId, contact);
    }
    const snapshots: EvidenceSnapshot[] = [];
    for (const contact of seen.values()) {
      if (excluded.has(contact.hubspotRecordId)) continue;
      const observations = [...contact.observations];
      const blockers: string[] = [];
      const statuses: ProviderStatus[] = [
        { provider: "HUBSPOT", status: "CONNECTED", message: "Read-only owner-scoped intake" },
      ];
      for (const adapter of adapters) {
        try {
          const result = await adapter.collect(contact, clock());
          const parsed = z.array(observationSchema).parse(result.observations);
          if (
            parsed.some(
              (item) =>
                item.provider !== adapter.provider ||
                item.hubspotRecordId !== contact.hubspotRecordId,
            )
          )
            throw new Error("Provider identity mismatch");
          observations.push(...parsed);
          blockers.push(...result.blockers);
          statuses.push({
            provider: adapter.provider,
            status: "CONNECTED",
            message: "Read-only evidence collection completed",
          });
        } catch {
          blockers.push(
            `${adapter.provider} evidence collection failed; retry or independently verify`,
          );
          statuses.push({
            provider: adapter.provider,
            status: "ERROR",
            message: "Evidence unavailable; verification required",
          });
        }
      }
      statuses.push(
        ...disconnectedProviders.filter(
          (status) => !adapters.some((adapter) => adapter.provider === status.provider),
        ),
      );
      const completedAt = clock();
      snapshots.push({
        version: 1,
        contact,
        observations,
        provenanceAtCollection: normalizeCollectedEvidence(contact, observations, completedAt)
          .provenance,
        blockers,
        providers: [...new Map(statuses.map((status) => [status.provider, status])).values()],
        collectedAt: completedAt.toISOString(),
      });
    }
    stage = "save";
    console.info("[sales-agent-collection] stage=save_start count=" + snapshots.length);
    await store.save(actorId, snapshots);
    console.info("[sales-agent-collection] stage=save_ok");
    return ok({
      collected: snapshots.length,
      complete: batch.complete,
      nextCursor: batch.nextCursor,
      warnings: batch.warnings,
      rows: snapshots.map((snapshot) => reviewEvidenceSnapshot(snapshot, clock())),
    });
  } catch (error) {
    // Log a stage and error type only; provider errors may contain sensitive data.
    console.error("[sales-agent-collection] collection_failed", {
      stage,
      errorType: error instanceof Error ? error.name : "Unknown",
    });
    const message =
      stage === "database"
        ? "Evidence database is unavailable before HubSpot collection. Check DATABASE_URL and the SuppressionRecord table."
        : stage === "hubspot"
          ? "HubSpot read failed. Verify the token supports CRM search, owner filtering and contact/company read scopes."
          : "HubSpot intake completed, but saving evidence to the application database failed.";
    return err("COLLECTION_FAILED", message);
  }
}

export async function getSalesAgentDailyReview(actorId: string, deps: CollectionDependencies = {}) {
  if (!actorId.trim()) return err("UNAUTHENTICATED", "Sign in to review evidence");
  try {
    const store = deps.store ?? new PrismaEvidenceStore();
    const snapshots = await store.list(actorId);
    const localSuppression = new LocalSuppressionAdapter(await store.suppressionRecords());
    const now = (deps.now ?? (() => new Date()))();
    const integrationBlockers =
      deps.integrationStore || !deps.store
        ? await integrationEligibilityBlockers(actorId, now, deps.integrationStore)
        : [];
    const rows: DailyReviewRow[] = [];
    let unreadable = 0;
    for (const raw of snapshots) {
      const result = snapshotSchema.safeParse(raw);
      if (!result.success) {
        unreadable++;
        continue;
      }
      const currentSuppression = await localSuppression.collect(result.data.contact, now);
      rows.push(
        reviewEvidenceSnapshot(
          {
            ...result.data,
            blockers: [...result.data.blockers, ...integrationBlockers],
            research: await recheckDraftProofs(result.data.research, deps.verifyProof),
            observations: [...result.data.observations, ...currentSuppression.observations],
          },
          now,
        ),
      );
    }
    return ok({
      evaluatedAt: now.toISOString(),
      rows,
      counts: {
        READY: rows.filter((row) => row.plan.decision.status === "READY").length,
        HOLD: rows.filter((row) => row.plan.decision.status === "HOLD").length,
        REJECTED: rows.filter((row) => row.plan.decision.status === "REJECTED").length,
      },
      warnings: unreadable
        ? [`${unreadable} saved snapshots could not be read; recollect evidence`]
        : [],
      providers: [
        {
          provider: "HUBSPOT",
          status: process.env.HUBSPOT_PRIVATE_APP_TOKEN ? "CONFIGURED" : "NOT_CONFIGURED",
          message: "Read-only adapter; live access requires credentials and read scopes",
        },
        ...disconnectedProviders,
      ],
    });
  } catch {
    return err(
      "REVIEW_UNAVAILABLE",
      "Saved evidence is unavailable. Configure the database and retry; no live evidence has been substituted.",
    );
  }
}
