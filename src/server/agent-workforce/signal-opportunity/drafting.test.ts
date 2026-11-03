// @vitest-environment node
import { beforeAll, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { CompanyQueue } from "../company-queue/engine";
import { MemoryQueueStore } from "../company-queue/test-support";
import { fixtureCompanies } from "../company-queue/fixtures";
import type { CompanyJob } from "../company-queue/contracts";
import { signalFixtureAdapters, signalFixtureExecutor, signalFixtureKnowledge } from "./fixtures";
import {
  draftSignalOpportunity,
  permittedDraftProduct,
  signalDraftEditorialConcerns,
} from "./drafting";
import { evaluateSignal } from "./evaluation";
import { assessSignalPacket } from "./packet-evals";

const now = new Date("2026-10-19T12:00:00.000Z");
let job: CompanyJob;
beforeAll(async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("OFFLINE_ONLY"));
  try {
    const store = new MemoryQueueStore();
    const queue = new CompanyQueue(store, signalFixtureExecutor(), () => now);
    const { fixture, ...input } = fixtureCompanies[0];
    await queue.enqueue("fictional", input, "writing-review", fixture, "SIGNAL_OPPORTUNITY_V1");
    for (let i = 0; i < 6; i++) await queue.tick("fictional");
    job = (await store.read("fictional")).jobs[0];
    expect(job.signalReport?.eligibility).toBe("Eligible");
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});
const input = () => ({
  company: job.run.input.companyName,
  contact: job.signalReport!.contact!,
  evidence: {
    ...job.signalEvidence!,
    search: job.signalEvidence!.search!,
    serp: job.signalEvidence!.serp!,
  },
  insights: job.signalReport!.insights,
  products: signalFixtureKnowledge,
});

it("keeps draft, human review and outbound permission separate with a focused CTA", () => {
  const result = draftSignalOpportunity(input());
  expect(result.emails[2].body).toContain("15 minutes");
  expect(result.emails[2].body).toContain("branded CPC");
  expect(result.brief.workflow).toMatchObject({ humanReview: "PENDING", sending: "NOT_APPROVED", enrollment: "NOT_APPROVED" });
  expect(result.brief.screenshotRecommendation.companyDomain).toBe(input().evidence.search.companyDomain);
  expect(result.emails.every(email => !/calendly|free three.day|guaranteed/i.test(email.body))).toBe(true);
});
it.each(["query", "country", "device", "location", "brand"])("rejects a screenshot/observation with mismatched %s", mismatch => {
  const changed = structuredClone(input());
  if (mismatch === "query") changed.evidence.serp.query = "unrelated brand";
  if (mismatch === "country") changed.evidence.serp.country = "GB";
  if (mismatch === "device") changed.evidence.serp.device = "mobile";
  if (mismatch === "location") changed.evidence.serp.location = "Other city";
  if (mismatch === "brand") changed.evidence.serp.ads = [{ title: "Unrelated", url: "https://unrelated.invalid" }];
  expect(() => draftSignalOpportunity(changed)).toThrow("BRAND_SCOPE_MISMATCH");
});
it.each([
  "We guarantee savings for your account.",
  "Your conversions remain unchanged.",
  "Try our free three-day monitoring.",
  "Book https://calendly.com/fictional/test now.",
])("flags an unsafe mocked model output: %s", unsafe => {
  const report = structuredClone(job.signalReport!);
  report.emails[0].body += " " + unsafe;
  expect(signalDraftEditorialConcerns(report, job.run.input.companyName).length).toBeGreaterThan(0);
  expect(assessSignalPacket(job.run, report, now).readyForApproval).toBe(false);
});
it("keeps absent Similarweb evidence missing and creates no replacement claims", () => {
  const evidence = structuredClone(job.signalEvidence!);
  delete evidence.search;
  const report = evaluateSignal(job.run, evidence, { ready: true, blockers: [], contact: job.signalReport!.contact }, signalFixtureKnowledge, now, "SIMULATED");
  expect(report.eligibility).toBe("HOLD");
  expect(report.blockers).toContain("SIMILARWEB_AUTHORIZED_PAID_SEARCH_BRANDED_EXPORT_REQUIRED");
  expect(report.emails).toEqual([]);
  expect(report.canSend).toBe(false);
});

it("produces evidence-bound, concise drafts and a separate brief through the existing gated queue", () => {
  const { brief, emails } = draftSignalOpportunity(input());
  expect(emails).toEqual(job.signalReport!.emails);
  expect(emails).toHaveLength(4);
  expect(emails[0].body).toContain("62%");
  expect(emails[0].body).toContain("estimated");
  expect(emails[0].body).toContain("US desktop");
  expect(emails[1].body).toContain("alongside another advertiser");
  expect(emails[2].body).toContain("compare against a control");
  expect(emails[3].body).not.toContain("?");
  expect(emails.every((m) => m.body.split(/\s+/).length < 110)).toBe(true);
  expect(JSON.stringify(emails)).not.toMatch(
    /ZoomInfo|MQL|40%|T12:00|New York,New York|establish no savings/,
  );
  expect(brief.permittedClaims).toHaveLength(2);
  expect(brief.exclusions.join(" ")).toMatch(/not ad spend|not.*competitor/);
  expect(brief.learning[0]).not.toHaveProperty("body");
  expect(brief.learning[0]).not.toHaveProperty("outcome");
  expect(assessSignalPacket(job.run, job.signalReport!, now)).toMatchObject({
    status: "DETERMINISTIC_CHECKS_PASS",
    readyForApproval: false,
    semanticReview: "NOT_RUN",
  });
  if (process.env.WRITE_SIGNAL_WRITING_REVIEW === "true") {
    writeFileSync(
      "docs/reports/SIGNAL_WRITING_REVIEW.md",
      "# Signal writing review — fictional, human approval pending\n\n" +
        "OFFLINE ONLY. No real contact, licensed provider observation, product approval or independent semantic review is represented. Stephanie remains HOLD. No sending/enrollment. Uses the existing gated Signal queue and its fictional evidence.\n\n" +
        "## Internal sales brief\n\n" +
        `${brief.observation}\n\nRecipient: ${brief.recipientRationale}\n\n${brief.decisionGap}\n\n` +
        "Internal search provenance (not first-party account analytics):\n\n```json\n" +
        JSON.stringify(brief.searchSource, null, 2) + "\n```\n\n" +
        brief.permittedClaims
          .map(
            (p) =>
              `- Fictional permitted wording (${p.knowledgeId}): ${p.text} Source: ${p.sourceUrls.join(", ")}`,
          )
          .join("\n") +
        "\n\nInternal limits:\n" +
        brief.exclusions.map((s) => `- ${s}`).join("\n") +
        "\n\nStyle sources: existing outreachPrinciples, sequenceGuidance and learning-example reasoning tags. Historical example bodies, customer metrics and claimed outcomes are excluded. Offline composition uses scoped observations, role and ad-presence branches; it is not a new live model run.\n\n" +
        "## Four candidate emails\n\n" +
        emails
          .map(
            (m, i) =>
              `### Email ${i + 1}: ${m.subject}\n\n${m.body}\n\nInternal citations: ${m.factIds.join(", ")}. Product claims: ${m.knowledgeIds.join(", ") || "None"}.`,
          )
          .join("\n\n") +
        "\n\n## Exact fictional evidence\n\n" +
        job
          .signalReport!.insights.map(
            (f) =>
              `- ${f.factId}: ${f.statement}\n${f.quotes.map((q) => `  Quote: ${q.text}\n  Source: ${job.run.research.sources.find((s) => s.id === q.sourceId)?.url}`).join("\n")}`,
          )
          .join("\n\n") +
        "\n\n## Editorial assessment (not independent AI clearance)\n\n" +
        "| Email | Specificity / relevance | Credibility | Commercial value / reason to reply |\n|---|---|---|---|\n" +
        "| 1 | Scoped branded-traffic estimate and bidding question | Preserves estimate and market/device/period | Asks how the buyer makes the decision; stronger than offering to compare reports |\n" +
        "| 2 | Actual fixture query and dated observed ad presence | Other advertiser is not called a verified competitor | Moves from the snapshot to useful competitive visibility |\n" +
        "| 3 | One-query proposal tied to the prior observation | Conditional mechanism, control and conversion guardrails; no proof or promised savings | Offers a concrete test outline |\n" +
        "| 4 | Continues the same account question without repeating the pitch | Assumes neither manual work nor an unmet need | Low-pressure close; intentionally less new content |\n\n" +
        "Before: audit language, raw timestamps, repeated location strings and vague requests to investigate. After: distinct decision/visibility/test/close purposes with short paragraphs and conditional claims. Writing is still an offline composed candidate; Gil voice fidelity, human usefulness and reply likelihood are unverified. No reply rate or quality score is inferred. Request human review before further work.\n",
    );
  }
});

it("varies the brief for recipient and actual observation instead of inventing competitor presence", () => {
  const changed = structuredClone(input());
  changed.contact.title = "Chief Marketing Officer";
  changed.evidence.serp.otherAdvertiserDomains = [];
  changed.evidence.search.brandedPaidSharePercent = 20;
  const { emails } = draftSignalOpportunity(changed);
  expect(emails[0].body).toContain("20%");
  expect(emails[0].body).toContain("your search team");
  expect(emails[0].body).not.toContain("How are you making");
  expect(emails[1].body).not.toContain("alongside another advertiser");
  expect(emails[1].body).not.toMatch(/no competitors|alone|only advertiser/);
});

it("ignores customer records and refuses unreviewed or mislabeled historical metric claims", async () => {
  const product = signalFixtureKnowledge[0];
  for (const unsafe of [
    { ...product, restrictions: "NEEDS_REVIEW" },
    { ...product, text: "Signal reduced ZoomInfo branded CPC by 40%." },
    { ...product, kind: "CASE_STUDY" as const, text: "ZoomInfo reduced cost per MQL by 40%." },
  ]) {
    expect(permittedDraftProduct(unsafe)).toBe(false);
    const report = evaluateSignal(
      job.run,
      job.signalEvidence!,
      await signalFixtureAdapters().contact(job, now),
      [unsafe],
      now,
      "SIMULATED",
    );
    expect(report.eligibility).toBe("HOLD");
    expect(report.emails).toEqual([]);
    const mixed = evaluateSignal(
      job.run,
      job.signalEvidence!,
      await signalFixtureAdapters().contact(job, now),
      [...signalFixtureKnowledge, unsafe],
      now,
      "SIMULATED",
    );
    expect(mixed.emails).toEqual(job.signalReport!.emails);
  }
});

it("keeps a contact HOLD even with sufficient research and product wording", () => {
  const report = evaluateSignal(
    job.run,
    job.signalEvidence!,
    {
      ready: false,
      blockers: ["CURRENT_EMPLOYMENT_AND_OUTREACH_HISTORY_UNVERIFIED"],
      contact: null,
    },
    signalFixtureKnowledge,
    now,
    "SIMULATED",
  );
  expect(report.eligibility).toBe("HOLD");
  expect(report.emails).toEqual([]);
});

it.each(["generic", "mechanical", "near-repeat"])(
  "rejects %s copy in the existing packet review",
  (kind) => {
    const report = structuredClone(job.signalReport!);
    if (kind === "generic")
      report.emails[0].body = "Hi Alex,\nWould you like better marketing results?\nGil";
    if (kind === "mechanical") report.emails[1].body += " Observed at 2026-10-19T12:00:00Z.";
    if (kind === "near-repeat")
      report.emails[1].body = report.emails[0].body.replace("useful", "practical");
    expect(signalDraftEditorialConcerns(report, job.run.input.companyName).length).toBeGreaterThan(
      0,
    );
    expect(assessSignalPacket(job.run, report, now).status).toBe("REVISE_OR_BLOCK");
  },
);
