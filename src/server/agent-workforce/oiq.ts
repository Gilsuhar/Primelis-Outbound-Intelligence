import "server-only";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import {
  oiqAssessmentSchema,
  type OiqJudgment,
  type OiqAssessment,
} from "@/features/agent-workforce/oiq-contracts";
import { digest } from "./store";
import { validateDraftResearch, validateSequence } from "./evidence-validation";

type Critic = NonNullable<WorkforceRun["critic"]>;
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export const oiqContentHash = (run: WorkforceRun) =>
  digest(
    canonical(
      run.sequence
        ? {
            ...(run.writingMode ? { writingMode: run.writingMode } : {}),
            prospectId: run.sequence.prospectId,
            accountDomain: run.sequence.accountDomain,
            strategy: run.sequence.strategy,
            creativePlan: run.sequence.creativePlan,
            messages: run.sequence.messages,
          }
        : null,
    ),
  );

/** No eligibility inputs, provider calls or authority to send. High editorial scores cannot repair factual failures. */
export function assessOiq(
  run: WorkforceRun,
  judgment: OiqJudgment,
  critic: Omit<Critic, "oiq">,
  now: Date,
): OiqAssessment {
  const result = structuredClone(judgment);
  const insightLed = run.writingMode === "INSIGHT_LED";
  const blockers = [
    ...judgment.missingCoreEvidence,
    ...judgment.unsupportedClaims,
    ...critic.unsupportedAssertions,
  ];
  const references: OiqAssessment["references"] = [];
  const core = judgment.coreInsight;
  const steps = new Set(core.messageSteps);
  const messages = run.sequence?.messages.filter((m) => steps.has(m.step)) ?? [];
  const facts = core.factIds.map((id) => run.research.facts.find((f) => f.id === id));
  let companyEvidence = false;
  if (!run.sequence || !messages.length)
    blockers.push("Identify which email contains the core outreach insight");
  for (const [i, fact] of facts.entries()) {
    if (!fact) {
      blockers.push(`Core insight cites unknown fact: ${core.factIds[i]}`);
      continue;
    }
    if (
      fact.subject === "ACCOUNT" &&
      ["BUSINESS_MODEL", "PRODUCTS", "MARKETS", "DEVELOPMENT"].includes(fact.category)
    ) {
      const citedInBody = messages.some(
        (m) =>
          m.supportingFactIds.includes(fact.id) &&
          m.assertions.some((a) => a.factIds.includes(fact.id) && m.body.includes(a.text)),
      );
      if (!citedInBody)
        blockers.push(
          `Core company fact ${fact.id} must be traceable to an assertion in the selected email`,
        );
      else companyEvidence = true;
    }
    for (const sourceId of fact.sourceIds) {
      const source = run.research.sources.find((s) => s.id === sourceId);
      if (
        !source ||
        !fact.quotes.some((q) => q.sourceId === sourceId && source.excerpt.includes(q.text))
      ) {
        blockers.push(`Core fact ${fact.id} lacks exact quoted source support`);
        continue;
      }
      references.push({
        kind: "FACT",
        id: fact.id,
        sourceId,
        url: source.url,
        observedAt: source.observedAt,
        messageSteps: [...steps],
      });
    }
  }
  const observations = new Map((run.draftStudio?.context.serp ?? []).map((s) => [s.id, s]));
  for (const id of core.observationIds) {
    const source = observations.get(id);
    if (
      !source ||
      !messages.some((m) => m.supportingObservationIds.includes(id)) ||
      !Number.isFinite(Date.parse(source.observedAt)) ||
      Date.parse(source.observedAt) > now.getTime() ||
      now.getTime() - Date.parse(source.observedAt) > 86400000
    ) {
      blockers.push(`Core SERP observation ${id} is missing, uncited or stale`);
      continue;
    }
    references.push({
      kind: "SERP",
      id,
      sourceId: id,
      url: source.sourceUrl,
      observedAt: source.observedAt,
      messageSteps: [...steps],
    });
  }
  if (insightLed) {
    for (const knowledge of run.knowledge.filter((k) =>
      messages.some(
        (m) =>
          m.approvedKnowledgeIds.includes(k.id) &&
          m.assertions.some((a) => a.knowledgeIds.includes(k.id) && m.body.includes(a.text)),
      ),
    )) {
      // Registry provenance is valid for approved internal documents too. Never
      // invent a public URL or pair independently aggregated source IDs/URLs.
      const sources = knowledge.sourceUrls.length
        ? knowledge.sourceUrls.map((url) => ({ sourceId: knowledge.id, url }))
        : knowledge.sourceIds.map((sourceId) => ({ sourceId, url: null }));
      for (const source of sources)
        references.push({
          kind: "KNOWLEDGE",
          id: knowledge.id,
          ...source,
          observedAt: null,
          messageSteps: [...steps],
        });
    }
    if (!references.some((r) => r.kind === "KNOWLEDGE"))
      blockers.push(
        "Core professional insight must be grounded in cited approved product knowledge",
      );
    if (core.factIds.length || core.observationIds.length)
      blockers.push("Insight-led copy must not imply company research or SERP observations");
  }
  const researchIssues = validateDraftResearch(run, now);
  blockers.push(...researchIssues);
  if (!companyEvidence && !insightLed) {
    blockers.push(
      "Provide a meaningful source-backed company insight in the draft; title-only or product-only messaging is insufficient",
    );
    result.components.companyInsight.score = 0;
    result.components.companyInsight.reason =
      "No traceable company-specific core insight in the selected email";
  }
  if (
    (!companyEvidence && !insightLed) ||
    researchIssues.length ||
    judgment.missingCoreEvidence.length ||
    !references.length ||
    blockers.some((s) => /unknown fact|lacks exact|Core SERP/.test(s))
  ) {
    result.components.verifiedEvidence.score = 0;
    result.components.verifiedEvidence.reason =
      "Mandatory evidence for the core insight is missing or untraceable; writing cannot compensate";
  }
  if (
    !critic.checks.factualAccuracy ||
    !critic.checks.sourceGrounding ||
    !critic.checks.approvedClaimsOnly
  )
    blockers.push("Existing factual, grounding or approved-claim checks failed");
  if (run.sequence)
    blockers.push(
      ...validateSequence(run, run.sequence).filter((s) =>
        /unsupported|unknown|unapproved|identity|changed its prospect|SERP|cites|quoted source/i.test(
          s,
        ),
      ),
    );
  const weakPersonalization =
    !insightLed && (judgment.companySwapTest.equallyRelevant || !companyEvidence);
  if (weakPersonalization) {
    if (result.components.companyInsight.score > 10)
      result.components.companyInsight.reason = (
        "Capped because the company-specific insight failed the substitution/traceability test. " +
        result.components.companyInsight.reason
      ).slice(0, 1500);
    if (result.components.commercialAngle.score > 5)
      result.components.commercialAngle.reason = (
        "Capped because the commercial angle is interchangeable without a specific company insight. " +
        result.components.commercialAngle.reason
      ).slice(0, 1500);
    result.components.companyInsight.score = Math.min(result.components.companyInsight.score, 10);
    result.components.commercialAngle.score = Math.min(result.components.commercialAngle.score, 5);
    result.improvements.push(
      "Replace the interchangeable company-name pitch with a sourced company decision or tradeoff, then explain why it matters to this recipient",
    );
  }
  const score = Object.values(result.components).reduce((total, c) => total + c.score, 0);
  const blockingReasons = [...new Set(blockers)].slice(0, 60);
  const decision =
    blockingReasons.length || score < 65
      ? "BLOCKED"
      : score < 85
        ? "REVISE"
        : "READY_FOR_HUMAN_REVIEW";
  if (!companyEvidence && !insightLed)
    result.improvements.push(
      "Research a dated business model, product, market or development fact and cite the exact source behind the core insight",
    );
  if (score < 85) {
    const lowest = Object.entries(result.components).sort((a, b) => a[1].score - b[1].score)[0];
    if (lowest) result.improvements.push(`Improve ${lowest[0]}: ${lowest[1].reason}`);
  }
  return oiqAssessmentSchema.parse({
    ...result,
    version: 1,
    mode: run.writingMode ?? "EVIDENCE_LED",
    score,
    decision,
    weakPersonalization,
    blockingReasons,
    improvements: [...new Set(result.improvements)].slice(0, 20),
    references: references.slice(0, 64),
    contentHash: oiqContentHash(run),
  });
}

/** Recompute factual/citation safeguards on reads and approval; a stored total alone is never sufficient. */
export function qualityReviewPassed(run: WorkforceRun, now: Date) {
  const critic = run.critic;
  if (
    !run.sequence ||
    !critic?.oiq ||
    critic.oiq.decision !== "READY_FOR_HUMAN_REVIEW" ||
    critic.oiq.score < 85 ||
    run.issues.length > 0 ||
    critic.oiq.contentHash !== oiqContentHash(run) ||
    critic.verdict !== "PASS" ||
    !Object.values(critic.checks).every(Boolean) ||
    new Set(critic.checkedSteps).size !== 4 ||
    critic.concerns.length ||
    critic.unsupportedAssertions.length ||
    validateSequence(run, run.sequence).length
  )
    return false;
  const assessment = assessOiq(run, critic.oiq, critic, now);
  return assessment.decision === "READY_FOR_HUMAN_REVIEW" && assessment.score >= 85;
}

export const oiqReviewInstruction =
  "Also assess Outreach Insight Quality (OIQ) for this exact four-email draft version as one thread. Score each component with a concrete reason: company-specific insight 0-30; verified supporting evidence 0-25; relevance to verified recipient Search responsibilities 0-20; commercially interesting angle 0-15; natural writing and a low-friction CTA 0-10. These are editorial heuristics, never reply or meeting probabilities. Identify the core outreach insight, the email steps carrying it and exact fact/observation IDs. Run an explicit company-name substitution test: if replacing the name leaves the message equally relevant, equallyRelevant must be true; generic role/product language cannot earn high insight points. A title is not proof of Search responsibilities. Evaluate useful specificity, not how often the company name appears. List every unsupported claim and missing CORE evidence, including misleading implications in questions; absent optional SERP/Similarweb is not missing core evidence unless the insight relies on it. Never award evidence points for polished wording or approved product claims alone. A concise closing may rely on earlier touches without repeating their facts. Give concrete improvement suggestions. Keep reasons and suggestions concise; do not rewrite the emails in the review. Do not calculate totals or decisions; the server applies thresholds and absolute factual blocks. OIQ never determines prospect eligibility or overrides suppression, verification or human approval.";
