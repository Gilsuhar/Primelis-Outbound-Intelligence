import "server-only";
import { randomUUID } from "node:crypto";
import {
  prioritizePreparation,
  preparationDomain,
  summarizePreparationEligibility,
  buildInternalContactDraftContext,
  preparationAttemptSchema,
  type PreparationActionReport,
  type PreparationAttempt,
  type PreparationPlan,
  type PreparationItem,
} from "@/features/agent-workforce/dashboard/prospect-preparation";
import {
  collectSalesAgentEvidence,
  getSalesAgentDailyReview,
  snapshotSchema,
} from "@/server/services/sales-agent-collection-service";
import { PrismaEvidenceStore, type EvidenceStore } from "@/server/sales-agent/evidence-store";
import { localOutreachEvidence } from "@/server/sales-agent/outreach-evidence";
import { normalizeCollectedEvidence, observationSchema } from "@/features/sales-agent/evidence";
import type { ProspectEvidenceAdapter } from "@/server/sales-agent/providers";
import { requireLocalCompanyAccess } from "../company-research/config";
import { localDevelopmentHost } from "@/lib/auth/local-development";
import {
  automaticCompanyConfig,
  verifyReusableCompanyResearch,
} from "../company-research/automatic-execution";
import {
  createInternalReview,
  listInternalReviews,
} from "../company-research/internal-review-store";
import { LocalCompanyBudgetStore } from "../company-research/store";
import { jerusalemParts } from "../daily/schedule";
import type { DailyStore } from "../daily/state";
import type { InternalCompanyDocument } from "@/features/agent-workforce/company-research/internal-review";

type Dependencies = {
  store?: EvidenceStore;
  review?: typeof getSalesAgentDailyReview;
  collect?: typeof collectSalesAgentEvidence;
  documents?: typeof listInternalReviews;
  create?: typeof createInternalReview;
  outreach?: (actor: string) => ProspectEvidenceAdapter;
  budget?: DailyStore;
  now?: () => Date;
};
const inFlight = new Set<string>();
function access(actor: string, host: string | null) {
  requireLocalCompanyAccess(actor);
  if (!localDevelopmentHost(host)) throw Error("LOCAL_COMPANY_ONLY");
}

const preparationFailureCodes = new Set<NonNullable<PreparationAttempt["failureCode"]>>([
  "PREPARATION_AI_NOT_READY",
  "PREPARATION_ALREADY_ATTEMPTED",
  "PREPARATION_CLAIM_FAILED",
  "PREPARATION_CONTACT_NOT_AVAILABLE",
  "PREPARATION_EVIDENCE_UNAVAILABLE",
  "PREPARATION_IDENTITY_CHANGED",
  "PREPARATION_INCOMPLETE",
  "PREPARATION_INCREMENTAL_ESTIMATE_UNAVAILABLE",
  "PREPARATION_INTAKE_FAILED",
  "PREPARATION_UNAVAILABLE",
]);

function sanitizedPreparationFailure(
  error: unknown,
): NonNullable<PreparationAttempt["failureCode"]> {
  const message = error instanceof Error ? error.message : "";
  return preparationFailureCodes.has(message as NonNullable<PreparationAttempt["failureCode"]>)
    ? (message as NonNullable<PreparationAttempt["failureCode"]>)
    : "PREPARATION_UNAVAILABLE";
}

async function persistPreparationAttempt(
  store: EvidenceStore,
  actor: string,
  contactId: string,
  companyDomain: string,
  attempt: PreparationAttempt,
) {
  const parsed = preparationAttemptSchema.parse(attempt);
  const changed = await store.edit(actor, contactId, (raw) => {
    const snapshot = snapshotSchema.parse(raw);
    if (
      snapshot.contact.ownerId !== "1087915602" ||
      snapshot.contact.hubspotRecordId !== contactId ||
      preparationDomain(snapshot.contact.companyDomain) !== companyDomain
    )
      throw Error("PREPARATION_IDENTITY_CHANGED");
    const attempts = snapshot.preparationAttempts ?? [];
    const existingIndex = attempts.findIndex((entry) => entry.attemptId === parsed.attemptId);
    const updated = [...attempts];
    if (existingIndex >= 0) updated[existingIndex] = parsed;
    else updated.push(parsed);
    return { ...snapshot, preparationAttempts: updated.slice(-20) };
  });
  if (!changed) throw Error("PREPARATION_EVIDENCE_UNAVAILABLE");
}
function matches(doc: InternalCompanyDocument, domain: string) {
  return (
    preparationDomain(doc.company) === domain ||
    preparationDomain(doc.automatic?.run?.intake.companyDomain) === domain
  );
}

const legalCompanySuffixes = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "llc",
  "ltd",
  "limited",
  "plc",
  "international",
]);

function companyLabel(value?: string | null) {
  const words = (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && legalCompanySuffixes.has(words[words.length - 1])) words.pop();
  return words.join("");
}

/**
 * A contact-bound packet may use an official media subdomain while the CRM stores
 * the canonical company domain. Reuse that alias only when the exact HubSpot ID,
 * company label, and a strict subdomain relationship all agree.
 */
export function matchesContactBoundCompany(
  doc: InternalCompanyDocument,
  domain: string,
  companyName: string | null | undefined,
  contactId: string,
) {
  const run = doc.automatic?.run;
  const researchDomain = preparationDomain(run?.intake.companyDomain);
  const canonicalName = companyLabel(companyName);
  return Boolean(
    doc.automatic?.internalContact?.contactId === contactId &&
    canonicalName &&
    companyLabel(doc.company) === canonicalName &&
    companyLabel(run?.intake.companyName) === canonicalName &&
    researchDomain &&
    (researchDomain === domain || researchDomain.endsWith(`.${domain}`)),
  );
}

function onlySelectedContact(plan: PreparationPlan, contactId: string): PreparationPlan {
  const item = plan.items.find((candidate) => candidate.contactId === contactId);
  if (!item || item.contactDraftContext.contactId !== contactId)
    throw Error("PREPARATION_CONTACT_NOT_AVAILABLE");
  return {
    ...plan,
    items: [item],
    maxCalls: item.maxCalls,
    maxEstimatedUsd: item.maxCalls > 0 ? plan.maxEstimatedUsd : 0,
  };
}

/** Estimate a fresh writer + reviewer pair from exactly one prior successful usage record per stage. */
function priorWritingReviewEstimate(doc: InternalCompanyDocument): number | null {
  const usage = doc.automatic?.usage;
  if (!usage) return null;
  const writing = usage.filter((entry) => entry.stage === "SEQUENCE");
  const review = usage.filter((entry) => entry.stage === "QUALITY_REVIEW");
  if (writing.length !== 1 || review.length !== 1) return null;
  const costs = [writing[0].estimatedCostUsd, review[0].estimatedCostUsd];
  return costs.every((cost) => typeof cost === "number" && Number.isFinite(cost) && cost >= 0)
    ? costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0)
    : null;
}

/** Read-only plan. Existing provenance/eligibility remains authoritative. */
export async function getPreparationPlan(
  actor: string,
  host: string | null,
  deps: Dependencies = {},
): Promise<PreparationPlan> {
  access(actor, host);
  const now = deps.now?.() ?? new Date();
  const store = deps.store ?? new PrismaEvidenceStore();
  const review = await (deps.review ?? getSalesAgentDailyReview)(
    actor,
    deps.store ? { store, now: () => now } : {},
  );
  if (!review.ok) throw Error("PREPARATION_EVIDENCE_UNAVAILABLE");
  const snapshots = (await store.list(actor)).flatMap((raw) => {
    const parsed = snapshotSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  const documents = await (deps.documents ?? listInternalReviews)(actor, host);
  const ranked = prioritizePreparation(review.data.rows, now);
  const items: PreparationItem[] = ranked.selected.map(({ row, domain, priorityReason }) => {
    const eligibilitySummary = summarizePreparationEligibility(row);
    const contactDraftContext = buildInternalContactDraftContext(row);
    const savedSnapshot = snapshots.find(
      (s) => s.contact.hubspotRecordId === row.contact.hubspotRecordId,
    );
    const receipt = savedSnapshot?.preparation;
    const latestAttempt = savedSnapshot?.preparationAttempts?.at(-1);
    const contactBoundMatch = (d: InternalCompanyDocument) =>
      matchesContactBoundCompany(d, domain, row.contact.companyName, row.contact.hubspotRecordId);
    const doc = documents
      .filter((d) => d.owner === actor && (matches(d, domain) || contactBoundMatch(d)))
      .sort(
        (a, b) =>
          Number(b.automatic?.internalContact?.contactId === row.contact.hubspotRecordId) -
            Number(a.automatic?.internalContact?.contactId === row.contact.hubspotRecordId) ||
          b.createdAt.localeCompare(a.createdAt),
      )[0];
    let reusable = false;
    if (doc) {
      try {
        const verifiedContactAssociation = contactBoundMatch(doc);
        verifyReusableCompanyResearch(
          doc,
          actor,
          verifiedContactAssociation ? row.contact.companyName! : domain,
          now,
        );
        reusable = true;
      } catch {
        /* never reuse unverified findings */
      }
    }
    const savedResult = doc?.automatic;
    const hasContactPacket =
      savedResult?.internalContact?.contactId === row.contact.hubspotRecordId &&
      savedResult.directDrafts?.emails.length === 4 &&
      !!savedResult.directReview;
    const reviseContactPacket =
      reusable && hasContactPacket && savedResult?.directReview?.verdict === "REVISE";
    let action: PreparationItem["action"] = reviseContactPacket
      ? "REUSE_RESEARCH"
      : reusable && hasContactPacket
        ? "REUSE_PACKET"
        : reusable
          ? "REUSE_RESEARCH"
          : "RESEARCH";
    let reason = reviseContactPacket
      ? "The saved contact packet was marked REVISE. Reuse its verified grounded research for a fresh writing and independent-review version; the previous packet remains preserved."
      : action === "REUSE_PACKET"
        ? "Existing contact-specific packet for this HubSpot record; no new AI calls."
        : action === "REUSE_RESEARCH"
          ? "Reuse verified company facts; prepare this contact's internal drafts and independent review only."
          : "Company research, factual grounding, contact-personalized internal drafts and independent review.";
    const result = hasContactPacket ? savedResult : undefined;
    const unfinished = snapshots.some(
      (s) => s.preparation?.companyDomain === domain && s.preparation.state === "PREPARING",
    );
    if (
      unfinished ||
      (receipt?.companyDomain === domain && receipt.state === "BLOCKED") ||
      (savedResult && ["RUNNING", "FAILED", "BLOCKED", "NO_PITCH"].includes(savedResult.status))
    ) {
      action = "BLOCKED";
      reason =
        "Existing interrupted or blocked preparation requires human review; no automatic retry.";
    }
    if (doc && !reusable && savedResult && action !== "BLOCKED") {
      action = "BLOCKED";
      reason =
        "Saved company evidence is stale or cannot be revalidated. Review it before authorizing fresh research.";
    }
    const outreach = row.provenance.filter((p) => p.provider === "OUTREACH");
    return {
      contactId: row.contact.hubspotRecordId,
      name: row.contact.fullName,
      company: row.contact.companyName ?? domain,
      domain,
      priorityReason,
      eligibility: row.qualification.status,
      holdReasons: [...new Set([...row.qualification.holdReasons, ...row.plan.decision.reasons])],
      ...eligibilitySummary,
      contactDraftContext,
      outreach: outreach.length
        ? "Existing Outreach observations available; matching and coverage do not imply eligibility clearance."
        : "UNRESOLVED — no usable Outreach observations; history and suppression remain HOLD.",
      action,
      maxCalls: action === "RESEARCH" ? 5 : action === "REUSE_RESEARCH" ? 2 : 0,
      ...(reviseContactPacket
        ? {
            estimatedIncrementalUsd: doc ? priorWritingReviewEstimate(doc) : null,
            requiresIncrementalEstimate: true,
          }
        : {}),
      reason,
      ...(latestAttempt ? { latestAttempt } : {}),
      ...(receipt?.companyDomain === domain ? { receipt } : {}),
      ...(doc ? { documentId: doc.id, createdAt: doc.createdAt, result } : {}),
    };
  });
  let aiReady = false;
  let budget: PreparationPlan["budget"] = null;
  const warnings = [...review.data.warnings];
  try {
    const config = automaticCompanyConfig(actor);
    const state = await (deps.budget ?? new LocalCompanyBudgetStore()).get(actor);
    const day = jerusalemParts(now).date;
    budget = {
      dayRemaining: Math.max(
        0,
        config.budget.dailyBudgetUsd - (state.days[day]?.estimatedUsd ?? 0),
      ),
      monthRemaining: Math.max(
        0,
        config.budget.monthlyBudgetUsd - (state.months[day.slice(0, 7)] ?? 0),
      ),
      pending: Object.keys(state.pending).length,
      uncertain: state.days[day]?.uncertainRequests ?? 0,
    };
    aiReady = budget.pending === 0 && budget.dayRemaining > 0 && budget.monthRemaining > 0;
  } catch {
    warnings.push(
      "AI configuration or usage ledger unavailable; paid preparation remains blocked.",
    );
  }
  if (documents.length + items.filter((i) => i.maxCalls > 0).length > 25) {
    aiReady = false;
    warnings.push(
      "Existing local review storage limit reached. No historical records will be removed.",
    );
  }
  return {
    considered: ranked.considered,
    items,
    excluded: ranked.excluded,
    warnings,
    aiReady,
    budget,
    maxCalls: items.reduce((sum, i) => sum + i.maxCalls, 0),
    maxEstimatedUsd:
      budget && items.some((item) => item.maxCalls > 0)
        ? Math.max(0, Math.min(budget.dayRemaining, budget.monthRemaining))
        : 0,
  };
}

const choiceCompanyLabels = new Set([
  "choicehotels",
  "choicehotelsinternationalinc",
  "choicehotelsinternational",
]);

/** Resolve contact context from an owner-scoped saved snapshot; request data supplies only its ID. */
export async function resolveChoiceContinuationContact(
  actor: string,
  host: string | null,
  contactId: string,
  deps: Dependencies = {},
): Promise<
  import("@/features/agent-workforce/company-research/internal-review").InternalContactDraftContext
> {
  access(actor, host);
  const store = deps.store ?? new PrismaEvidenceStore();
  const plan = await getPreparationPlan(actor, host, { ...deps, store });
  const item = plan.items.find((candidate) => candidate.contactId === contactId);
  if (!item || item.contactDraftContext.contactId !== contactId)
    throw Error("CONTINUATION_CONTACT_NOT_AVAILABLE");

  const normalizedName = item.contactDraftContext.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!choiceCompanyLabels.has(normalizedName))
    throw Error("CONTINUATION_CONTACT_COMPANY_MISMATCH");

  const snapshots = (await store.list(actor)).flatMap((raw) => {
    const parsed = snapshotSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  const snapshot = snapshots.find((candidate) => candidate.contact.hubspotRecordId === contactId);
  if (
    !snapshot ||
    snapshot.contact.ownerId !== "1087915602" ||
    snapshot.contact.companyDomain?.toLowerCase() !==
      item.contactDraftContext.companyDomain.toLowerCase() ||
    snapshot.contact.companyName?.toLowerCase().replace(/[^a-z0-9]/g, "") !== normalizedName
  )
    throw Error("CONTINUATION_CONTACT_IDENTITY_UNVERIFIED");

  // The context builder only admits fresh, accepted, independently supported employment/role facts.
  // HOLD and unresolved facts remain attached; email addresses are never included.
  return item.contactDraftContext;
}

/** One finite user action, serial execution, no jobs, retries, credentials or CRM writes. */
export async function prepareProspects(
  actor: string,
  host: string | null,
  allowPaid: boolean,
  contactId: string,
  deps: Dependencies = {},
) {
  access(actor, host);
  if (!contactId || contactId.length > 200) throw Error("PREPARATION_CONTACT_NOT_AVAILABLE");
  if (inFlight.has(actor)) throw Error("PREPARATION_BUSY");
  inFlight.add(actor);
  const store = deps.store ?? new PrismaEvidenceStore();
  const batchId = randomUUID();
  let newCalls = 0,
    newEstimatedUsd = 0;
  const notes: string[] = [];
  let currentStage: PreparationAttempt["stage"] = "PLAN";
  let attempt: PreparationAttempt | undefined;
  let attemptDomain: string | undefined;
  const checkpointAttempt = async (patch: Partial<PreparationAttempt> = {}) => {
    if (!attempt || !attemptDomain) return;
    attempt = preparationAttemptSchema.parse({
      ...attempt,
      ...patch,
      updatedAt: (deps.now?.() ?? new Date()).toISOString(),
    });
    await persistPreparationAttempt(store, actor, contactId, attemptDomain, attempt);
  };
  try {
    let plan = onlySelectedContact(await getPreparationPlan(actor, host, deps), contactId);
    const submittedPlan = plan;
    attemptDomain = submittedPlan.items[0].domain;
    attempt = preparationAttemptSchema.parse({
      attemptId: batchId,
      companyDomain: attemptDomain,
      paidAuthorized: allowPaid,
      stage: "PLAN",
      outcome: "STARTED",
      submittedAt: (deps.now?.() ?? new Date()).toISOString(),
      updatedAt: (deps.now?.() ?? new Date()).toISOString(),
      failureCode: null,
      actualCalls: null,
      actualEstimatedUsd: null,
    });
    await checkpointAttempt();
    currentStage = "PREFLIGHT";
    await checkpointAttempt({ stage: currentStage });
    if (
      allowPaid &&
      plan.items[0].requiresIncrementalEstimate &&
      plan.items[0].estimatedIncrementalUsd == null
    )
      throw Error("PREPARATION_INCREMENTAL_ESTIMATE_UNAVAILABLE");
    if (allowPaid && (!plan.aiReady || plan.budget?.pending))
      throw Error("PREPARATION_AI_NOT_READY");
    if (!plan.considered) {
      // Existing bounded historical intake: one page of ten, never an account-wide loop.
      const collected = await (deps.collect ?? collectSalesAgentEvidence)(actor, undefined, {
        intakeWindow: "PAST_YEAR",
      });
      if (!collected.ok) throw Error("PREPARATION_INTAKE_FAILED");
      notes.push(
        `Read ${collected.data.collected} contacts from one owner-scoped past-year page. No automatic pagination.`,
      );
      plan = onlySelectedContact(await getPreparationPlan(actor, host, deps), contactId);
    }
    const selectedIds = new Set([contactId]);
    currentStage = "OUTREACH_CHECK";
    await checkpointAttempt({ stage: currentStage });
    // Reuse today's read-only checks, including unresolved checks, rather than repeating them.
    for (const item of plan.items) {
      const raw = (await store.list(actor)).find(
        (r) =>
          snapshotSchema.safeParse(r).success &&
          snapshotSchema.parse(r).contact.hubspotRecordId === item.contactId,
      );
      const snapshot = snapshotSchema.parse(raw);
      if (
        snapshot.contact.ownerId !== "1087915602" ||
        snapshot.contact.hubspotRecordId !== item.contactId ||
        preparationDomain(snapshot.contact.companyDomain) !== item.domain
      )
        throw Error("PREPARATION_IDENTITY_CHANGED");
      const now = deps.now?.() ?? new Date();
      const age = now.getTime() - Date.parse(snapshot.collectedAt);
      if (snapshot.providers.some((p) => p.provider === "OUTREACH") && age >= 0 && age < 86400000)
        continue;
      const collected = await (deps.outreach ?? localOutreachEvidence)(actor).collect(
        snapshot.contact,
        now,
      );
      const observations = observationSchema.array().parse(collected.observations);
      if (
        observations.some((o) => o.provider !== "OUTREACH" || o.hubspotRecordId !== item.contactId)
      )
        throw Error("PREPARATION_IDENTITY_CHANGED");
      await store.edit(actor, item.contactId, (current) => {
        const parsed = snapshotSchema.parse(current);
        if (JSON.stringify(parsed.contact) !== JSON.stringify(snapshot.contact))
          throw Error("PREPARATION_IDENTITY_CHANGED");
        return {
          ...parsed,
          provenanceAtCollection: normalizeCollectedEvidence(
            parsed.contact,
            [...parsed.observations, ...observations],
            now,
          ).provenance,
          observations: [...parsed.observations, ...observations],
          blockers: [...new Set([...parsed.blockers, ...collected.blockers])],
          providers: [
            ...parsed.providers.filter((p) => p.provider !== "OUTREACH"),
            {
              provider: "OUTREACH" as const,
              status: observations.length ? ("CONNECTED" as const) : ("NOT_CONFIGURED" as const),
              message: "Read-only preparation check; unresolved coverage remains HOLD",
            },
          ],
          collectedAt: now.toISOString(),
        };
      });
    }
    const refreshedPlan = await getPreparationPlan(actor, host, deps);
    const refreshedSelected = refreshedPlan.items.find((item) => item.contactId === contactId);
    // A newly observed block can remove the contact from the priority list. Preserve the fresh
    // HOLD/exclusion result and do not try a second candidate in this single-contact action.
    if (!refreshedSelected) {
      await checkpointAttempt({
        stage: currentStage,
        outcome: "BLOCKED",
        failureCode: "PREPARATION_CONTACT_NOT_AVAILABLE",
        actualCalls: 0,
        actualEstimatedUsd: 0,
      });
      const persistedPlan = await getPreparationPlan(actor, host, deps);
      return {
        ...persistedPlan,
        lastAction: {
          paidAuthorized: allowPaid,
          outcome: "BLOCKED" as const,
          companies: [submittedPlan.items[0].name + " · " + submittedPlan.items[0].company],
          maxCalls: submittedPlan.maxCalls,
          maxEstimatedUsd: submittedPlan.maxEstimatedUsd,
          actualCalls: 0,
          actualEstimatedUsd: 0,
        },
        warnings: [
          ...refreshedPlan.warnings,
          "Selected contact became excluded during fresh checks; no AI work started.",
        ],
      };
    }
    plan = onlySelectedContact(refreshedPlan, contactId);
    // Never replace an excluded candidate with an unreviewed one during this action.
    for (const item of plan.items.filter((i) => selectedIds.has(i.contactId))) {
      if (!allowPaid || !item.maxCalls) continue;
      const preflight = onlySelectedContact(await getPreparationPlan(actor, host, deps), contactId);
      if (!preflight.aiReady || preflight.budget?.pending) {
        notes.push("Stopped: AI budget or pending-request preflight failed. No retry.");
        currentStage = "PREFLIGHT";
        await checkpointAttempt({
          stage: currentStage,
          outcome: "BLOCKED",
          failureCode: "PREPARATION_AI_NOT_READY",
          actualCalls: 0,
          actualEstimatedUsd: 0,
        });
        break;
      }
      const fresh = preflight.items.find((i) => i.contactId === item.contactId);
      if (!fresh || fresh.domain !== item.domain || fresh.action !== item.action)
        throw Error("PREPARATION_IDENTITY_CHANGED");
      if (fresh.requiresIncrementalEstimate && fresh.estimatedIncrementalUsd == null)
        throw Error("PREPARATION_INCREMENTAL_ESTIMATE_UNAVAILABLE");
      const startedAt = (deps.now?.() ?? new Date()).toISOString();
      currentStage = "CLAIM";
      await checkpointAttempt({ stage: currentStage });
      const claimed = await store.edit(actor, item.contactId, (raw) => {
        const current = snapshotSchema.parse(raw);
        if (
          preparationDomain(current.contact.companyDomain) !== item.domain ||
          current.contact.ownerId !== "1087915602"
        )
          throw Error("PREPARATION_IDENTITY_CHANGED");
        if (current.preparation?.companyDomain === item.domain) {
          const oneTimeContactContinuation =
            item.action === "REUSE_RESEARCH" &&
            current.preparation.state === "REVIEW_REQUIRED" &&
            current.preparation.documentId === item.documentId;
          if (!oneTimeContactContinuation) throw Error("PREPARATION_ALREADY_ATTEMPTED");
        }
        return {
          ...current,
          provenanceAtCollection: normalizeCollectedEvidence(
            current.contact,
            current.observations,
            new Date(startedAt),
          ).provenance,
          preparation: {
            batchId,
            companyDomain: item.domain,
            state: "PREPARING",
            startedAt,
            reason:
              "Single authorized attempt; interrupted execution must be reviewed, never automatically retried.",
          },
        };
      });
      if (!claimed) throw Error("PREPARATION_CLAIM_FAILED");
      currentStage = "WRITING_REVIEW";
      await checkpointAttempt({ stage: currentStage });
      const savedResearchDomain = preparationDomain(fresh.result?.run?.intake.companyDomain);
      const reuseCompany =
        item.action === "REUSE_RESEARCH" &&
        savedResearchDomain &&
        savedResearchDomain !== item.domain
          ? fresh.company
          : item.domain;
      const doc = await (deps.create ?? createInternalReview)(
        actor,
        host,
        {
          company: reuseCompany,
          ...(item.action === "REUSE_RESEARCH" ? { reuseResearchId: item.documentId } : {}),
        },
        true,
        {
          maxModelCalls: 5,
          contactDraft: fresh.contactDraftContext,
        },
      );
      newCalls += doc.automatic?.modelCalls ?? 0;
      newEstimatedUsd +=
        doc.automatic?.usage.reduce((sum, u) => sum + (u.estimatedCostUsd ?? 0), 0) ?? 0;
      await store.edit(actor, item.contactId, (raw) => {
        const current = snapshotSchema.parse(raw);
        if (current.preparation?.batchId !== batchId) throw Error("PREPARATION_IDENTITY_CHANGED");
        return {
          ...current,
          provenanceAtCollection: normalizeCollectedEvidence(
            current.contact,
            current.observations,
            deps.now?.() ?? new Date(),
          ).provenance,
          preparation: {
            ...current.preparation,
            state: doc.automatic?.status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "BLOCKED",
            finishedAt: (deps.now?.() ?? new Date()).toISOString(),
            documentId: doc.id,
            reason:
              doc.automatic?.status === "REVIEW_REQUIRED"
                ? "Internal packet produced; inspect independent verdict and human review. No outbound clearance."
                : "Preparation incomplete. Inspect saved evidence; no automatic retry.",
          },
        };
      });
      if (doc.automatic?.status !== "REVIEW_REQUIRED") {
        notes.push(
          "Batch stopped after incomplete preparation; remaining companies were not attempted.",
        );
        break;
      }
    }
    const result = await getPreparationPlan(actor, host, deps);
    const companies = submittedPlan.items.map((item) => `${item.name} · ${item.company}`);
    const selectedResult = result.items.find((item) => item.contactId === contactId);
    const incomplete =
      allowPaid &&
      (!selectedResult ||
        selectedResult.action === "BLOCKED" ||
        selectedResult.receipt?.state === "BLOCKED" ||
        (submittedPlan.items[0].maxCalls > 0 &&
          selectedResult.receipt?.state !== "REVIEW_REQUIRED"));
    const lastAction: PreparationActionReport = {
      paidAuthorized: allowPaid,
      outcome: !allowPaid ? "NOT AUTHORIZED" : incomplete ? "BLOCKED" : "COMPLETED",
      companies,
      maxCalls: submittedPlan.maxCalls,
      maxEstimatedUsd: submittedPlan.maxEstimatedUsd,
      actualCalls: newCalls,
      actualEstimatedUsd: newEstimatedUsd,
    };
    await checkpointAttempt({
      stage: incomplete || !allowPaid ? currentStage : "COMPLETE",
      outcome: lastAction.outcome,
      failureCode: allowPaid && incomplete ? "PREPARATION_INCOMPLETE" : null,
      actualCalls: newCalls,
      actualEstimatedUsd: newEstimatedUsd,
      ...(selectedResult?.documentId ? { documentId: selectedResult.documentId } : {}),
    });
    const persistedResult = await getPreparationPlan(actor, host, deps);
    return {
      ...persistedResult,
      batchId,
      newCalls,
      newEstimatedUsd,
      lastAction,
      warnings: [
        ...result.warnings,
        ...notes,
        ...(!allowPaid && result.maxCalls
          ? [
              "No paid calls authorized or started. Review this bounded plan before allowing AI preparation.",
            ]
          : []),
      ],
    };
  } catch (error) {
    if (attempt) {
      const noExecutionStarted = ["PLAN", "PREFLIGHT", "OUTREACH_CHECK", "CLAIM"].includes(
        currentStage,
      );
      try {
        await checkpointAttempt({
          stage: currentStage,
          outcome: "BLOCKED",
          failureCode: sanitizedPreparationFailure(error),
          actualCalls: noExecutionStarted ? 0 : null,
          actualEstimatedUsd: noExecutionStarted ? 0 : null,
        });
      } catch {
        // Do not replace the original sanitized route error if persistence itself is unavailable.
      }
    }
    throw error;
  } finally {
    inFlight.delete(actor);
  }
}
