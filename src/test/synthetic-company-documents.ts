/** Invented offline documents, authored from regression contracts, never local exports.
 * Real company labels exercise existing name-bound code; all excerpts/reviews are synthetic.
 * Hashes are real SHA-256. No contact, credentials, image, customer output or network input.
 */
import { createHash } from "node:crypto";
import { initialRun } from "@/server/agent-workforce/store";
import { signalProductGuide } from "@/features/playbook/playbook-content";
import {
  internalDocumentSchema,
  type InternalCompanyDocument,
} from "@/features/agent-workforce/company-research/internal-review";
import { buildGroundingAudit } from "@/server/agent-workforce/company-research/grounding-audit";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";

export const syntheticAt = "2026-10-20T10:00:00.000Z";
export const syntheticActor = "local-development-agent-workforce";
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const documentIds = {
  historical: "51050532-c7a0-4bf5-bcf7-3d8f5a4d696d",
  failed: "e182f7bd-c35e-4a8b-afc7-67ff86f21cda",
  grounded: "5af5468f-f42b-41f6-a419-2444fbbd0167",
  reusable: "60d7aec5-b74f-4674-ba8c-383878702eb9",
  choice: "d4eb59e6-8160-4d45-a8d2-44c0174b7b65",
  editorial: "5bfc80e8-8d53-4942-86f4-884405437724",
} as const;
function source(
  domain: string,
  path: string,
  excerpt: string,
): WorkforceRun["research"]["sources"][number] {
  const url = `https://${domain}/synthetic-test/${path}`;
  return {
    id: "web:" + sha256(url + excerpt).slice(0, 20),
    url,
    title: "Synthetic offline source — not retrieved",
    observedAt: syntheticAt,
    excerpt,
    sourceType: "COMPANY_SITE",
  };
}
export const choiceStatements = [
  "Choice Hotels serves the global lodging market, with explicit international activity in Europe, Africa, and Asia-Pacific in addition to the Americas.",
  "Choice Hotels is expanding internationally through franchising and property openings.",
  "Choice Hotels operates a media center and uses media-center pages for company news, international press releases, and financial press releases.",
];
export const choiceSources = [
  source(
    "media.choicehotels.com",
    "company",
    "Synthetic offline example for Choice Hotels International, Inc. Choice Hotels describes lodging in Europe and Asia-Pacific. A fictional property opening is announced. A fictional franchising agreement is described. No actual company event is asserted.",
  ),
  source(
    "media.choicehotels.com",
    "news",
    "Synthetic offline example. Choice Hotels maintains a media center for company news. This invented excerpt supports citation tests only, never live research.",
  ),
  source(
    "media.choicehotels.com",
    "unrelated",
    "Synthetic offline example. This separate source deliberately contains none of the submitted quotations. Source identifiers must never be repaired or transposed.",
  ),
];
export const invalidChoiceQuote =
  "Choice Hotels EMEA announces long-term Africa growth plan with 100-hotel commitment by 2035";
function baseRun(company = "Nutrafol", domain = "nutrafol.com") {
  const run = initialRun(
    syntheticActor,
    "synthetic-" + domain,
    {
      companyName: company,
      companyDomain: domain,
      prospectName: "Generic fictional recipient",
      prospectTitle: "Fictional Paid Search buyer",
    },
    new Date(syntheticAt),
  );
  run.knowledge = signalProductGuide.slice(0, 3).map((entry, i) => ({
    id: `internal-playbook:${i}`,
    kind: "PRODUCT",
    title: entry.title,
    text: entry.guidance,
    sourceIds: ["src/features/playbook/playbook-content.ts:signalProductGuide"],
    sourceUrls: [],
    restrictions: `INTERNAL_ONLY product context, not external-use approval. ${entry.avoid} No customer proof, guaranteed savings or performance promises.`,
  }));
  run.research.sources = [
    source(
      domain,
      "one",
      "Synthetic offline example. Hair Health Leader Nutrafol® Expands Into Skin. Nutrafol offers a fictional product range. Nutrafol describes a fictional retail channel. Nutrafol maintains a fictional company website. These are artificial regression excerpts, not real evidence.",
    ),
    source(
      domain,
      "two",
      "Synthetic offline example. This unrelated excerpt exists to test an incorrectly attributed extra quotation and must never grant semantic approval.",
    ),
  ];
  run.strategy = {
    prospectId: run.id,
    angle: "NO_PITCH",
    hypothesis: "Synthetic historical no-pitch decision",
    supportingFactIds: [],
    uncertainties: ["No verified recipient"],
    rationale: "Preserve historical outcome",
    companyRationale: "Synthetic company context",
    prospectRationale: "Fictional audience only",
    alternatives: [
      { angle: "OTHER_EVIDENCE_LED", reasonNotSelected: "Historical no-pitch result" },
    ],
  };
  return run;
}
function automatic(run: WorkforceRun): NonNullable<InternalCompanyDocument["automatic"]> {
  return {
    status: "NO_PITCH",
    stage: "ACCOUNT_RESEARCH",
    run,
    groundingAudit: null,
    screenshot: null,
    screenshotReview: "NOT_RUN",
    issues: [],
    modelCalls: 0,
    usage: [],
    contactEligibility: "HOLD",
    mode: "INTERNAL_ONLY",
  };
}
function wrap(id: string, run: WorkforceRun): InternalCompanyDocument {
  return {
    version: 1,
    id,
    owner: syntheticActor,
    company: "Nutrafol",
    createdAt: syntheticAt,
    image: null,
    review: null,
    automatic: automatic(run),
  };
}
function grounded(id: string) {
  const run = baseRun();
  const statements = [
    "Hair Health Leader Nutrafol® Expands Into Skin",
    "Nutrafol offers a fictional product range.",
    "Nutrafol describes a fictional retail channel.",
    "Nutrafol maintains a fictional company website.",
  ];
  run.research.facts = statements.map((statement, i) => ({
    id: `account:synthetic-${i}`,
    subject: "ACCOUNT",
    category: i === 0 ? "DEVELOPMENT" : "BUSINESS_MODEL",
    statement,
    confidence: "HIGH",
    sourceIds: [run.research.sources[0].id],
    quotes: [{ sourceId: run.research.sources[0].id, text: statement }],
    limitations: ["Synthetic offline evidence only"],
  }));
  const doc = wrap(id, run);
  doc.automatic!.groundingAudit = buildGroundingAudit(run.research, {
    identityMatches: true,
    supportedFactIds: run.research.facts.map((f) => f.id),
    rejectedFactIds: [],
    concerns: [],
  });
  return doc;
}
export function syntheticChoiceDocument() {
  const run = baseRun("Choice Hotels International, Inc.", "media.choicehotels.com");
  run.research.sources = structuredClone(choiceSources);
  const doc = wrap(documentIds.choice, run);
  doc.company = "Choice Hotels";
  doc.automatic!.modelCalls = 4;
  const goodQuotes = [
    [
      {
        sourceId: choiceSources[0].id,
        text: "Choice Hotels describes lodging in Europe and Asia-Pacific.",
      },
    ],
    [
      { sourceId: choiceSources[0].id, text: "A fictional property opening is announced." },
      { sourceId: choiceSources[0].id, text: "A fictional franchising agreement is described." },
    ],
    [
      {
        sourceId: choiceSources[1].id,
        text: "Choice Hotels maintains a media center for company news.",
      },
    ],
  ];
  doc.automatic!.rejectedEvidence = Array.from({ length: 7 }, (_, i) => {
    const n = i + 1,
      selected = n >= 4 && n <= 6;
    const quotes = selected ? goodQuotes[n - 4].map((q) => ({ ...q, exactMatch: true })) : [];
    quotes.push({
      sourceId: choiceSources[2].id,
      text:
        n === 1
          ? goodQuotes[0][0].text // Exact text from another source: never repair the transposed ID.
          : n === 2
            ? choiceSources[0].url // A URL is not an excerpt quotation.
            : n === 5
              ? invalidChoiceQuote
              : `Synthetic invalid quotation ${n}`,
      exactMatch: false,
    });
    return {
      factId: `account:${n}`,
      statement: selected ? choiceStatements[n - 4] : `Synthetic rejected company claim ${n}`,
      sourceIds: [...new Set(quotes.map((q) => q.sourceId))],
      quotes,
      reasons: ["Synthetic prior citation rejection"],
    };
  });
  return internalDocumentSchema.parse(doc);
}
export function syntheticDocument(id: string): InternalCompanyDocument {
  if (id === documentIds.choice) return syntheticChoiceDocument();
  if (id === documentIds.grounded || id === documentIds.reusable)
    return internalDocumentSchema.parse(grounded(id));
  if (id === documentIds.historical) {
    return internalDocumentSchema.parse({
      version: 1,
      id,
      owner: syntheticActor,
      company: "Nutrafol",
      createdAt: "2026-10-19T10:00:00.000Z",
      image: null,
      review: {
        version: 1,
        kind: "AGENT_ASSISTED_INTERNAL_REVIEW",
        company: "Nutrafol",
        companyDomain: "nutrafol.com",
        preparedAt: "2026-10-19T10:00:00.000Z",
        recipient: "Generic Paid Search team — not a verified contact",
        conclusion: "INSUFFICIENT_EVIDENCE",
        summary: "Synthetic historical review",
        evidence: [
          {
            id: "synthetic",
            statement: "Invented observation",
            url: "https://fictional.example/",
            quote: "Invented excerpt",
            observedAt: syntheticAt,
            limitation: "Synthetic only",
          },
        ],
        screenshot: null,
        angles: [
          {
            id: "selected",
            title: "Synthetic angle",
            evidenceIds: ["synthetic"],
            hypothesis: "Fictional question",
            limitations: "No real evidence",
            decision: "SELECTED",
            reason: "Test display",
          },
          {
            id: "rejected",
            title: "Other synthetic angle",
            evidenceIds: ["synthetic"],
            hypothesis: "Fictional alternative",
            limitations: "No real evidence",
            decision: "REJECT",
            reason: "Test display",
          },
        ],
        emails: [1, 2, 3, 4].map((i) => ({
          subject: `Historical synthetic ${i}`,
          body: `Historical synthetic message ${i}; never generated by this submission.`,
          evidenceIds: ["synthetic"],
          intent: "Test display",
        })),
        productClaims: "NO_UNAPPROVED_CAPABILITY_OR_CUSTOMER_PROOF_CLAIMS",
        grounding: "NOT_RUN",
        independentQuality: "NOT_RUN",
        writerAssessment: "Not independent",
        blockers: ["No cleared contact"],
        outboundEligibility: "HOLD",
        approved: false,
        canSend: false,
        canEnroll: false,
      },
    });
  }
  if (id === documentIds.editorial) {
    const doc = grounded(id);
    const a = doc.automatic!;
    a.directDrafts = {
      approach: "Synthetic editorial regression",
      limitations: ["Not real copy"],
      emails: [1, 2, 3, 4].map((i) => ({
        subject: `Synthetic email ${i}`,
        body: `Synthetic offline message ${i}. Where configured, a fictional capability may help. Would a brief conversation be useful?`,
      })),
    };
    a.directReview = {
      verdict: "PASS",
      checks: {
        factualAccuracy: true,
        sourceGrounding: true,
        prospectRelevance: true,
        nonRepetitive: true,
        naturalLanguage: true,
        commercialUsefulness: true,
        approvedClaimsOnly: true,
        originality: true,
        strategicFit: true,
      },
      checkedSteps: [1, 2, 3, 4],
      unsupportedAssertions: [],
      concerns: [],
    };
    return internalDocumentSchema.parse(doc);
  }
  if (id !== documentIds.failed) throw new Error("UNKNOWN_SYNTHETIC_DOCUMENT");
  const doc = wrap(id, baseRun());
  doc.company = "nutrafol.com";
  doc.automatic!.issues = [
    "EVIDENCE_REJECTED",
    "Quote does not occur in its actual source: account:003",
  ];
  return internalDocumentSchema.parse(doc);
}
export const syntheticChoiceRaw = JSON.stringify(syntheticChoiceDocument());
export const syntheticChoiceBinding = {
  sourceDocumentSha256: sha256(syntheticChoiceRaw),
  sourceRunId: syntheticChoiceDocument().automatic!.run!.id,
};
