import "server-only";
import { createHash } from "node:crypto";
import {
  companyRunSchema,
  type CompanyRun,
} from "@/features/agent-workforce/company-research/contracts";
import { validateResearch } from "../evidence-validation";

export type EvaluationMode = "SAVED_RUN" | "OFFLINE_SIMULATION";
const sensitive =
  /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:sk-|Bearer\s|postgres(?:ql)?:\/\/|password|api[_ -]?key|access[_ -]?token|secret|personal phone|home address)|\+?\d[\d(). -]{8,}\d)/i;
const publicText = (value: string) =>
  sensitive.test(value) ? "[Content withheld by report privacy filter]" : value;
const numbers = (text: string) =>
  text.match(/\b\d+(?:[.,]\d+)*(?:\s*%|\s*(?:billion|million|thousand|percent|[BMK])\b)?/gi) ?? [];
const metricKey = (value: string) => value.toLowerCase().replace(/\s+/g, "");

/** Independent deterministic quality assessment. No provider, store, environment or operational side effects.
 * Scores describe evidence coverage, not probability of truth; semantic acceptance remains with the
 * existing independent reviewer. OFFLINE_SIMULATION must never be represented as a live result.
 */
export function judgeCompanyResearch(value: CompanyRun, now: Date, mode: EvaluationMode) {
  const run = companyRunSchema.parse(value);
  if (!Number.isFinite(now.getTime())) throw new Error("JUDGEMENT_TIME_REQUIRED");
  const validationIssues = validateResearch(
    { id: run.id, intake: run.input, research: run.research },
    now,
    { company: true, prospect: false },
  );
  const audit = run.groundingAudit;
  const failures = new Set<string>();
  if (!run.research.sources.length) failures.add("MISSING_EVIDENCE");
  if (!run.research.facts.length) failures.add("NO_ACCEPTED_FINDINGS");
  if (validationIssues.length) failures.add("EVIDENCE_VALIDATION_FAILED");
  if (!audit) failures.add("INDEPENDENT_REVIEW_UNAVAILABLE");
  else if (audit.status !== "ACCEPTED") failures.add(`INDEPENDENT_REVIEW_${audit.status}`);
  const sources = run.research.sources.map((source) => {
    const hashMatches =
      source.id ===
      "web:" +
        createHash("sha256")
          .update(source.url + source.excerpt)
          .digest("hex")
          .slice(0, 20);
    if (!hashMatches) failures.add("SOURCE_CONTENT_ID_MISMATCH");
    const url = new URL(source.url);
    const firstParty =
      url.hostname === run.input.companyDomain ||
      url.hostname.endsWith("." + run.input.companyDomain);
    return {
      id: source.id,
      title: publicText(source.title),
      // Omit queries, fragments and credential-bearing links from the report.
      url:
        url.protocol === "https:" && !url.username && !url.password
          ? url.origin + url.pathname
          : "",
      observedAt: source.observedAt,
      characters: source.excerpt.length,
      hashMatches,
      reliability: firstParty
        ? "FIRST_PARTY_SELF_DESCRIPTION"
        : "EXTERNAL_SOURCE_NOT_INDEPENDENTLY_ASSESSED",
      reason: firstParty
        ? "Useful for the company's own description; not independent proof of performance, market leadership or buying intent."
        : "Authority and ownership need separate review.",
    };
  });
  const reviewer = audit?.reviewer;
  const covered =
    audit?.status === "ACCEPTED" &&
    audit.identityMatches === true &&
    audit.reasonCodes.length === 0 &&
    !!reviewer &&
    (reviewer.concerns === undefined
      ? reviewer.concernCount === 0
      : reviewer.concerns.length === reviewer.concernCount &&
        reviewer.concerns.every(
          (c) => c.severity === "NONBLOCKING" && c.code === "CONTEXT_LIMITATION",
        )) &&
    reviewer.rejectedCount === 0 &&
    reviewer.unknownSupportedCount === 0 &&
    reviewer.unknownRejectedCount === 0 &&
    reviewer.supportedCount === run.research.facts.length &&
    reviewer.supportedCandidateIds.length === run.research.facts.length &&
    new Set(reviewer.supportedCandidateIds).size === run.research.facts.length &&
    audit.candidates.length === run.research.facts.length &&
    new Set(audit.candidates.map((c) => c.factId)).size === run.research.facts.length &&
    run.research.facts.every((fact) =>
      audit.candidates.some(
        (c) =>
          c.factId === fact.id &&
          c.reviewerDecision === "SUPPORTED" &&
          reviewer.supportedCandidateIds.includes(c.candidateId),
      ),
    );
  if (audit?.status === "ACCEPTED" && !covered) failures.add("REVIEW_COVERAGE_INCONSISTENT");
  if (run.status !== "REVIEW_REQUIRED") failures.add("RUN_NOT_ACCEPTED_FOR_REVIEW");
  const verifiedFacts: {
    id: string;
    statement: string;
    quotes: { sourceId: string; text: string }[];
    reasons: string[];
  }[] = [];
  const provisionalFindings: { id: string; statement: string; reasons: string[] }[] = [];
  const rejectedClaims: { id: string; statement: string; reasons: string[] }[] = [];
  for (const fact of run.research.facts) {
    const quoteNumbers = new Set(numbers(fact.quotes.map((q) => q.text).join(" ")).map(metricKey));
    const unsupportedMetric = numbers(fact.statement).some((n) => !quoteNumbers.has(metricKey(n)));
    if (unsupportedMetric) failures.add("UNSUPPORTED_METRIC");
    const row = { id: publicText(fact.id), statement: publicText(fact.statement) };
    if (unsupportedMetric || validationIssues.length || sources.some((s) => !s.hashMatches)) {
      rejectedClaims.push({
        ...row,
        reasons: [
          unsupportedMetric
            ? "UNSUPPORTED_METRIC: numerical value or unit is absent from the cited quotes; do not use."
            : "Evidence integrity, quotation, identity or freshness check failed; do not use.",
        ],
      });
    } else if (covered && run.status === "REVIEW_REQUIRED") {
      verifiedFacts.push({
        ...row,
        quotes: fact.quotes.map((q) => ({ sourceId: q.sourceId, text: publicText(q.text) })),
        reasons: [
          "Existing independent reviewer accepted; exact quotation, identity, freshness and source-content checks passed.",
          "First-party assertions remain attributed to the company. Numeric matching alone does not establish period or causal context.",
        ],
      });
    } else {
      provisionalFindings.push({
        ...row,
        reasons: [
          "Quote checks alone cannot establish entailment. Independent acceptance is missing, inconsistent or withheld for this run.",
        ],
      });
    }
  }
  for (const candidate of audit?.candidates ?? []) {
    if (candidate.factId && run.research.facts.some((f) => f.id === candidate.factId)) continue;
    const row = {
      id: candidate.candidateId,
      statement: publicText(candidate.statement ?? "Candidate text was not retained."),
      reasons: [
        `Reviewer decision: ${candidate.reviewerDecision}. Run review: ${audit!.status}.`,
        ...audit!.reasonCodes,
      ],
    };
    if (candidate.reviewerDecision === "REJECTED" || candidate.reviewerDecision === "CONFLICT") {
      rejectedClaims.push(row);
      failures.add("UNSUPPORTED_CANDIDATE");
    } else provisionalFindings.push(row);
  }
  const missingEvidence = [
    ...(!audit
      ? [
          "Historical reviewer decisions and rejected candidate text cannot be reconstructed from retained excerpts.",
        ]
      : []),
    ...(!verifiedFacts.length
      ? [
          "No finding currently has both valid evidence and complete independent acceptance in this evaluation.",
        ]
      : []),
    "No approved Signal product knowledge was supplied to this evaluator; product-fit claims are withheld.",
    "No dated branded-search competition, paid/organic overlap, conversion, spending or incremental-impact evidence establishes a Signal opportunity.",
    "No verified contact responsibility, eligibility or buying intent is established by company pages.",
  ];
  const sourceIds = sources.map((s) => s.id);
  const scores = [
    {
      dimension: "Factual acceptance coverage",
      score: run.research.facts.length
        ? Math.round((100 * verifiedFacts.length) / run.research.facts.length)
        : 0,
      reason:
        "Share of submitted accepted facts passing existing gates plus this audit. Zero is no accepted evidence, not a claim that Nike facts are false.",
      sourceIds,
    },
    {
      dimension: "Source reliability",
      score:
        sources.length &&
        !sources.some((s) => !s.hashMatches) &&
        !validationIssues.some((i) => i.startsWith("Source is"))
          ? sources.every((s) => s.reliability === "FIRST_PARTY_SELF_DESCRIPTION")
            ? 60
            : 30
          : 0,
      reason:
        "Rule-based rubric: 60 for intact, fresh first-party sources; 30 for unassessed external sources; 0 for missing or invalid evidence. Several pages on one company domain are not independent corroboration.",
      sourceIds,
    },
    {
      dimension: "Signal relevance",
      score: null,
      reason:
        "Not established: approved product context and account-specific search evidence are missing. Company scale or product categories alone do not establish fit.",
      sourceIds: [] as string[],
    },
    {
      dimension: "Prospecting usefulness",
      score: verifiedFacts.length ? 20 : 0,
      reason:
        "0 without accepted findings; 20 for a verified company brief only. No opportunity or contact qualification is inferred.",
      sourceIds: verifiedFacts.flatMap((f) => f.quotes.map((q) => q.sourceId)),
    },
  ];
  return {
    version: 1 as const,
    evaluator: "Independent deterministic Judgement Agent v1",
    mode,
    evaluatedAt: now.toISOString(),
    evidenceAsOf: run.updatedAt,
    company: publicText(run.input.companyName),
    outcome: failures.size ? "HOLD" : "COMPANY_BRIEF_ONLY",
    hardFailures: [...failures],
    validationIssues: validationIssues.map(publicText),
    verifiedFacts,
    provisionalFindings,
    rejectedClaims,
    missingEvidence,
    sources,
    scores,
    recommendations: [
      "Retain the grounding audit on the next separately approved live run; fix the named rejection reason before paying for another run.",
      "Extract one narrow company-description claim with its exact quotation; exclude market-leadership language and unsupported marketing metrics.",
      "Retrieve actual dated report or earnings-release text when a financial claim is needed; an Annual Reports index is not the filing itself.",
      "Have an authorized knowledge administrator review existing source-backed Signal knowledge through the existing workflow before product-fit recommendations.",
      "Only after company grounding works, gather authorized dated search observations and contact evidence through existing eligibility gates; send the human a review queue, not an automatically enrolled prospect.",
    ],
    approved: false as const,
    canSend: false as const,
    canEnroll: false as const,
    limitation:
      "This evaluator checks consistency and coverage independently of generation. It is not a second paid semantic model, cannot recover historical reviewer reasoning, and never changes acceptance or eligibility.",
  };
}

export type CompanyJudgement = ReturnType<typeof judgeCompanyResearch>;

/** Standalone HTML, escaped content and no scripts, remote assets or active application actions. */
export function renderJudgementHtml(reports: { title: string; report: CompanyJudgement }[]) {
  const escape = (text: unknown) =>
    String(text).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  const list = (items: string[]) =>
    `<ul>${items.map((s) => `<li>${escape(s)}</li>`).join("")}</ul>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Nike — evidence quality review</title><style>body{font:17px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:0 24px;color:#172433;background:#f8fafc}h1,h2{line-height:1.2}section{background:white;border:1px solid #dce3eb;border-radius:12px;padding:24px;margin:24px 0}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}blockquote{border-left:3px solid #326779;padding-left:16px}small{color:#526174}a{overflow-wrap:anywhere}strong{color:#633b08}</style><h1>Nike: what the evidence actually supports</h1><p><strong>Offline historical-evidence review — no new live run and no paid AI call.</strong></p><p>The saved Who We Are text supports a narrow description of Nike's product categories. It does not establish a Signal opportunity, advertising waste, savings or buying intent. The original run accepted zero findings; its reviewer decisions were not retained.</p>${reports.map(({ title, report: r }) => `<section><h2>${escape(title)}</h2><p><strong>${escape(r.mode)} · ${escape(r.outcome)}</strong><br>Evidence as of ${escape(r.evidenceAsOf)}. Evaluated at ${escape(r.evaluatedAt)}.</p><p>${escape(r.limitation)}</p><h3>Scorecard</h3><p>Scores are a transparent coverage rubric, not probabilities or an approval threshold.</p><table><tr><th>Dimension</th><th>Score / 100</th><th>Reason</th></tr>${r.scores.map((s) => `<tr><td>${escape(s.dimension)}</td><td>${s.score ?? "Not assessed"}</td><td>${escape(s.reason)} ${escape(s.sourceIds.join(", "))}</td></tr>`).join("")}</table><h3>Verified facts within this scenario (${r.verifiedFacts.length})</h3>${r.mode === "OFFLINE_SIMULATION" ? "<p><strong>Simulated reviewer acceptance below is test data, not live independent approval.</strong></p>" : ""}${r.verifiedFacts.map((f) => `<p>${escape(f.statement)}</p>${f.quotes.map((q) => `<blockquote>${escape(q.text)}<br><small>${escape(q.sourceId)}</small></blockquote>`).join("")}${list(f.reasons)}`).join("") || "<p>None.</p>"}<h3>Provisional findings (${r.provisionalFindings.length})</h3>${list(r.provisionalFindings.map((f) => `${f.statement} — ${f.reasons.join(" ")}`))}<h3>Rejected claims (${r.rejectedClaims.length})</h3>${list(r.rejectedClaims.map((f) => `${f.statement} — ${f.reasons.join(" ")}`))}<h3>Hard failures</h3>${list(r.hardFailures)}${list(r.validationIssues)}<h3>Missing evidence</h3>${list(r.missingEvidence)}<h3>Sources</h3>${r.sources.map((s) => `<p><a href="${escape(s.url)}" rel="noreferrer">${escape(s.title)}</a><br><small>${escape(s.id)} · ${s.characters} characters · ${escape(s.observedAt)} · content hash ${s.hashMatches ? "matches" : "FAIL"}</small><br>${escape(s.reason)}</p>`).join("")}<h3>Next research improvements</h3>${list(r.recommendations)}<p><strong>No sending, enrollment, contact eligibility or knowledge approval is granted.</strong></p></section>`).join("")}</html>`;
}
