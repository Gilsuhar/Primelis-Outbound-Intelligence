import "server-only";
import {
  signalReportSchema,
  type SignalEvidence,
} from "@/features/agent-workforce/signal-opportunity";
import {
  knowledgeRecordSchema,
  type KnowledgeRecord,
} from "@/features/agent-workforce/gate-a-contracts";
import type { CompanyRun } from "@/features/agent-workforce/company-research/contracts";
import { judgeCompanyResearch } from "../company-research/judgement";
import { projectSignalEvidence } from "./evidence";
import type { ContactDecision } from "./contact";
import type { CacheScope } from "@/features/agent-workforce/similarweb-cache";
import { draftSignalOpportunity, permittedDraftProduct } from "./drafting";

/** Consistency/coverage evaluator independent of generation. Scores never grant eligibility. */
export function evaluateSignal(
  run: CompanyRun,
  evidence: SignalEvidence,
  contact: ContactDecision,
  approvedKnowledge: KnowledgeRecord[],
  now: Date,
  mode: "SIMULATED" | "LIVE",
  expectedCacheScope?: CacheScope,
) {
  const factual = judgeCompanyResearch(
    run,
    now,
    mode === "SIMULATED" ? "OFFLINE_SIMULATION" : "SAVED_RUN",
  );
  const projected = projectSignalEvidence(run, evidence, now, mode, expectedCacheScope);
  const blockers = [...projected.blockers, ...contact.blockers];
  if (
    evidence.search &&
    (evidence.search.paidSearchVisits <= 0 || evidence.search.brandedPaidSharePercent <= 0)
  )
    blockers.push("POSITIVE_BRANDED_PAID_SEARCH_EXPOSURE_NOT_ESTABLISHED");
  if (evidence.serp && evidence.serp.brandAdvertising !== "OBSERVED")
    blockers.push("CURRENT_BRAND_AD_PRESENCE_NOT_ESTABLISHED");
  const products = approvedKnowledge
    .map((k) => knowledgeRecordSchema.parse(k))
    .filter(permittedDraftProduct);
  const knowledge = products[0];
  if (!knowledge) blockers.push("HUMAN_APPROVED_SOURCE_BACKED_SIGNAL_PRODUCT_KNOWLEDGE_REQUIRED");
  if (!contact.ready || !contact.contact)
    blockers.push("VERIFIED_PAID_SEARCH_CONTACT_AND_ALL_ELIGIBILITY_GATES_REQUIRED");
  // Bind reviewed claims AND retained source bytes to this exact structured provider evidence.
  const matched =
    projected.facts.length === 3 &&
    projected.facts.every((f) =>
      run.research.facts.some((r) => JSON.stringify(r) === JSON.stringify(f)),
    ) &&
    projected.sources.every((s) =>
      run.research.sources.some((r) => JSON.stringify(r) === JSON.stringify(s)),
    );
  if (factual.hardFailures.length || factual.verifiedFacts.length !== 3 || !matched)
    blockers.push("SIGNAL_EXACT_EVIDENCE_AND_INDEPENDENT_GROUNDING_REQUIRED");
  const insights =
    !factual.hardFailures.length && matched
      ? run.research.facts.map((f) => ({
          factId: f.id,
          statement: f.statement,
          sourceIds: f.sourceIds,
          quotes: f.quotes,
        }))
      : [];
  const ready = blockers.length === 0;
  const hypothesis =
    insights.length && knowledge
      ? "Hypothesis only: monitor this branded query across locations and times, then test whether pausing ads or reducing CPC when conditions permit preserves performance. First-party CTR, CVR and a controlled incrementality assessment are required; these observations prove no savings or unnecessary spend."
      : null;
  const drafted =
    ready && contact.contact && evidence.search && evidence.serp
      ? draftSignalOpportunity({
          company: run.input.companyName,
          contact: contact.contact,
          evidence: { ...evidence, search: evidence.search, serp: evidence.serp },
          insights,
          products,
        })
      : null;
  return signalReportSchema.parse({
    version: 1,
    mode,
    eligibility: ready ? "Eligible" : "HOLD",
    blockers: [...new Set(blockers)].map((b) => b.slice(0, 800)),
    insights,
    hypothesis,
    provenSavings: null,
    contact: contact.ready ? contact.contact : null,
    judgement: {
      factualCoverage:
        !factual.hardFailures.length && factual.verifiedFacts.length === 3 && matched ? 100 : 0,
      opportunityCoverage:
        (insights.length ? 40 : 0) + (knowledge ? 20 : 0) + (contact.ready ? 20 : 0),
      reasons: [
        "Coverage rubric, not probability of savings: 40 search evidence + 20 approved product context + 20 strict contact clearance; remaining 20 requires first-party performance and controlled incrementality evidence.",
        "Similarweb is estimated traffic, not ad spend or wasted spend. A different advertiser is not automatically a competitor. A single SERP capture cannot prove persistent absence.",
        "Human approval is required; a quality score cannot change factual acceptance, eligibility, sending or enrollment.",
        "Semantic writing review is recorded separately when available; absence is not approval. Review tone, implication, relevance and progression before human approval; coverage scores do not certify editorial quality.",
      ],
      missingDataActions: [
        ...new Set(blockers),
        "Capture or monitor the exact query, location, device and timestamp repeatedly; retain screenshots through an authorized collector.",
        "Obtain authorized first-party CTR/CVR and controlled incrementality evidence before estimating savings.",
      ],
    },
    emails: drafted?.emails ?? [],
    approved: false,
    canSend: false,
    canEnroll: false,
  });
}
