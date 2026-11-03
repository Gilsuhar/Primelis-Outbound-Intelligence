import "server-only";
import {
  signalReportSchema,
  type SignalReport,
} from "@/features/agent-workforce/signal-opportunity";
import type { CompanyRun } from "@/features/agent-workforce/company-research/contracts";
import { judgeCompanyResearch } from "../company-research/judgement";
import { signalDraftEditorialConcerns } from "./drafting";
import { signalPacketHash } from "./semantic-review";

/** Read-only diagnostics. Never accepts a fact, clears a contact, or authorizes outbound. */
export function assessSignalPacket(run: CompanyRun, raw: SignalReport, now: Date) {
  const parsed = signalReportSchema.safeParse(raw);
  if (!parsed.success)
    return {
      status: "INVALID_PACKET" as const,
      semanticReview: "NOT_RUN" as const,
      readyForApproval: false as const,
    };
  const report = parsed.data;
  const factual = judgeCompanyResearch(
    run,
    now,
    report.mode === "SIMULATED" ? "OFFLINE_SIMULATION" : "SAVED_RUN",
  );
  const facts = new Map(run.research.facts.map((f) => [f.id, f]));
  const groundedProvenance =
    !factual.hardFailures.length &&
    report.insights.length === 3 &&
    report.insights.every((insight) => {
      const fact = facts.get(insight.factId);
      return (
        fact &&
        fact.statement === insight.statement &&
        JSON.stringify(fact.quotes) === JSON.stringify(insight.quotes) &&
        JSON.stringify(fact.sourceIds) === JSON.stringify(insight.sourceIds)
      );
    });
  const issues = signalDraftEditorialConcerns(report, run.input.companyName);
  const bodies = report.emails.map((m) => m.body.toLowerCase().replace(/\s+/g, " ").trim());
  const knownFacts = new Set(report.insights.map((f) => f.factId));
  const checks = {
    groundedProvenance,
    // Reflects the upstream gate; this function cannot independently recreate CRM authority.
    upstreamRecipientClearance:
      report.eligibility === "Eligible" && !!report.contact && !report.blockers.length,
    fourDrafts: report.emails.length === 4,
    knownFactCitations: report.emails.every((m) => m.factIds.every((id) => knownFacts.has(id))),
    distinctBodies: report.emails.length === 4 && new Set(bodies).size === 4,
    editorialRules: issues.length === 0,
    outboundBlocked: !report.approved && !report.canSend && !report.canEnroll,
  };
  const semantic = report.semanticReview;
  const validSemantic =
    !!semantic &&
    semantic.mode === report.mode &&
    semantic.packetHash === signalPacketHash(run, report) &&
    Date.parse(semantic.reviewedAt) <= +now &&
    +now - Date.parse(semantic.reviewedAt) <= 86400000;
  return {
    status:
      report.eligibility === "HOLD"
        ? ("CORRECTLY_BLOCKED_OR_INCOMPLETE" as const)
        : Object.values(checks).every(Boolean)
          ? ("DETERMINISTIC_CHECKS_PASS" as const)
          : ("REVISE_OR_BLOCK" as const),
    checks,
    editorialIssues: issues,
    wordsPerEmail: report.emails.map((m) => m.body.split(/\s+/).filter(Boolean).length),
    semanticReview: !semantic
      ? "NOT_RUN"
      : !validSemantic
        ? "STALE_OR_MISMATCHED"
        : semantic.status,
    simulatedReviewReady:
      report.mode === "SIMULATED" &&
      Object.values(checks).every(Boolean) &&
      validSemantic &&
      semantic?.status === "PASS",
    // Diagnostics are not an authorization gate. Future live review must re-read eligibility/knowledge.
    readyForApproval: false as const,
    limitation:
      "Rules and exact provenance checks do not assess semantic sales usefulness, naturalness or implied claims. The semantic review uses the existing model interface and shared commercial/editorial rubrics; SIMULATED decisions prove contract handling only, not independent AI quality. No real-world time-saving estimate follows from fixture completion.",
  };
}
