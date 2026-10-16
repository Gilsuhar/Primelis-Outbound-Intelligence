import "server-only";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { validateResearch } from "./evidence-validation";

export type OpportunityPriority = {
  level: "OBSERVED_SIGNAL" | "GROUNDED_HYPOTHESIS" | "RESEARCH_REQUIRED" | "NO_PITCH";
  reason: string;
  factIds: string[];
  observationIds: string[];
};
type Brief = Pick<WorkforceRun, "id" | "intake" | "research" | "prospectResearch">;
/** Evidence strength only. Never consumes or modifies eligibility, approval or send permissions. */
export function opportunityPriority(run: Brief | undefined, now: Date): OpportunityPriority {
  const missing = (reason: string): OpportunityPriority => ({
    level: "RESEARCH_REQUIRED",
    reason,
    factIds: [],
    observationIds: [],
  });
  const research = run?.prospectResearch;
  if (
    !run ||
    !research ||
    research.status === "STALE" ||
    !(Date.parse(research.expiresAt) > now.getTime()) ||
    research.stages.REVIEW.status !== "COMPLETE" ||
    research.stages.ASSESSMENT.status !== "COMPLETE" ||
    research.reviewIssues.length ||
    validateResearch(run, now).length
  )
    return missing("Fresh, source-grounded and reviewed opportunity evidence is required");
  const opportunity = research.opportunity;
  if (!opportunity) return missing("No reviewed opportunity assessment");
  if (opportunity.recommendedAngle === "NO_PITCH")
    return { level: "NO_PITCH", reason: opportunity.hypothesis, factIds: [], observationIds: [] };
  const facts = run.research.facts.filter((f) => opportunity.supportingFactIds.includes(f.id));
  if (
    opportunity.confidence === "LOW" ||
    facts.length !== new Set(opportunity.supportingFactIds).size ||
    !facts.some(
      (f) =>
        f.subject === "ACCOUNT" &&
        ["BUSINESS_MODEL", "PRODUCTS", "MARKETS", "DEVELOPMENT"].includes(f.category),
    ) ||
    !facts.some((f) => f.subject === "PROSPECT" && f.category === "RESPONSIBILITY")
  )
    return missing(
      "A commercial company context and corroborated buyer responsibility must support the angle; title alone is insufficient",
    );
  const observations = opportunity.supportingObservationIds.map((id) =>
    research.serp.find((s) => s.id === id),
  );
  if (
    observations.some(
      (s) =>
        !s ||
        !Number.isFinite(Date.parse(s.observedAt)) ||
        Date.parse(s.observedAt) > now.getTime() ||
        now.getTime() - Date.parse(s.observedAt) > 86400000,
    )
  )
    return missing("Cited SERP observations are missing, stale or future-dated");
  const observed = observations.some(
    (s) => s && (s.brandAdvertising === "OBSERVED" || s.otherAdvertiserDomains.length),
  );
  return {
    level: observed ? "OBSERVED_SIGNAL" : "GROUNDED_HYPOTHESIS",
    reason: observed
      ? "A dated branded-search snapshot supports a reviewed conversation hypothesis; it does not establish a persistent pattern or savings"
      : "Verified business context and buyer responsibility support a reviewed decision question; account-level search performance remains unmeasured",
    factIds: facts.map((f) => f.id),
    observationIds: opportunity.supportingObservationIds,
  };
}
const order: Record<OpportunityPriority["level"], number> = {
  OBSERVED_SIGNAL: 0,
  GROUNDED_HYPOTHESIS: 1,
  RESEARCH_REQUIRED: 2,
  NO_PITCH: 3,
};
export const compareOpportunityPriority = (a: OpportunityPriority, b: OpportunityPriority) =>
  order[a.level] - order[b.level];
