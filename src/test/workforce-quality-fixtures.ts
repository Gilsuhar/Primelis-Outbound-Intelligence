/** Entirely fictional editorial acceptance examples. Never imported by operational routes or providers. */
import type { WorkforceSequence } from "@/features/agent-workforce/gate-a-contracts";
import type { EvidenceSnapshot } from "@/server/sales-agent/evidence-store";
import { initialRun } from "@/server/agent-workforce/store";
import { newResearch, researchIdentity } from "@/server/agent-workforce/prospect-research/engine";
import { reviewEvidenceSnapshot } from "@/server/services/sales-agent-collection-service";
import { collectedContact, verifiedObservations } from "./sales-agent-collection-fixtures";
import { testKnowledge, testNow } from "./workforce-fixtures";

export const qualityCases = [
  "ECOMMERCE",
  "SAAS",
  "FINANCIAL",
  "PAID_SOCIAL",
  "HISTORY_HOLD",
] as const;
export type QualityCase = (typeof qualityCases)[number];
const examples = {
  ECOMMERCE: {
    company: "CedarTrail Outfitters",
    domain: "cedartrail.example.com",
    name: "Maya Chen",
    role: "Head of Global Paid Search",
    business:
      "CedarTrail Outfitters sells outdoor equipment directly through UK and German online stores.",
    remit:
      "Maya Chen owns paid Search coverage and bidding policy across CedarTrail Outfitters markets.",
    hypothesis:
      "Market-specific brand coverage rules could be worth comparing before assuming the UK snapshot represents Germany.",
    angle: "BRAND_SPEND_EFFICIENCY" as const,
    companyWhy:
      "Separate country stores create a concrete coverage-by-market decision, not proof of wasted spend.",
    personWhy: "The published remit explicitly includes Search coverage and bidding policy.",
    subject: "Brand coverage by market",
    bodies: [
      "CedarTrail Outfitters sells outdoor equipment directly through UK and German online stores. I would be curious whether brand coverage decisions differ between them. One UK mobile snapshot cannot tell us how Germany behaves, or whether either market is overspending. Signal monitors branded search conditions. Would comparing the questions behind a market-specific coverage rule be useful?",
      "A narrower starting point might be the queries where you would keep coverage regardless of competition. That could make any later monitoring discussion more practical than treating every brand search alike. Would a short list of decision questions be useful?",
      "For the measurement side, how would you distinguish paid brand conversions from customers who might otherwise arrive organically? I am asking about the evaluation method, not suggesting the answer is already known. Happy to compare approaches if this is on your agenda.",
      "I will leave this here if brand coverage is not a priority right now. Thanks for considering it.",
    ],
  },
  SAAS: {
    company: "HarborGrid",
    domain: "harborgrid.example.com",
    name: "Elliot Reed",
    role: "VP of Growth",
    business:
      "HarborGrid offers a self-service analytics trial and a separate enterprise demo journey.",
    remit: "Elliot Reed owns paid Search acquisition and pipeline measurement at HarborGrid.",
    hypothesis:
      "Separating navigational trial intent from enterprise evaluation could make a branded-search incrementality discussion useful.",
    angle: "INCREMENTALITY" as const,
    companyWhy:
      "Trial and enterprise demo journeys create different intent and measurement questions.",
    personWhy:
      "Search acquisition and pipeline measurement are corroborated responsibilities, not inferred from Growth VP.",
    subject: "Brand search and the demo journey",
    bodies: [
      "I would separate trial intent from enterprise evaluation before debating brand-search efficiency. HarborGrid offers a self-service analytics trial and a separate enterprise demo journey. I do not know how those paths are measured today, but that distinction might be a useful starting point. Is it relevant to how you evaluate branded Search?",
      "The practical question for me would be which brand queries deserve protection even when other advertisers are not visible. Product evaluation and navigation may call for different decisions; that is a hypothesis to test, not a finding about your campaigns. Would a brief outline be useful?",
      "Could a brand-search test be judged on incremental qualified pipeline rather than the paid channel's reported conversions alone? That would need your own measurement design and data. If that is relevant, I would be interested in your perspective.",
      "No need to make time if this sits outside your current priorities. I will leave the measurement question with you.",
    ],
  },
  FINANCIAL: {
    company: "Meridian Ledger",
    domain: "meridianledger.example.com",
    name: "Nadia Brooks",
    role: "Chief Marketing Officer",
    business:
      "Meridian Ledger offers UK savings accounts and mortgage applications through separate online journeys.",
    remit:
      "Nadia Brooks approves Meridian Ledger paid Search investment and acquisition measurement policy.",
    hypothesis:
      "A brand-coverage policy distinguishing existing-customer navigation from application intent could merit executive review.",
    angle: "OTHER_EVIDENCE_LED" as const,
    companyWhy:
      "Savings and mortgage journeys make protection versus acquisition a specific policy question.",
    personWhy:
      "The CMO's corroborated remit is investment and measurement oversight, not day-to-day bid operation.",
    subject: "A question about brand coverage policy",
    bodies: [
      "Which journeys would you want to protect regardless of a brand-search efficiency test? Meridian Ledger offers UK savings accounts and mortgage applications through separate online journeys. I would start with that protection boundary, rather than assume every branded visit should be treated alike. Would it be useful if I sent a short set of decision questions?",
      "I would start with the traffic you would want to protect regardless of an efficiency test, then ask what evidence should trigger a coverage change. That keeps the commercial tradeoff explicit. Would it help if I sent the questions first?",
      "When evaluating branded paid search, could incremental applications be a more useful test than channel-attributed conversions alone? The answer would depend on your measurement and risk constraints. I would welcome your view rather than assume the right test for your team.",
      "I will close the loop here. If brand coverage becomes a review topic later, happy to pick up the policy question then.",
    ],
  },
};

export function qualityFixture(kind: QualityCase) {
  const ex =
    kind === "PAID_SOCIAL" || kind === "HISTORY_HOLD" ? examples.ECOMMERCE : examples[kind];
  const name =
    kind === "PAID_SOCIAL" ? "Jordan Vale" : kind === "HISTORY_HOLD" ? "Sam Rivera" : ex.name;
  const role = kind === "PAID_SOCIAL" ? "Senior Paid Social Manager" : ex.role;
  const contact = {
    ...collectedContact,
    hubspotRecordId: `synthetic-${kind}`,
    fullName: name,
    companyName: ex.company,
    companyDomain: ex.domain,
    email: `${kind.toLowerCase()}@${ex.domain}`,
    observedAt: testNow.toISOString(),
  };
  const snapshot: EvidenceSnapshot = {
    version: 1,
    contact,
    collectedAt: testNow.toISOString(),
    blockers: [],
    provenanceAtCollection: [],
    observations: structuredClone(verifiedObservations)
      .filter(
        (o) =>
          kind !== "HISTORY_HOLD" || !["outreachHistoryComplete", "complained"].includes(o.field),
      )
      .map((o) => ({
        ...o,
        hubspotRecordId: contact.hubspotRecordId,
        subjectEmail: contact.email,
        subjectCompanyDomain: ex.domain,
        value:
          o.field === "role"
            ? role
            : o.field === "employeeCount"
              ? 1200
              : o.field === "annualRevenueUsd"
                ? 450000000
                : o.field === "paidSearchResponsibility" && kind === "PAID_SOCIAL"
                  ? "ABSENT"
                  : o.value,
        sourceRecordId: `synthetic:${kind}:${o.field}`,
      })),
    providers: [
      { provider: "HUBSPOT", status: "CONNECTED", message: "Fictional offline source only" },
    ],
    integrationReceipts: { HUBSPOT: { jobId: "synthetic-sync", operation: "IMPORTED" } },
  };
  const intake = {
    companyName: ex.company,
    companyDomain: ex.domain,
    prospectName: name,
    prospectTitle: role,
    hubspotRecordId: contact.hubspotRecordId,
    targetMarket: "United Kingdom",
  };
  const run = initialRun("synthetic-operator", `quality-${kind}`, intake, testNow);
  const statements = [
    ex.business,
    `${name} is ${role} at ${ex.company}.`,
    kind === "PAID_SOCIAL"
      ? `${name} manages paid Social only and has no Search responsibility.`
      : ex.remit.replaceAll(ex.name, name),
  ];
  run.research.sources = statements.map((statement, i) => ({
    id: `synthetic-source-${i}`,
    url: `https://${ex.domain}/${i ? "team" : "business"}`,
    title: "Synthetic editorial fixture — not a real retrieved page",
    observedAt: testNow.toISOString(),
    excerpt: statement,
    sourceType: "COMPANY_SITE",
  }));
  run.research.facts = statements.map((statement, i) => ({
    id: ["account:business", "prospect:position", "prospect:remit"][i],
    statement,
    subject: i ? "PROSPECT" : "ACCOUNT",
    category: i === 0 ? "BUSINESS_MODEL" : i === 1 ? "POSITION" : "RESPONSIBILITY",
    confidence: "HIGH",
    limitations: [],
    sourceIds: [`synthetic-source-${i}`],
    quotes: [{ sourceId: `synthetic-source-${i}`, text: statement }],
  }));
  run.research.researchedAt = testNow.toISOString();
  run.research.gaps = ["No first-party Google Ads measurement; no Similarweb metrics"];
  run.knowledge = structuredClone(testKnowledge);
  run.prospectResearch = newResearch(researchIdentity(snapshot), testNow);
  for (const stage of ["COMPANY", "CONTACT", "ASSESSMENT", "REVIEW"] as const)
    Object.assign(run.prospectResearch.stages[stage], {
      status: "COMPLETE",
      attempts: 1,
      finishedAt: testNow.toISOString(),
    });
  run.prospectResearch.status = "PARTIAL";
  if (kind === "ECOMMERCE" || kind === "HISTORY_HOLD")
    run.prospectResearch.serp = [
      {
        id: "synthetic-uk-mobile",
        query: "CedarTrail",
        location: "London",
        country: "gb",
        device: "mobile",
        observedAt: testNow.toISOString(),
        sourceUrl: "https://example.com/synthetic-serp",
        provider: "SERPAPI",
        ads: [{ title: "Fictional brand ad", url: `https://${ex.domain}/` }],
        brandAdvertising: "OBSERVED",
        otherAdvertiserDomains: [],
        limitation: "One fictional snapshot, no persistence or competitor inference",
        captureRecommendation: "Propose a separate German observation; no capture has occurred",
      },
    ];
  run.prospectResearch.opportunity = {
    hypothesis: ex.hypothesis,
    recommendedAngle: kind === "PAID_SOCIAL" ? "NO_PITCH" : ex.angle,
    confidence: "MEDIUM",
    supportingFactIds: ["account:business", "prospect:remit"],
    supportingObservationIds: run.prospectResearch.serp.map((s) => s.id),
    limitations: ["Opportunity hypothesis, not measured waste or savings"],
    missingInformation: run.research.gaps,
    followUp: ["Ask about current coverage decision criteria"],
  };
  run.strategy = {
    prospectId: run.id,
    angle: kind === "PAID_SOCIAL" ? "NO_PITCH" : ex.angle,
    hypothesis: ex.hypothesis,
    rationale: ex.companyWhy + " " + ex.personWhy,
    companyRationale: ex.companyWhy,
    prospectRationale: ex.personWhy,
    supportingFactIds: ["account:business", "prospect:remit"],
    uncertainties: ["Current campaign settings and incrementality are unknown"],
    alternatives: [
      { angle: "COMPETITOR_DEFENSE", reasonNotSelected: "No verified competitor ad observation" },
    ],
  };
  const decision = reviewEvidenceSnapshot(snapshot, testNow).plan.decision;
  run.eligibility = {
    status: decision.status,
    reasons: decision.reasons,
    blockDrafting: decision.status !== "READY",
  };
  const messages: WorkforceSequence["messages"] = ex.bodies.map((body, index) => ({
    step: index + 1,
    subject: index ? `Re: ${ex.subject}` : ex.subject,
    body,
    purpose: [
      ex.hypothesis,
      "Coverage boundary question",
      "Incrementality evaluation",
      "Respectful close",
    ][index],
    suggestedDelayDays: index ? 4 : 0,
    supportingFactIds: index ? [] : ["account:business"],
    supportingObservationIds: [],
    approvedKnowledgeIds: kind === "ECOMMERCE" && index === 0 ? ["product-1"] : [],
    assertions: index
      ? []
      : [
          {
            text: ex.business,
            factIds: ["account:business"],
            knowledgeIds: [],
            observationIds: [],
          },
          ...(kind === "ECOMMERCE"
            ? [
                {
                  text: "Signal monitors branded search conditions.",
                  factIds: [],
                  knowledgeIds: ["product-1"],
                  observationIds: [],
                },
              ]
            : []),
        ],
  }));
  const sequence: WorkforceSequence = {
    prospectId: run.id,
    accountDomain: ex.domain,
    strategy: run.strategy,
    messages,
    creativePlan: {
      approaches: [
        {
          id: "decision",
          concept: ex.companyWhy,
          voice: "Curious and direct",
          narrative: "Decision question, tradeoff, measurement, close",
          prospectFit: ex.personWhy,
          tradeoffs: "Requires buyer interest; no measured campaign problem",
        },
        {
          id: "proof-first",
          concept: "Lead with an approved measured customer outcome",
          voice: "Analytical",
          narrative: "Proof then relevance",
          prospectFit: "Could matter if a relevant approved case is available",
          tradeoffs: "No relevant approved customer proof supplied",
        },
      ],
      selectedApproachId: "decision",
      selectionRationale: ex.hypothesis,
      hypotheses: [
        {
          hypothesis: ex.hypothesis,
          supportingFactIds: ["account:business", "prospect:remit"],
          uncertainty: "Current Search configuration is unknown",
        },
      ],
    },
    review: { verdict: "NEEDS_REVIEW", concerns: [] },
    approved: false,
    canSend: false,
    canEnroll: false,
  };
  if (kind === "ECOMMERCE") {
    messages[0].supportingObservationIds = ["synthetic-uk-mobile"];
  }
  if (decision.status === "READY")
    run.draftStudio = {
      sourceRunId: run.id,
      dependencyHash: "a".repeat(64),
      qualityDecision: null,
      reviewStatus: "PENDING",
      approval: null,
      context: {
        serp: structuredClone(run.prospectResearch.serp),
        opportunity: structuredClone(run.prospectResearch.opportunity),
        missingInformation: run.research.gaps,
        personalizationMode: "EVIDENCE_LED",
      },
      versions: [],
      events: [],
      regenerations: 0,
      failures: 0,
      nextRetryAt: null,
    };
  run.sequence = decision.status === "READY" ? sequence : null;
  return { run, snapshot, decision, sequence, expected: ex };
}
