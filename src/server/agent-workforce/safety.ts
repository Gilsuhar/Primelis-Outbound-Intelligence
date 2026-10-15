import "server-only";
import { normalizeDomain } from "@/features/connected-research/url-safety";
import { qualifyProspect } from "@/features/sales-agent/qualification";
import type { WorkforceIntake, WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { PrismaEvidenceStore } from "@/server/sales-agent/evidence-store";
import { LocalSuppressionAdapter } from "@/server/sales-agent/local-suppression";
import {
  snapshotSchema,
  reviewEvidenceSnapshot,
} from "@/server/services/sales-agent-collection-service";

export async function checkWorkforceEligibility(
  actorId: string,
  input: WorkforceIntake,
  now: Date,
): Promise<WorkforceRun["eligibility"]> {
  const store = new PrismaEvidenceStore();
  const domain = normalizeDomain(input.companyDomain);
  const records = (await store.suppressionRecords()).map((record) => ({
    ...record,
    domain: record.domain ? normalizeDomain(record.domain) : undefined,
  }));
  const suppression = await new LocalSuppressionAdapter(records).collect(
    {
      hubspotRecordId: "manual-research",
      ownerId: "",
      fullName: input.prospectName,
      companyName: input.companyName,
      companyDomain: domain,
      observedAt: now.toISOString(),
      observations: [],
      warnings: [],
    },
    now,
  );
  if (suppression.observations.length)
    return {
      status: "REJECTED",
      reasons: suppression.observations.map((item) => item.value),
      blockDrafting: true,
    };
  const matching = (await store.list(actorId)).flatMap((raw) => {
    const p = snapshotSchema.safeParse(raw);
    return p.success &&
      p.data.contact.fullName.trim().toLowerCase() === input.prospectName.trim().toLowerCase() &&
      p.data.contact.companyDomain &&
      normalizeDomain(p.data.contact.companyDomain) === domain
      ? [p.data]
      : [];
  });
  if (matching.length === 1) {
    const decision = reviewEvidenceSnapshot(matching[0], now).plan.decision;
    const restriction = decision.reasons.some((reason) =>
      /four calendar months|active outreach sequence|conflicting active opportunity|unauthorized|not owned/i.test(
        reason,
      ),
    );
    return {
      status: decision.status,
      reasons: decision.reasons,
      blockDrafting: decision.status === "REJECTED" || restriction,
    };
  }
  const decision = qualifyProspect({}, now);
  return {
    status: "HOLD",
    reasons: [
      matching.length > 1
        ? "Conflicting saved identities require review"
        : "Manual research intake does not establish verified CRM identity or contact eligibility",
      ...decision.reasons,
    ],
    blockDrafting: false,
  };
}
