import "server-only";
import fixture from "./fixtures/nike-public-excerpts-2026-10-18.json";
import { companyRunSchema } from "@/features/agent-workforce/company-research/contracts";
import { groundedFactSchema, sourceSchema } from "@/features/agent-workforce/gate-a-contracts";
import { buildGroundingAudit } from "./grounding-audit";
import { judgeCompanyResearch } from "./judgement";

/** Offline replay uses saved public excerpts only. Reviewer decisions below are explicitly simulated.
 * The baseline reconstructs the documented zero-finding outcome; it is not a database export.
 */
export function nikeJudgementDemo() {
  const at = new Date(fixture.at);
  const sources = sourceSchema.array().parse(fixture.sources);
  const who = sources.find((s) => s.url.endsWith("/who-we-are"))!;
  const fact = groundedFactSchema.parse({
    id: "account:products",
    subject: "ACCOUNT",
    category: "PRODUCTS",
    statement:
      "NIKE's product categories include athletic footwear, apparel, equipment, and accessories.",
    sourceIds: [who.id],
    confidence: "HIGH",
    limitations: [
      "Self-description only; no market leadership, paid-search spend or savings inferred.",
    ],
    quotes: [
      {
        sourceId: who.id,
        text: "NIKE, Inc. is the world's leading designer, marketer, and distributor of authentic athletic footwear, apparel, equipment, and accessories for a wide variety of sports and fitness activities.",
      },
    ],
  });
  const baseline = companyRunSchema.parse({
    version: 1,
    id: "offline-historical-nike-evidence",
    input: fixture.input,
    createdAt: fixture.at,
    updatedAt: fixture.at,
    status: "INCOMPLETE",
    research: {
      accountDomain: "nike.com",
      prospectId: "offline-historical-nike-evidence",
      researchedAt: fixture.at,
      sources,
      facts: [],
      gaps: [],
      assumptions: [],
    },
    issues: ["Historical independent grounding failed; original reviewer decisions unavailable."],
    usage: [],
    approved: false,
    canSend: false,
    canEnroll: false,
  });
  const candidate = structuredClone(baseline);
  candidate.research.facts = [fact];
  candidate.groundingAudit = buildGroundingAudit(candidate.research, "UNAVAILABLE");
  const accepted = structuredClone(candidate);
  accepted.status = "REVIEW_REQUIRED";
  accepted.issues = [];
  accepted.groundingAudit = buildGroundingAudit(accepted.research, {
    identityMatches: true,
    supportedFactIds: [fact.id],
    rejectedFactIds: [],
    concerns: [],
  });
  const rejected = structuredClone(candidate);
  rejected.research.facts[0].statement = "Nike spends $100 million on paid search each year.";
  rejected.groundingAudit = buildGroundingAudit(rejected.research, {
    identityMatches: true,
    supportedFactIds: [],
    rejectedFactIds: [fact.id],
    concerns: [
      {
        severity: "BLOCKING",
        scope: "FACT",
        code: "CLAIM_NOT_ENTAILED",
        reason: "The quoted company description does not support paid-search spending.",
        factIds: [fact.id],
        sourceIds: [who.id],
      },
    ],
  });
  rejected.research.facts = []; // Preserve the service's all-or-nothing withholding behavior.
  return {
    at,
    baseline,
    candidate,
    accepted,
    rejected,
    reports: [
      {
        title: "1. Historical baseline: retained evidence, original decisions unavailable",
        report: judgeCompanyResearch(baseline, at, "SAVED_RUN"),
      },
      {
        title: "2. New offline candidate: exact quote passes; independent review unavailable",
        report: judgeCompanyResearch(candidate, at, "OFFLINE_SIMULATION"),
      },
      {
        title: "3. Positive control: simulated reviewer acceptance of a narrow product claim",
        report: judgeCompanyResearch(accepted, at, "OFFLINE_SIMULATION"),
      },
      {
        title:
          "4. Negative control: invented spending claim rejected (test claim, never a Nike finding)",
        report: judgeCompanyResearch(rejected, at, "OFFLINE_SIMULATION"),
      },
    ],
  };
}
