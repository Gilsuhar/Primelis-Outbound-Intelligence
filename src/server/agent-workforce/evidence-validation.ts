import "server-only";
import { isDeepStrictEqual } from "node:util";
import { validateAgentOutput } from "@/features/agent-workforce/contracts";
import { parseTimestamp, MAX_EVIDENCE_AGE_DAYS } from "@/features/sales-agent/qualification";
import type { WorkforceRun, WorkforceSequence } from "@/features/agent-workforce/gate-a-contracts";
import { allowedSourceUrl } from "./public-sources";
import { editorialConcerns, strategyGroundingConcerns } from "./commercial-quality";
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function validateResearch(
  run: Pick<WorkforceRun, "id" | "intake" | "research">,
  now: Date,
  requirements = { company: true, prospect: true },
) {
  const { research, intake } = run;
  const issues: string[] = [];
  if (research.prospectId !== run.id || research.accountDomain !== intake.companyDomain)
    issues.push("Research identity does not match this run");
  const sources = new Map(research.sources.map((source) => [source.id, source]));
  if (requirements.company && !sources.size) issues.push("No real retrieved research sources");
  if (
    sources.size !== research.sources.length ||
    new Set(research.facts.map((f) => f.id)).size !== research.facts.length
  )
    issues.push("Duplicate evidence identifiers");
  for (const source of sources.values()) {
    const date = parseTimestamp(source.observedAt);
    if (
      !(
        allowedSourceUrl(source.url) ||
        (source.sourceType === "AUTHORIZED_PROVIDER" &&
          source.id.startsWith("getleads:") &&
          source.url === intake.linkedinUrl)
      ) ||
      date === null ||
      date > now.getTime() ||
      now.getTime() - date > MAX_EVIDENCE_AGE_DAYS * 86400000
    )
      issues.push("Source is unavailable, stale or invalid: " + source.id);
  }
  for (const fact of research.facts) {
    if (fact.confidence === "LOW") issues.push("Low-confidence fact requires research: " + fact.id);
    if (
      !fact.quotes.length ||
      fact.sourceIds.some((id) => !sources.has(id) || !fact.quotes.some((q) => q.sourceId === id))
    )
      issues.push("Fact lacks quoted source support: " + fact.id);
    for (const quote of fact.quotes)
      if (
        !fact.sourceIds.includes(quote.sourceId) ||
        !sources.get(quote.sourceId)?.excerpt.includes(quote.text)
      )
        issues.push("Quote does not occur in its actual source: " + fact.id);
  }
  if (
    requirements.company &&
    !research.facts.some(
      (f) =>
        f.subject === "ACCOUNT" &&
        ["BUSINESS_MODEL", "PRODUCTS", "MARKETS", "DEVELOPMENT"].includes(f.category) &&
        f.quotes.some((q) =>
          normalize(sources.get(q.sourceId)?.excerpt ?? "").includes(normalize(intake.companyName)),
        ),
    )
  )
    issues.push("Company identity and business context are not supported");
  const position = research.facts.some(
    (f) =>
      f.subject === "PROSPECT" &&
      f.category === "POSITION" &&
      f.quotes.some((q) => {
        const quote = normalize(q.text);
        const s = sources.get(q.sourceId);
        return (
          quote.includes(normalize(intake.prospectName)) &&
          // Current association is checked semantically; exact title spelling is not identity.

          (quote.includes(normalize(intake.companyName)) || s?.sourceType === "COMPANY_SITE")
        );
      }),
  );
  if (requirements.prospect && !position)
    issues.push(
      "Current prospect, role and company association are not verified; title-based assumptions are insufficient",
    );
  return [...new Set(issues)];
}
export function validateSequence(run: WorkforceRun, sequence: WorkforceSequence) {
  const issues = validateAgentOutput(run.research, sequence).concerns.filter(
    (issue) =>
      !(run.writingMode === "INSIGHT_LED" && issue === "Strategy has no supporting research facts"),
  );
  issues.push(...editorialConcerns(sequence), ...strategyGroundingConcerns(run, sequence.strategy));
  if (
    sequence.prospectId !== run.id ||
    sequence.accountDomain !== run.intake.companyDomain ||
    !isDeepStrictEqual(sequence.strategy, run.strategy)
  )
    issues.push("Generated sequence changed its prospect, company or selected strategy");
  if (sequence.review.verdict === "HOLD" || sequence.review.concerns.length)
    issues.push("Writer raised unresolved review concerns", ...sequence.review.concerns);
  const facts = new Set(run.research.facts.map((f) => f.id));
  const knowledge = new Map(run.knowledge.map((k) => [k.id, k]));
  if (sequence.messages[0]?.suggestedDelayDays !== 0)
    issues.push("First step must start at day zero");
  const normalizedBodies = sequence.messages.map((m) => normalize(m.body));
  if (new Set(normalizedBodies).size !== 4) issues.push("Email bodies must not repeat");
  const plan = sequence.creativePlan;
  if (plan) {
    const ids = plan.approaches.map((a) => a.id);
    if (new Set(ids).size !== ids.length || !ids.includes(plan.selectedApproachId))
      issues.push("Creative approach selection is invalid");
    if (new Set(plan.approaches.map((a) => normalize(a.concept))).size !== ids.length)
      issues.push("Creative approaches must be substantively different");
    if (plan.hypotheses.some((h) => h.supportingFactIds.some((id) => !facts.has(id))))
      issues.push("Strategic hypothesis cites unknown evidence");
  }
  const observations = new Map((run.draftStudio?.context.serp ?? []).map((s) => [s.id, s]));
  for (const [index, m] of sequence.messages.entries()) {
    if (
      run.writingMode === "INSIGHT_LED" &&
      (m.supportingFactIds.length ||
        m.supportingObservationIds.length ||
        /\b(?:we|i) (?:saw|observed|noticed|found|audited)\b/i.test(m.body))
    )
      issues.push(`Email ${m.step} implies unsupported company research in INSIGHT_LED mode`);
    if ((m.supportingObservationIds ?? []).some((id) => !observations.has(id)))
      issues.push(`Email ${m.step} cites an unknown SERP observation`);
    for (const sentence of `${m.subject}. ${m.body}`.split(/(?<=[.!?])\s+|\n+/)) {
      // These are observed-condition assertions, not general product capabilities or conditional inquiries.
      const observedAds =
        /\b(?:we|i) (?:saw|observed|noticed|found)\b[^.!?]*(?:competitor|advertiser|ads\b)/i.test(
          sentence,
        );
      if (observedAds && !(m.supportingObservationIds ?? []).some((id) => observations.has(id)))
        issues.push(`Email ${m.step} claims an ad observation without cited SERP evidence`);
      if (
        /\b(?:competitors?|advertisers?) (?:always|never|regularly|consistently) (?:bid|advertis|appear)|\bno competitors? (?:bid|are bidding|advertise)/i.test(
          sentence,
        )
      )
        issues.push(`Email ${m.step} generalizes beyond a single SERP snapshot`);
    }
    if (index && m.subject !== `Re: ${sequence.messages[0].subject}`)
      issues.push("Follow-ups must use the first subject in the same thread");
    if (index && m.suggestedDelayDays < 1) issues.push("Follow-up delay must be positive");
    if (m.approvedKnowledgeIds.some((id) => !knowledge.has(id)))
      issues.push("Email cites unknown or unapproved product knowledge");
    for (const assertion of m.assertions) {
      if (
        !m.body.includes(assertion.text) ||
        (!assertion.factIds.length &&
          !assertion.knowledgeIds.length &&
          !(assertion.observationIds ?? []).length) ||
        assertion.factIds.some((id) => !facts.has(id) || !m.supportingFactIds.includes(id)) ||
        (assertion.observationIds ?? []).some(
          (id) => !observations.has(id) || !(m.supportingObservationIds ?? []).includes(id),
        ) ||
        assertion.knowledgeIds.some(
          (id) => !knowledge.has(id) || !m.approvedKnowledgeIds.includes(id),
        )
      )
        issues.push(`Email ${m.step} has an unsupported assertion ledger`);
    }
    const evidenceText = [
      ...run.research.facts
        .filter((f) => m.supportingFactIds.includes(f.id))
        .map((f) => f.statement),
      ...run.knowledge.filter((k) => m.approvedKnowledgeIds.includes(k.id)).map((k) => k.text),
    ].join(" ");
    const canonicalNumber = (value: string) =>
      value
        .replace(/,/g, "")
        .replace(/\s+/g, "")
        .replace(/percent$/, "%");
    const approvedNumbers = new Set(
      (evidenceText.match(/\b\d+(?:[.,]\d+)*(?:\s*%|\s*percent)?/g) ?? []).map(canonicalNumber),
    );
    // Numbers in factual assertions require exact evidence. Check percentages
    // throughout the copy too; nonfactual framing ("2 questions") is not a claim.
    // The independent critic must detect any factual assertion omitted by the writer.
    const claimText = [
      ...m.assertions.map((assertion) => assertion.text),
      ...(`${m.subject} ${m.body}`.match(/\b\d+(?:[.,]\d+)*(?:\s*%|\s*percent)/g) ?? []),
    ]
      .join(" ")
      .replace(/\b\d+[- ]minute(?=\s+(?:call|chat|conversation|discussion|meeting)\b)/gi, "brief");
    for (const number of claimText.match(/\b\d+(?:[.,]\d+)*(?:\s*%|\s*percent)?/g) ?? [])
      if (!approvedNumbers.has(canonicalNumber(number)))
        issues.push(`Email ${m.step} contains an unsupported number`);
  }
  return [...new Set(issues)];
}

/** Detect pure name/domain substitutions without putting another contact's data into a model prompt. */
export function duplicatesAnotherProspect(run: WorkforceRun, other: WorkforceRun) {
  if (
    !run.sequence ||
    !other.sequence ||
    run.inputHash === other.inputHash ||
    other.status !== "READY_FOR_REVIEW"
  )
    return false;
  const shape = (candidate: WorkforceRun) => {
    const labels = [
      candidate.intake.companyName,
      candidate.intake.prospectName,
      candidate.intake.companyDomain,
      ...candidate.intake.companyName.split(/\s+/),
      ...candidate.intake.prospectName.split(/\s+/),
    ]
      .filter((s) => s.length > 2)
      .sort((a, b) => b.length - a.length);
    return candidate
      .sequence!.messages.map((m) => {
        let body = m.body.toLowerCase();
        for (const label of labels) body = body.replaceAll(label.toLowerCase(), "[identity]");
        return body.replace(/[^a-z0-9\[\]]/g, "");
      })
      .join("|");
  };
  return shape(run) === shape(other);
}

export function validateDraftResearch(run: WorkforceRun, now: Date) {
  return validateResearch(run, now, {
    company: run.writingMode !== "INSIGHT_LED",
    prospect: !run.writingMode,
  });
}
