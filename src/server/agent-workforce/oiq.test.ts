import { describe, expect, it } from "vitest";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { oiqJudgmentSchema } from "@/features/agent-workforce/oiq-contracts";
import { qualityFixture } from "@/test/workforce-quality-fixtures";
import { syntheticOiqJudgment, testNow } from "@/test/workforce-fixtures";
import { assessOiq, qualityReviewPassed } from "./oiq";

const critic = (): Omit<NonNullable<WorkforceRun["critic"]>, "oiq"> => ({
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
});
function setup() {
  const { run } = qualityFixture("SAAS");
  const judgment = syntheticOiqJudgment(["account:business", "prospect:remit"]);
  return { run, judgment, review: critic() };
}
describe("OIQ editorial judgments with deterministic evidence and approval safeguards", () => {
  it("assesses a strong sourced insight without SERP data, without forcing every follow-up to repeat its facts", () => {
    const { run, judgment, review } = setup();
    const oiq = assessOiq(run, judgment, review, testNow);
    expect(oiq.score).toBe(93);
    expect(oiq.decision).toBe("READY_FOR_HUMAN_REVIEW");
    expect(oiq.references.map((r) => r.id)).toEqual(["account:business", "prospect:remit"]);
    expect(
      oiq.references.every(
        (r) => r.url.startsWith("https://") && r.observedAt && r.messageSteps.includes(1),
      ),
    ).toBe(true);
    expect(oiq.blockingReasons).toEqual([]);
    run.critic = { ...review, oiq };
    expect(qualityReviewPassed(run, testNow)).toBe(true);
  });
  it.each([
    [100, "READY_FOR_HUMAN_REVIEW"],
    [85, "READY_FOR_HUMAN_REVIEW"],
    [84, "REVISE"],
    [65, "REVISE"],
    [64, "BLOCKED"],
    [0, "BLOCKED"],
  ] as const)("applies the exact threshold for %i", (total, decision) => {
    const { run, judgment, review } = setup();
    const caps = [30, 25, 20, 15, 10];
    const values = Object.values(judgment.components);
    values.forEach((c, i) => {
      c.score = Math.floor((total * caps[i]) / 100);
    });
    let remainder = total - values.reduce((n, c) => n + c.score, 0);
    for (let i = 0; remainder > 0; i = (i + 1) % values.length)
      if (values[i].score < caps[i]) {
        values[i].score++;
        remainder--;
      }
    const assessment = assessOiq(run, judgment, review, testNow);
    expect(assessment.score).toBe(total);
    expect(assessment.decision).toBe(decision);
  });
  it("flags company-name substitution and prevents inflated model scores from passing", () => {
    const { run, judgment, review } = setup();
    Object.values(judgment.components).forEach((c, i) => {
      c.score = [30, 25, 20, 15, 10][i];
    });
    judgment.companySwapTest = {
      equallyRelevant: true,
      reason: "The same role-based product pitch works for any analytics vendor",
    };
    const oiq = assessOiq(run, judgment, review, testNow);
    expect(oiq.score).toBe(70);
    expect(oiq.decision).toBe("REVISE");
    expect(oiq.weakPersonalization).toBe(true);
    expect(oiq.improvements.join(" ")).toContain("interchangeable");
  });
  it("blocks generic emails even if the mocked model claims perfect specificity and retains unused fact IDs", () => {
    const { run, judgment, review } = setup();
    Object.values(judgment.components).forEach((c, i) => {
      c.score = [30, 25, 20, 15, 10][i];
    });
    run.sequence!.messages[0].body =
      "As a Growth leader, would you like to discuss branded search? Signal could be relevant to your team.";
    const oiq = assessOiq(run, judgment, review, testNow);
    expect(oiq.decision).toBe("BLOCKED");
    expect(oiq.score).toBeLessThan(65);
    expect(oiq.weakPersonalization).toBe(true);
    expect(oiq.components.verifiedEvidence.score).toBe(0);
  });
  it("blocks an unsupported factual claim despite a 93-point core insight", () => {
    const { run, judgment, review } = setup();
    run.sequence!.messages[2].body += " You are wasting money on brand ads.";
    review.unsupportedAssertions = ["No measurements establish wasted spend"];
    review.checks.factualAccuracy = false;
    const oiq = assessOiq(run, judgment, review, testNow);
    expect(oiq.score).toBe(93);
    expect(oiq.decision).toBe("BLOCKED");
    expect(oiq.blockingReasons).toContain("No measurements establish wasted spend");
  });
  it("catches unsupported statistics omitted by the model's assertion ledger and OIQ judgment", () => {
    const { run, judgment, review } = setup();
    run.sequence!.messages[1].body += " We guarantee 42% savings.";
    expect(assessOiq(run, judgment, review, testNow)).toMatchObject({
      score: 93,
      decision: "BLOCKED",
    });
  });
  it.each([
    "missing-company-facts",
    "missing-source",
    "bad-quote",
    "unknown-fact",
    "future-source",
    "missing-core-evidence",
  ])("cannot compensate for %s with polished writing", (condition) => {
    const { run, judgment, review } = setup();
    if (condition === "missing-company-facts") judgment.coreInsight.factIds = ["prospect:remit"];
    if (condition === "missing-source") run.research.sources = [];
    if (condition === "bad-quote") run.research.facts[0].quotes[0].text = "Invented quote";
    if (condition === "unknown-fact") judgment.coreInsight.factIds.push("another-contact:fact");
    if (condition === "future-source") run.research.sources[0].observedAt = "2027-01-01T00:00:00Z";
    if (condition === "missing-core-evidence")
      judgment.missingCoreEvidence = ["The central observation has no source"];
    const oiq = assessOiq(run, judgment, review, testNow);
    expect(oiq.decision).toBe("BLOCKED");
    expect(oiq.blockingReasons.length).toBeGreaterThan(0);
  });
  it.each(["missing", "stale", "uncited", "persistent-pattern"])(
    "blocks %s SERP support when the insight relies on it",
    (condition) => {
      const { run } = qualityFixture("ECOMMERCE");
      const judgment = syntheticOiqJudgment(["account:business", "prospect:remit"]);
      judgment.coreInsight.observationIds = ["synthetic-uk-mobile"];
      if (condition === "missing") run.draftStudio!.context.serp = [];
      if (condition === "stale")
        run.draftStudio!.context.serp[0].observedAt = "2026-10-13T12:00:00Z";
      if (condition === "uncited") run.sequence!.messages[0].supportingObservationIds = [];
      if (condition === "persistent-pattern")
        run.sequence!.messages[1].body += " Competitors consistently bid on your brand.";
      expect(assessOiq(run, judgment, critic(), testNow).decision).toBe("BLOCKED");
    },
  );
  it("keeps OIQ independent of eligibility and never enables sending or enrollment", () => {
    const { run, judgment, review } = setup();
    run.eligibility = {
      status: "HOLD",
      reasons: ["History authority unknown"],
      blockDrafting: true,
    };
    expect(assessOiq(run, judgment, review, testNow).decision).toBe("READY_FOR_HUMAN_REVIEW");
    expect(run.eligibility.status).toBe("HOLD");
    expect(run.canSend || run.canEnroll || run.approved).toBe(false);
  });
  it("does not trust stored totals, legacy reviews without OIQ or content changed after scoring", () => {
    const { run, judgment, review } = setup();
    run.critic = review;
    expect(qualityReviewPassed(run, testNow)).toBe(false);
    const oiq = assessOiq(run, judgment, review, testNow);
    run.critic = { ...review, oiq };
    expect(qualityReviewPassed(run, testNow)).toBe(true);
    run.sequence!.messages[0].body += " A human edit needs review.";
    expect(qualityReviewPassed(run, testNow)).toBe(false);
    const next = assessOiq(run, judgment, review, testNow);
    next.components.companyInsight.score = 0;
    next.components.verifiedEvidence.score = 0;
    next.score = 100;
    next.decision = "READY_FOR_HUMAN_REVIEW";
    run.critic.oiq = next;
    expect(qualityReviewPassed(run, testNow)).toBe(false);
  });
  it("rejects invalid component bounds rather than accepting fabricated totals", () => {
    const judgment = syntheticOiqJudgment();
    judgment.components.companyInsight.score = 31;
    expect(oiqJudgmentSchema.safeParse(judgment).success).toBe(false);
  });
});
