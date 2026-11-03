import "server-only";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import {
  conversationLearningExamples,
  outreachPrinciples,
  winningMessages,
} from "@/features/playbook/playbook-content";
import { goldStandardExamples } from "@/features/build-sequence/gold-standard-examples";

/** Human editorial feedback, not outcome labels, retraining, or evidence about an account. */
export const commercialGuidance = {
  version: "gil-commercial-brief-2026-10-21-v3",
  source:
    "Gil's recorded Acme, HarborLedger, outbound-quality and loveholidays conversation feedback",
  feedback: [
    "Conversational openings; omit decorative company facts that add no commercial value.",
    "Explain the relevant Signal mechanism when it strengthens the decision, not at a fixed email number.",
    "Translate methodology into a business benefit while preserving uncertainty and performance safeguards.",
    "Each follow-up must add value; vary the closing rather than mechanically reusing it.",
    "Qualify third-party estimates accurately, without repeatedly opening with a data provider.",
    "Keep citations and research caveats internal except qualifications or attribution needed for truthful copy.",
    "Do not reuse a winning angle, angle order or four-email narrative as a template for another company.",
    "Read an actual prospect reply before responding. If they already pause brand ads, consider permitted bid optimization with ads live rather than repeating the pause pitch. Respect reported incrementality without treating it as independently verified performance or promising preservation.",
  ],
} as const;

/** Editorial guidance only. Product authority remains run.knowledge, never example copy. */
export const signalSalesCopyInstruction =
  "Write like Gil: short, direct, conversational and commercially concrete. Explain what Signal actually helps the buyer do using only supplied permitted product knowledge: for example, observe branded search conditions and adapt coverage or bids where configured, with performance preservation as an objective, not a promise. Connect the mechanism to a practical benefit without alleging that this account wastes spend or faces competitors. Name Signal naturally early enough that the reader understands the offer; do not leave product fit implicit across the sequence. Avoid abstract consulting language, invented frameworks, branded-search governance jargon and offers to send a document, one-pager, research report or decision tree. Use one simple, answerable CTA per substantive email, without stacked questions or repeated asks; a brief closing may omit an ask. Research is relevant context, not an obligation to force the same weak hypothesis into every email. Keep necessary qualifications, but put methodological caveats in the internal review. Each follow-up must add a substantive reason to engage without inventing a new finding; no fixed step themes, sentences or narrative template. Historical examples teach brevity, rhythm and clarity only. Never copy their account assumptions, capabilities, outcomes or causal claims as evidence. No invented savings, competitor presence, account performance, customer proof or recipient responsibility.";

export const commercialBriefInstruction =
  "Use commercialBrief as an internal decision aid, not a script or additional factual authority. Discover and challenge several genuinely different commercial hypotheses from the supplied evidence; there is no angle checklist. Compare evidence strength, relevance, timing, novelty, credibility, missing premises and actual fit to the supplied approved Signal mechanisms. Prefer a simple product-led conversation grounded in verified business context and a relevant permitted mechanism over a strained research hypothesis when no specific account opportunity is established; do not imply observed waste or competition. If neither approach has a defensible fit, select NO_PITCH. Select the strongest defensible conversation and explain why alternatives lose. Existing angle enum values are legacy reporting labels, not a menu of required ideas; use OTHER_EVIDENCE_LED for a different defensible hypothesis. Keep the reasoning summary concise and evidence-linked, not private chain-of-thought. In drafting, use the selected decision and permitted mechanism naturally, with an adaptive four-touch narrative. Style examples and human feedback never establish facts, results or recipient clearance.";

export const writingBriefInstruction =
  "The supplied writing brief contains evidence, the selected commercial hypothesis and its uncertainties, permitted product context and Gil's editorial preferences. Compare messaging approaches independently within the verified evidence and strategy boundaries. You may open product-led when an approved mechanism offers a clearer, more credible conversation than the research hypothesis; do not claim that the hypothesis is proven or resurrect an unsupported rejected angle. Do not force every email around that hypothesis or copy a historical example. Make clear why replying would be useful to this buyer. Facts require supplied evidence; hypotheses must remain conditional. A useful business question does not establish incremental value, wasted spend or Search causation. If the selected hypothesis overlaps a rejected angle, preserve its missing-evidence limitation: ask about the decision without asserting the rejected conclusion. Preserve the selected strategy record for independent review; it is not factual authority. For each actual product assertion, cite the permitted knowledge ID both in its assertion.knowledgeIds and the email's approvedKnowledgeIds. For company assertions, use the corresponding fact IDs in both the assertion and email; copy the exact asserted body substring. Do not put nonfactual questions, disclaimers or invitations into the factual assertion ledger with empty evidence. " +
  signalSalesCopyInstruction;

function gilStyleExamples() {
  return winningMessages
    .filter((example) =>
      [
        "Email subject - deactivating branded ads",
        "LinkedIn first touch",
        "Email 4 - lower CPC angle",
        "Low-pressure close",
      ].includes(example.title),
    )
    .map((example) => ({
      source: `src/features/playbook/playbook-content.ts:winningMessages:${example.title}`,
      status: "STYLE_ONLY_NOT_PROOF",
      excerpt: example.message,
      boundary:
        "Historical phrasing, not approved product evidence or a claim about this prospect. Do not copy the example, infer reply success, or use it as an assertion citation. Verify every generated product claim against supplied knowledge and restrictions.",
    }));
}

/** A source-indexed shelf for the existing writer, not a new approval authority. */
export function salesMessagingLibrary(run: WorkforceRun) {
  return {
    use: "Use styleExamples and the learning excerpts for tone, not as templates or proof. A straightforward useful message is better than forced novelty. Choose a verified personal opening when relevant, a clear permitted Signal mechanism, one benefit and one natural question; this is guidance, not required sentence order. Keep follow-ups brief without repeating the full pitch.",
    conversationLearning: {
      stageSelection:
        "Default to COLD_OUTREACH unless actual recipient reply evidence is supplied in the current context. A scheduled follow-up, title, company name or historical learning example does not establish ACTIVE_CONVERSATION. Select examples by relevance, not outcome rank. For an active conversation, respond to the actual reply and adapt the CTA to engagement; do not invent prior exchanges or meeting interest.",
      boundary:
        "STYLE_ONLY_NOT_PROOF. Outcome labels are Gil-reported observations, not independently measured effectiveness, universal success or model training. Examples never support assertions or recipient clearance. Reported findings remain attributed, not verified results or causal conclusions. Check every product claim against supplied knowledge; no customer names, savings ranges or performance guarantees are authorized by these examples.",
      examples: conversationLearningExamples.map((example) => ({
        id: example.id,
        source: `src/features/playbook/playbook-content.ts:conversationLearningExamples:${example.id}; ${example.source}`,
        stage: example.stage,
        authorship: example.authorship,
        outcome: example.outcome,
        outcomeEvidence: example.outcomeEvidence,
        useWhen: example.useWhen,
        excerpt: example.writerExcerpt,
        lessons: example.lessons,
        ...("prospectReport" in example
          ? {
              historicalReply: {
                status: example.prospectReport.status,
                summary: example.prospectReport.writerSummary,
              },
            }
          : {}),
        // Do not forward originalMessage or unapprovedClaims into model examples.
      })),
    },
    acceptedLearning: goldStandardExamples
      .filter((example) => example.approvedForLearning)
      .map((example) => ({
        source: `src/features/build-sequence/gold-standard-examples.ts:${example.id}`,
        status: "APPROVED_FOR_LEARNING_ONLY",
        // Deliberately omit the historical account facts, outcome and erroneous CPC proof.
        lessons: example.whyItWorked.filter((lesson) =>
          /^(Opened with a specific fact|Used one Signal capability|Ended with a natural)/.test(
            lesson,
          ),
        ),
        closingExcerpt: example.body.split("\n\n").at(-1),
      })),
    // Refer to the existing full, source-backed records; don't duplicate or rewrite metrics.
    productKnowledgeIds: run.knowledge
      .filter((entry) => entry.kind === "PRODUCT")
      .map((entry) => entry.id),
    customerProof: {
      candidateKnowledgeIds: run.knowledge
        .filter((entry) => entry.kind === "CASE_STUDY")
        .map((entry) => entry.id),
      selection:
        "Use only case studies admitted by the existing external-use approval loader in knowledge, within their restrictions. Compare relevance to the verified buyer, company and message; never pick the first record by position. Omit proof if none is relevant or externally permitted. Preserve exact approved wording, metric name, value, unit, comparison and period; CPC, cost per MQL, spend and conversions are not interchangeable. Source IDs/URLs stay in knowledge for review. Style examples, import candidates and internal demonstration shells are not customer proof.",
    },
    personalization:
      "Use verified recipient responsibilities and company activity in research with their exact sources. Intake titles and learning examples are not employment verification. Use available brandSearch evidence only within its query, market, device, time and limitations; unknown data is not an observation. A screenshot never establishes persistent competition. A fictional recipient must remain fictional.",
  };
}

/** One copy of each factual input. Strategy discovery and independent review keep
 * their existing full inputs; this is only the handoff to the writer. */
export function buildWritingBrief(run: WorkforceRun) {
  return {
    prospectId: run.id,
    accountDomain: run.intake.companyDomain,
    intake: run.intake,
    writingMode: run.writingMode,
    ...(run.draftStudio ? { personalization: run.draftStudio.context } : {}),
    research: run.research,
    brandSearch: run.brandSearch,
    strategy: run.strategy,
    knowledge: run.knowledge,
    recipientClearance: run.eligibility,
    writingPreferences: commercialGuidance,
    styleExamples: gilStyleExamples(),
    salesMessaging: salesMessagingLibrary(run),
    factualConstraints: [
      "Only supplied fact/source IDs and product knowledge within its restrictions may support factual copy.",
      "Selected strategy, alternatives and assumptions are interpretations, not additional verified facts.",
      "No invented competitor ads, persistent competition from one snapshot, incremental lift, waste or savings.",
      "Missing third-party data is unknown, not zero. Estimates are not first-party performance data.",
      "No NEEDS_REVIEW customer proof. Never substitute CPC for cost-per-MQL.",
      "No invented employment, responsibilities or contact clearance. Human approval remains required.",
    ],
    ...(run.sequence ? { previousDraft: run.sequence } : {}),
    ...(run.issues.length ? { revisionConcerns: run.issues } : {}),
  };
}

/** Pure handoff. Knowledge must still come from the authoritative approved loader.
 * This neither approves evidence/knowledge nor changes any eligibility/review gate. */
export function buildCommercialBrief(run: WorkforceRun) {
  return {
    guidance: commercialGuidance,
    evidenceStatus:
      "Subject to existing factual and independent grounding gates; not approved by this brief",
    observationLedger: run.research.facts.map((fact) => ({
      factId: fact.id,
      statement: fact.statement,
      subject: fact.subject,
      exactQuotes: fact.quotes,
      limitations: fact.limitations,
    })),
    sourceScope: run.research.sources.map(({ id, url, observedAt, sourceType }) => ({
      id,
      url,
      observedAt,
      sourceType,
    })),
    decisionToDevelop:
      "What commercially useful decision does this evidence raise for this buyer, and can an approved Signal mechanism actually help? Do not invent a decision gap.",
    selectedStrategy: run.strategy
      ? {
          hypothesis: run.strategy.hypothesis,
          supportingFactIds: run.strategy.supportingFactIds,
          uncertainties: run.strategy.uncertainties,
          rationale: run.strategy.rationale,
          alternatives: run.strategy.alternatives,
        }
      : null,
    approvedKnowledgeReferences: run.knowledge.map(({ id, kind, restrictions }) => ({
      id,
      kind,
      restrictions,
    })),
    knowledgeBoundary:
      "Use only supplied authoritative knowledge within its restrictions. If no approved mechanism supports the angle, state that gap. Historical examples are not a product registry.",
    missingEvidence: [...run.research.gaps, ...run.brandSearch.gaps],
    hypothesesNotFacts: run.research.assumptions,
    recipientClearance: run.eligibility,
    // Omit the old fixed angle list, fixed step purposes, and compulsory CTA structure.
    playbookStyle: outreachPrinciples.filter((_, index) => [0, 2, 4, 5, 6, 7].includes(index)),
    historicalStyleLessons: goldStandardExamples
      .filter((example) => example.approvedForLearning)
      .map((example) => ({
        // Never transmit historical body, subject, names, outcome labels or claimed metrics.
        lessons: example.whyItWorked.filter((lesson) =>
          /^(Opened with a specific fact|Used one Signal capability|Ended with a natural)/.test(
            lesson,
          ),
        ),
        status: "STYLE_ONLY_NOT_PROOF",
      })),
    exclusions: [
      "NEEDS_REVIEW customer proof or unapproved product wording cannot be used.",
      "Never recast cost-per-MQL as CPC; the historical ZoomInfo CPC statement is excluded.",
      "Missing Similarweb is unknown, not zero traffic/spend. Estimates are not first-party analytics.",
      "One SERP snapshot is not persistent competition or incrementality. Retailers are not automatically competitors.",
      "No invented savings, current employment, Search ownership, contact history or email validity.",
    ],
  };
}
