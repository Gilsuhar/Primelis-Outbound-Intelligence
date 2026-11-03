// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it, vi, afterEach } from "vitest";
import { nikeJudgementDemo } from "./judgement-demo";
import { judgeCompanyResearch, renderJudgementHtml } from "./judgement";
import { buildGroundingAudit } from "./grounding-audit";

afterEach(() => vi.unstubAllGlobals());
it("replays historical evidence without inventing recovered reviewer decisions", () => {
  const { reports } = nikeJudgementDemo();
  expect(reports[0].report.verifiedFacts).toEqual([]);
  expect(reports[0].report.rejectedClaims).toEqual([]);
  expect(reports[0].report.hardFailures).toContain("INDEPENDENT_REVIEW_UNAVAILABLE");
  expect(reports[0].report.sources.every((s) => s.hashMatches)).toBe(true);
  expect(reports[0].report.sources.map((s) => s.characters)).toEqual([2490, 2843, 3032]);
});
it("keeps exact quoted but unreviewed findings provisional", () => {
  const r = nikeJudgementDemo().reports[1].report;
  expect(r.validationIssues).toEqual([]);
  expect(r.provisionalFindings).toHaveLength(1);
  expect(r.verifiedFacts).toEqual([]);
  expect(r.outcome).toBe("HOLD");
});
it("accepts the positive control only within its explicit simulation, never authorizing outbound", () => {
  const r = nikeJudgementDemo().reports[2].report;
  expect(r.mode).toBe("OFFLINE_SIMULATION");
  expect(r.verifiedFacts).toHaveLength(1);
  expect(r.hardFailures).toEqual([]);
  expect(r.outcome).toBe("COMPANY_BRIEF_ONLY");
  expect(r).toMatchObject({ approved: false, canSend: false, canEnroll: false });
  expect(r.scores.find((s) => s.dimension === "Signal relevance")?.score).toBeNull();
});
it("rejects invented metrics even if a simulated reviewer mistakenly supported them", () => {
  const { at, accepted } = nikeJudgementDemo();
  accepted.research.facts[0].statement = "Nike spends $100 million on paid search each year.";
  const r = judgeCompanyResearch(accepted, at, "OFFLINE_SIMULATION");
  expect(r.hardFailures).toContain("UNSUPPORTED_METRIC");
  expect(r.verifiedFacts).toEqual([]);
  expect(r.rejectedClaims).toHaveLength(1);
});
it("uses rejected audit candidates without exposing them as verified facts", () => {
  const r = nikeJudgementDemo().reports[3].report;
  expect(r.verifiedFacts).toEqual([]);
  expect(r.rejectedClaims[0].reasons.join(" ")).toContain("REJECTED_FACTS");
  expect(r.hardFailures).toContain("UNSUPPORTED_CANDIDATE");
});
it.each(["MALFORMED", "UNAVAILABLE"] as const)("holds %s reviewer responses", (status) => {
  const { at, accepted } = nikeJudgementDemo();
  accepted.groundingAudit = buildGroundingAudit(accepted.research, status);
  const r = judgeCompanyResearch(accepted, at, "OFFLINE_SIMULATION");
  expect(r.verifiedFacts).toEqual([]);
  expect(r.hardFailures).toContain(`INDEPENDENT_REVIEW_${status}`);
});
it("rejects inconsistent acceptance coverage and malformed runtime input", () => {
  const { at, accepted } = nikeJudgementDemo();
  accepted.groundingAudit!.reviewer!.supportedCandidateIds = [];
  expect(judgeCompanyResearch(accepted, at, "OFFLINE_SIMULATION").hardFailures).toContain(
    "REVIEW_COVERAGE_INCONSISTENT",
  );
  expect(() =>
    judgeCompanyResearch({ ...accepted, canSend: true } as never, at, "SAVED_RUN"),
  ).toThrow();
});
it.each(["quote", "source", "freshness", "identity"])("preserves existing %s checks", (change) => {
  const { at, accepted } = nikeJudgementDemo();
  if (change === "quote")
    accepted.research.facts[0].quotes[0].text = "A statement not in the source.";
  if (change === "source") accepted.research.sources[1].excerpt += " tampered";
  if (change === "freshness") accepted.research.sources[1].observedAt = "2020-01-01T00:00:00.000Z";
  if (change === "identity") accepted.research.accountDomain = "other.example";
  const r = judgeCompanyResearch(accepted, at, "OFFLINE_SIMULATION");
  expect(r.verifiedFacts).toEqual([]);
  expect(r.outcome).toBe("HOLD");
});
it("has no network side effects and leaves the input run unchanged", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("No network permitted");
    }),
  );
  const { at, accepted } = nikeJudgementDemo();
  const before = structuredClone(accepted);
  judgeCompanyResearch(accepted, at, "SAVED_RUN");
  expect(accepted).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
});
it("holds missing evidence and expired historical replay at a current evaluation date", () => {
  const { at, baseline, accepted } = nikeJudgementDemo();
  baseline.research.sources = [];
  expect(judgeCompanyResearch(baseline, at, "SAVED_RUN").hardFailures).toContain(
    "MISSING_EVIDENCE",
  );
  expect(
    judgeCompanyResearch(accepted, new Date("2026-11-20T00:00:00Z"), "SAVED_RUN").verifiedFacts,
  ).toEqual([]);
});
it("renders escaped static HTML and labels simulated acceptance prominently", () => {
  const { reports } = nikeJudgementDemo();
  reports[0].title = '<script>alert("x")</script>';
  const html = renderJudgementHtml(reports);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain(
    "Simulated reviewer acceptance below is test data, not live independent approval.",
  );
  expect(html).toContain("default-src 'none'");
});
it("filters private contact text from report fields", () => {
  const { at, accepted } = nikeJudgementDemo();
  accepted.research.facts[0].statement = "Contact private@example.invalid for details.";
  const r = judgeCompanyResearch(accepted, at, "OFFLINE_SIMULATION");
  expect(JSON.stringify(r)).not.toContain("private@example.invalid");
});
it("generates the review artifact only with explicit offline report opt-in", () => {
  const { reports } = nikeJudgementDemo();
  expect(reports).toHaveLength(4);
  if (process.env.WRITE_NIKE_QUALITY_REPORT === "1") {
    mkdirSync("docs/reports", { recursive: true });
    writeFileSync("docs/reports/NIKE_QUALITY_REPORT.html", renderJudgementHtml(reports));
    writeFileSync(
      "docs/reports/nike-judgement-results.json",
      JSON.stringify(
        {
          provenance:
            "Historical public excerpts; offline replay at the historical timestamp; simulated reviewer controls; no live run.",
          reports,
        },
        null,
        2,
      ) + "\n",
    );
  }
});
