import "server-only";
import { type WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import {
  companyGroundingReviewSchema,
  type CompanyGroundingReview,
} from "@/features/agent-workforce/company-research/grounding-review";
import {
  groundingAuditSchema,
  type GroundingAudit,
} from "@/features/agent-workforce/company-research/grounding-audit";

type Review = CompanyGroundingReview;
type Research = WorkforceRun["research"];
const sensitive =
  /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:sk-|Bearer\s|postgres(?:ql)?:\/\/|password|api[_ -]?key|access[_ -]?token|secret|ssn|date of birth|home address|private contact|personal phone)|\+?\d[\d(). -]{8,}\d)/i;
const sourceId = /^(?:web:[a-f0-9]{20}|import:[A-Za-z0-9:_-]{1,100})$/;
const count = (n: number) => Math.min(n, 10000);
/** Audit predicates mirror the existing acceptance criteria; they do not grant acceptance. */
export function groundingRejectionReasons(
  review: Review,
  facts: Research["facts"],
  sources: Research["sources"],
): GroundingAudit["reasonCodes"] {
  const reasons: GroundingAudit["reasonCodes"] = [];
  if (!review.identityMatches) reasons.push("IDENTITY_MISMATCH");
  if (review.concerns.some((c) => c.severity === "BLOCKING")) reasons.push("REVIEWER_CONCERNS");
  if (review.rejectedFactIds.length) reasons.push("REJECTED_FACTS");
  if (review.supportedFactIds.length !== facts.length) reasons.push("SUPPORTED_COUNT_MISMATCH");
  if (new Set(review.supportedFactIds).size !== facts.length)
    reasons.push("SUPPORTED_ID_COVERAGE_MISMATCH");
  if (new Set(review.supportedFactIds).size !== review.supportedFactIds.length)
    reasons.push("DUPLICATE_SUPPORTED_IDS");
  if (facts.some((f) => !review.supportedFactIds.includes(f.id)))
    reasons.push("MISSING_SUPPORTED_IDS");
  const factIds = new Set(facts.map((f) => f.id));
  const sourceIds = new Set(sources.map((s) => s.id));
  const decisions = [...review.supportedFactIds, ...review.rejectedFactIds];
  const blocking = review.concerns.filter((c) => c.severity === "BLOCKING");
  const inconsistent =
    decisions.length !== facts.length ||
    new Set(decisions).size !== decisions.length ||
    decisions.some((id) => !factIds.has(id)) ||
    review.concerns.some(
      (c) =>
        (c.severity === "NONBLOCKING") !== (c.code === "CONTEXT_LIMITATION") ||
        c.factIds.some((id) => !factIds.has(id)) ||
        c.sourceIds.some((id) => !sourceIds.has(id)) ||
        new Set(c.factIds).size !== c.factIds.length ||
        new Set(c.sourceIds).size !== c.sourceIds.length ||
        (c.scope === "FACT" && (!c.factIds.length || !c.sourceIds.length)) ||
        (c.scope === "SOURCE" && !c.sourceIds.length) ||
        (c.factIds.length > 0 &&
          c.sourceIds.some(
            (id) => !facts.some((f) => c.factIds.includes(f.id) && f.sourceIds.includes(id)),
          )) ||
        (c.scope === "FACT" &&
          c.factIds.some(
            (id) =>
              !facts.find((f) => f.id === id)?.sourceIds.some((sid) => c.sourceIds.includes(sid)),
          )) ||
        (c.scope === "FACT" &&
          c.severity === "BLOCKING" &&
          c.factIds.some((id) => review.supportedFactIds.includes(id))) ||
        (c.severity === "NONBLOCKING" &&
          c.factIds.some((id) => review.rejectedFactIds.includes(id))) ||
        (c.code === "IDENTITY" && review.identityMatches),
    ) ||
    (!review.identityMatches && !blocking.some((c) => c.code === "IDENTITY")) ||
    review.rejectedFactIds.some(
      (id) =>
        !blocking.some(
          (c) =>
            c.scope === "GLOBAL" ||
            c.factIds.includes(id) ||
            (c.scope === "SOURCE" &&
              facts.find((f) => f.id === id)?.sourceIds.some((sid) => c.sourceIds.includes(sid))),
        ),
    );
  if (inconsistent) reasons.push("INCONSISTENT_REVIEW");
  return reasons;
}
/** At most 12 candidates and 12,000 total text characters including bounded decision summaries.
 * No raw provider body, contact fields or reasoning trace. Invalid legacy replies fail closed.
 */
export function buildGroundingAudit(
  research: Research,
  response: Review | "MALFORMED" | "UNAVAILABLE",
): GroundingAudit {
  const parsed =
    typeof response === "string" ? undefined : companyGroundingReviewSchema.safeParse(response);
  const review = parsed?.success ? parsed.data : undefined;
  const reasonCodes = review
    ? groundingRejectionReasons(review, research.facts, research.sources)
    : ([
        response === "UNAVAILABLE" ? "REVIEW_UNAVAILABLE" : "MALFORMED_REVIEW",
      ] as GroundingAudit["reasonCodes"]);
  const status = review
    ? reasonCodes.length
      ? "REJECTED"
      : "ACCEPTED"
    : response === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : "MALFORMED";
  let remaining = 12000;
  const facts = research.facts.slice(0, 12);
  // Retain explanations first so candidate text cannot consume their bounded allowance.
  const concerns = review?.concerns.map((c) => {
    const candidateIds = facts.flatMap((f, i) =>
      c.factIds.includes(f.id) ? [`candidate-${i + 1}`] : [],
    );
    const sourceIds = c.sourceIds.filter(
      (id) => sourceId.test(id) && research.sources.some((s) => s.id === id),
    );
    const attributionOmitted =
      candidateIds.length !== c.factIds.length || sourceIds.length !== c.sourceIds.length;
    // Drop the whole summary instead of selectively revealing private or unknown identifiers.
    const privateReason =
      attributionOmitted ||
      sensitive.test(c.reason) ||
      /https?:\/\/|\b(?:token|credential|authorization|cookie|connection string|chain.of.thought|internal reasoning)\b|[\u0000-\u001f]/i.test(
        c.reason,
      );
    const reasonOmitted = privateReason
      ? ("SENSITIVE_CONTENT" as const)
      : c.reason.length > remaining
        ? ("AUDIT_TEXT_LIMIT" as const)
        : undefined;
    if (!reasonOmitted) remaining -= c.reason.length;
    return {
      severity: c.severity,
      code: c.code,
      scope: c.scope,
      candidateIds,
      sourceIds,
      attributionOmitted,
      ...(reasonOmitted ? { reasonOmitted } : { reason: c.reason }),
    };
  });
  function retain(
    text: string,
    exact = true,
  ): {
    text?: string;
    omitted?:
      | "SENSITIVE_CONTENT"
      | "AUDIT_TEXT_LIMIT"
      | "NOT_EXACT_PUBLIC_SOURCE"
      | "ACCEPTED_FINDING_REFERENCE";
  } {
    if (status === "ACCEPTED") return { omitted: "ACCEPTED_FINDING_REFERENCE" };
    if (!exact) return { omitted: "NOT_EXACT_PUBLIC_SOURCE" };
    if (sensitive.test(text)) return { omitted: "SENSITIVE_CONTENT" };
    if (text.length > remaining) return { omitted: "AUDIT_TEXT_LIMIT" };
    remaining -= text.length;
    return { text };
  }
  const candidates = facts.map((fact, index) => {
    const supported = review?.supportedFactIds.includes(fact.id) ?? false;
    const rejected = review?.rejectedFactIds.includes(fact.id) ?? false;
    const statement = retain(fact.statement);
    return {
      candidateId: `candidate-${index + 1}`,
      verified: false as const,
      deterministicChecks: "PASSED" as const,
      ...(/^account:[A-Za-z0-9:_-]{1,140}$/.test(fact.id) && !sensitive.test(fact.id)
        ? { factId: fact.id }
        : {}),
      reviewerDecision: !review
        ? ("UNAVAILABLE" as const)
        : supported && rejected
          ? ("CONFLICT" as const)
          : rejected
            ? ("REJECTED" as const)
            : supported
              ? ("SUPPORTED" as const)
              : ("NOT_LISTED" as const),
      ...(statement.text === undefined
        ? { statementOmitted: statement.omitted }
        : { statement: statement.text }),
      sourceIds: [...new Set(fact.sourceIds)]
        .filter((id) => sourceId.test(id) && research.sources.some((s) => s.id === id))
        .slice(0, 4),
      quotes: fact.quotes.slice(0, 4).map((quote) => {
        const source = research.sources.find((s) => s.id === quote.sourceId);
        const exact =
          !!source &&
          sourceId.test(source.id) &&
          fact.sourceIds.includes(source.id) &&
          source.excerpt.includes(quote.text);
        const retained = retain(quote.text, exact);
        return {
          sourceId: source && sourceId.test(source.id) ? source.id : "unknown-source",
          exactMatch: exact,
          ...(retained.text === undefined
            ? { textOmitted: retained.omitted }
            : { text: retained.text }),
        };
      }),
    };
  });
  const known = new Set(facts.map((f) => f.id));
  const reviewer = review
    ? {
        supportedCandidateIds: candidates
          .filter((c) => c.reviewerDecision === "SUPPORTED" || c.reviewerDecision === "CONFLICT")
          .map((c) => c.candidateId),
        rejectedCandidateIds: candidates
          .filter((c) => c.reviewerDecision === "REJECTED" || c.reviewerDecision === "CONFLICT")
          .map((c) => c.candidateId),
        supportedCount: count(review.supportedFactIds.length),
        rejectedCount: count(review.rejectedFactIds.length),
        unknownSupportedCount: count(review.supportedFactIds.filter((id) => !known.has(id)).length),
        unknownRejectedCount: count(review.rejectedFactIds.filter((id) => !known.has(id)).length),
        concernCount: review.concerns.length,
        // Legacy summary field stays compatible; precise codes and severity are in concerns.
        concernCodes: [
          ...new Set(
            review.concerns
              .filter((c) => c.code !== "CONTEXT_LIMITATION")
              .map((c) => c.code as Exclude<typeof c.code, "CONTEXT_LIMITATION">),
          ),
        ],
        concerns,
      }
    : undefined;
  return groundingAuditSchema.parse({
    version: 1,
    status,
    identityMatches: review?.identityMatches ?? null,
    reasonCodes,
    candidates,
    ...(reviewer ? { reviewer } : {}),
  });
}
