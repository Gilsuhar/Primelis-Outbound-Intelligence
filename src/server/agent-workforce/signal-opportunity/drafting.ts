import "server-only";
import { outreachPrinciples, sequenceGuidance } from "@/features/playbook/playbook-content";
import { goldStandardExamples } from "@/features/build-sequence/gold-standard-examples";
import type { KnowledgeRecord } from "@/features/agent-workforce/gate-a-contracts";
import type { SignalEvidence, SignalReport } from "@/features/agent-workforce/signal-opportunity";
import { editorialConcerns } from "../commercial-quality";

/** Observable copy defects only. Passing does not establish semantic quality or reply probability. */
export function signalDraftEditorialConcerns(report: SignalReport, company: string) {
  const issues = editorialConcerns({
    messages: report.emails.map((m, i) => ({ ...m, step: i + 1 })),
  });
  report.emails.forEach((email, index) => {
    if (!email.body.toLowerCase().includes(company.toLowerCase()))
      issues.push(`Email ${index + 1} lacks an account-specific anchor`);
    if (
      /\d{4}-\d\d-\d\dT\d\d:\d\d|\b([A-Za-z]+(?: [A-Za-z]+)*),\1,|the observations establish no savings|one capture cannot establish|based on available evidence|we cannot confirm/i.test(
        email.body,
      )
    )
      issues.push(`Email ${index + 1} exposes internal evidence-report language`);
  });
  const tokens = report.emails.map(
    (m) =>
      new Set(
        m.body
          .toLowerCase()
          .replace(/^hi [^\n]+|^gil$/gm, "")
          .match(/[a-z0-9]+/g) ?? [],
      ),
  );
  tokens.forEach((a, i) =>
    tokens.slice(i + 1).forEach((b, offset) => {
      const intersection = [...a].filter((t) => b.has(t)).length;
      if (intersection / new Set([...a, ...b]).size >= 0.8)
        issues.push(`Emails ${i + 1} and ${i + offset + 2} repeat substantially the same message`);
    }),
  );
  return [...new Set(issues)];
}

/** These records already passed the authoritative knowledge loader. This is an
 * additional drafting restriction, never a substitute for human knowledge approval. */
export function permittedDraftProduct(record: KnowledgeRecord) {
  return (
    record.kind === "PRODUCT" &&
    record.sourceIds.length > 0 &&
    record.sourceUrls.length > 0 &&
    !/needs[_ -]?review|internal.only|confidential|do not use|restricted|reply.only|deck.only/i.test(
      record.restrictions,
    ) &&
    // This path uses product mechanisms, not customer metrics disguised as product wording.
    !/zoominfo|\d|%|\b(case study|customer result|guarantee[ds]?)\b/i.test(record.text)
  );
}

type DraftInput = {
  company: string;
  contact: NonNullable<SignalReport["contact"]>;
  evidence: SignalEvidence & {
    search: NonNullable<SignalEvidence["search"]>;
    serp: NonNullable<SignalEvidence["serp"]>;
  };
  insights: SignalReport["insights"];
  products: KnowledgeRecord[];
};

const shortDate = (value: string, year = false) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(value));

/** Pure, offline evidence-to-copy composition. No provider, CRM or permission side effects.
 * Called only AFTER the existing contact, source and independent grounding gates pass. */
export function draftSignalOpportunity(input: DraftInput) {
  const {
    company,
    contact,
    evidence: { search, serp, target },
    insights,
  } = input;
  const products = input.products.filter(permittedDraftProduct);
  if (!products.length || insights.length !== 3) throw new Error("SIGNAL_DRAFT_BRIEF_INCOMPLETE");
  if (!search || !serp) throw new Error("SIGNAL_DRAFT_EVIDENCE_MISSING");
  const same = (left: string, right: string) =>
    left.trim().toLowerCase() === right.trim().toLowerCase();
  const brandHost = search.companyDomain.toLowerCase().replace(/^www\./, "");
  if (
    !same(search.keyword, target.query) ||
    !same(serp.query, target.query) ||
    search.country !== target.country ||
    serp.country !== target.country ||
    search.device !== target.device ||
    serp.device !== target.device ||
    !same(serp.location, target.location) ||
    serp.brandAdvertising !== "OBSERVED" ||
    !serp.ads.some((ad) => {
      try {
        const host = new URL(ad.url).hostname.toLowerCase().replace(/^www\./, "");
        return host === brandHost || host.endsWith("." + brandHost);
      } catch {
        return false;
      }
    })
  )
    throw new Error("SIGNAL_DRAFT_BRAND_SCOPE_MISMATCH");
  const visibility = products.find((p) => /monitor/i.test(p.text)) ?? products[0];
  const bidding = products.find((p) => /bid|paus|coverage/i.test(p.text));
  const executive = /\bcmo\b|chief marketing officer/i.test(contact.title);
  const firstName = contact.name.trim().split(/\s+/)[0];
  const city = target.location.split(",")[0].trim();
  const crossesYear = search.periodStart.slice(0, 4) !== search.periodEnd.slice(0, 4);
  const period = `${shortDate(search.periodStart, crossesYear)} and ${shortDate(search.periodEnd, true)}`;
  const observation = `Based on search traffic data, branded keywords accounted for an estimated ${search.brandedPaidSharePercent}% of ${company}'s ${search.country} ${search.device} paid-search visits between ${period}.`;
  // Keep a single credit when required or unknown; never lead with the provider.
  const attribution = search.attributionRequired === false ? "" : " Search data: Similarweb.";
  const alongside = serp.otherAdvertiserDomains.length > 0;
  const serpObservation = `On ${shortDate(serp.observedAt, true)}, a ${target.device} search for "${target.query}" in ${city} showed your ad${alongside ? " alongside another advertiser" : ""}.`;
  const decisionGap =
    search.brandedPaidSharePercent >= 50
      ? "When does your brand ad need to defend the click, and when could a lower bid do the same job?"
      : "Which brand queries need defensive coverage, and where could bids follow changing competition?";
  const mechanism = bidding?.text ?? visibility.text;
  // Historical body, subject, customer names, numbers and claimed outcome NEVER cross this boundary.
  const learning = goldStandardExamples
    .filter((e) => e.approvedForLearning)
    .map((e) => ({
      id: e.id,
      reasoningTags: [...e.reasoningTags],
      principles: [...e.whyItWorked],
    }));
  const brief = {
    observation,
    searchSource: {
      provider: search.provider,
      recordId: search.recordId,
      sourceUrl: search.sourceUrl,
      country: search.country,
      device: search.device,
      periodStart: search.periodStart,
      periodEnd: search.periodEnd,
      retrievedAt: search.retrievedAt,
      visitsDefinition: search.visitsDefinition,
      shareDefinition: search.shareDefinition,
      classificationBasis: search.classificationBasis,
      excerpt: search.excerpt,
      limitations: [...search.limitations],
      attributionRequired: search.attributionRequired ?? true,
      disclosure:
        "Third-party estimated visits, not spend, conversions or first-party Google Ads analytics. Disclose Similarweb and the exact scope when asked.",
    },
    recipientRationale: `${contact.title}. ${contact.reason}`,
    decisionGap: `Hypothesis to discuss, not a diagnosed account problem: ${decisionGap}`,
    permittedClaims: [
      ...new Map([visibility, ...(bidding ? [bidding] : [])].map((p) => [p.id, p])).values(),
    ].map((p) => ({ knowledgeId: p.id, text: p.text, sourceUrls: p.sourceUrls })),
    styleGuidance: [...outreachPrinciples],
    progressionGuidance: sequenceGuidance.map((s) => `${s.step}: ${s.job}`),
    learning,
    exclusions: [
      "All customer case studies/metrics omitted in this drafting path; no historical proof imported.",
      "Historical ZoomInfo 40% CPC wording is excluded; it must not replace cost-per-MQL evidence.",
      "No current persistent competitor activity, unnecessary spend, savings or incrementality asserted.",
      ...search.limitations,
      serp.limitation,
      "Approved knowledge and contact clearance must still be rechecked before any live use.",
    ],
    screenshotRecommendation: {
      status: "MATCHED_OBSERVATION_ONLY",
      companyDomain: search.companyDomain,
      query: target.query,
      observedAt: serp.observedAt,
      sourceUrl: serp.sourceUrl,
      instruction:
        "Request an authorized screenshot matching this exact brand/query/market/device and observation. No image is attached or independently authenticated by this brief.",
    },
    workflow: {
      research: "GROUNDED_UPSTREAM",
      drafting: "GENERATED",
      humanReview: "PENDING",
      sending: "NOT_APPROVED",
      enrollment: "NOT_APPROVED",
    },
  };
  const message = (
    subject: string,
    paragraphs: string[],
    factIds: string[],
    knowledgeIds: string[],
  ) => ({
    subject,
    body: [`Hi ${firstName},`, ...paragraphs, "Gil"].join("\n\n"),
    factIds,
    knowledgeIds,
  });
  const emails: SignalReport["emails"] = [
    message(
      `${company}'s brand bids`,
      [
        observation + attribution,
        mechanism + " " + decisionGap,
        executive
          ? "Worth a quick look with your search team?"
          : "Worth checking where CPCs could be lower?",
      ],
      [insights[1].factId],
      [bidding?.id ?? visibility.id],
    ),
    message(
      "Who else shows up?",
      [
        serpObservation,
        alongside
          ? "That's the picture I'd want over time: who shows up, and when your brand needs defending."
          : "I'd want to see how that picture changes across the day before deciding when to defend the brand.",
        visibility.text,
        executive
          ? "Would that visibility help your team's brand-search review?"
          : "Do you already use that view to decide when to bid?",
      ],
      [insights[2].factId],
      [visibility.id],
    ),
    message(
      "One query, one controlled test",
      [
        `For "${target.query}", could lower bids when competition eases preserve conversions? That's worth testing, not assuming.`,
        "We could start with one branded query, compare against a control, and agree when to restore the original bids if conversions fall.",
        "Would 15 minutes to discuss reducing branded CPC with a controlled test be useful?",
      ],
      [insights[2].factId],
      [bidding?.id ?? visibility.id],
    ),
    message(
      "Leave it here?",
      [
        `If brand bids at ${company} already respond to changing competition, I'll leave you to it.`,
        "If that's still a manual decision, happy to compare notes.",
      ],
      [insights[1].factId, insights[2].factId],
      [],
    ),
  ];
  return { brief, emails };
}
