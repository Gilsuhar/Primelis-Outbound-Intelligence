import "server-only";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { validateResearch } from "./evidence-validation";
const normalized = (s: string) => s.trim().toLowerCase();
function mentionsPerson(value: string, person: string) {
  try {
    value = decodeURIComponent(value);
  } catch {
    /* Rejecting known identity strings does not require interpreting malformed escapes. */
  }
  const identity = (text: string) => normalized(text).replace(/[^a-z0-9]/g, "");
  return identity(value).includes(identity(person));
}
/** Reuse only reviewed public account facts, never a person's research, strategy, eligibility or drafts. */
export function reusableCompanyResearch(candidate: WorkforceRun, target: WorkforceRun, now: Date) {
  const state = candidate.prospectResearch;
  if (
    candidate.id === target.id ||
    !state ||
    state.status === "STALE" ||
    state.stages.COMPANY.status !== "COMPLETE" ||
    state.stages.REVIEW.status !== "COMPLETE" ||
    state.reviewIssues.length ||
    !(Date.parse(state.expiresAt) > now.getTime()) ||
    normalized(candidate.intake.companyDomain) !== normalized(target.intake.companyDomain) ||
    normalized(candidate.intake.companyName) !== normalized(target.intake.companyName) ||
    normalized(candidate.intake.targetMarket ?? "") !==
      normalized(target.intake.targetMarket ?? "") ||
    validateResearch(candidate, now).length
  )
    return null;
  const facts = candidate.research.facts.filter(
    (f) =>
      f.subject === "ACCOUNT" &&
      !mentionsPerson(
        f.statement + " " + f.quotes.map((q) => q.text).join(" ") + " " + f.limitations.join(" "),
        candidate.intake.prospectName,
      ),
  );
  if (
    !facts.some((f) =>
      ["BUSINESS_MODEL", "PRODUCTS", "MARKETS", "DEVELOPMENT"].includes(f.category),
    )
  )
    return null;
  const sources = candidate.research.sources.filter((s) =>
    facts.some((f) => f.sourceIds.includes(s.id)),
  );
  if (
    sources.some(
      (s) =>
        !["COMPANY_SITE", "PUBLIC_WEB"].includes(s.sourceType) ||
        mentionsPerson(s.title + " " + s.url, candidate.intake.prospectName) ||
        !Number.isFinite(Date.parse(s.observedAt)) ||
        Date.parse(s.observedAt) > now.getTime() ||
        now.getTime() - Date.parse(s.observedAt) >= 86400000,
    )
  )
    return null;
  // Keep exact, previously retrieved quotes and provenance; exclude unrelated page text about another prospect.
  const result = {
    facts: structuredClone(facts),
    sources: sources.map((s) => ({
      ...s,
      excerpt: [
        ...new Set(
          facts.flatMap((f) => f.quotes.filter((q) => q.sourceId === s.id).map((q) => q.text)),
        ),
      ].join("\n"),
    })),
    expiresAt: new Date(
      Math.min(
        Date.parse(state.expiresAt),
        ...sources.map((s) => Date.parse(s.observedAt) + 86400000),
      ),
    ).toISOString(),
  };
  return result;
}
