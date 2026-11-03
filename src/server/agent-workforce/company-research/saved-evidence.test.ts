// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sourceSchema, groundedFactSchema } from "@/features/agent-workforce/gate-a-contracts";
import { validateResearch } from "../evidence-validation";
import { runCompanyResearch } from "./service";
import { fictionalCompanyEnv } from "./test-fixtures";
import { MemoryDailyStore } from "../daily/test-store";
import type { CompanyRun } from "@/features/agent-workforce/company-research/contracts";
import type { CompanyStore } from "./store";
import type { WorkforceModel } from "../openai";
import type { CompanyGroundingReview } from "@/features/agent-workforce/company-research/grounding-review";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/nike-public-excerpts-2026-10-18.json", import.meta.url), "utf8"),
);
const sources = sourceSchema.array().parse(fixture.sources);
const at = new Date(fixture.at);
const input = { companyName: "Nike", companyDomain: "nike.com" };
const who = sources.find((s) => s.url.endsWith("/who-we-are"))!;
const annual = sources.find((s) => s.url.endsWith("/annual-reports"))!;
const exactQuote =
  "NIKE, Inc. is the world's leading designer, marketer, and distributor of authentic athletic footwear, apparel, equipment, and accessories for a wide variety of sports and fitness activities.";
const good = groundedFactSchema.parse({
  id: "account:products",
  subject: "ACCOUNT",
  category: "PRODUCTS",
  statement:
    "NIKE's product categories include athletic footwear, apparel, equipment, and accessories.",
  sourceIds: [who.id],
  confidence: "HIGH",
  limitations: ["Company's own description; no independent market-leadership claim."],
  quotes: [{ sourceId: who.id, text: exactQuote }],
});
// Deliberately unsupported test claim, never a finding or a replay of the lost model output.
const bad = groundedFactSchema.parse({
  ...good,
  id: "account:unsupported-test",
  statement: "Nike spends $100 million on paid search each year.",
});
function research(facts = [good]) {
  return {
    id: "saved-evidence-test",
    intake: input,
    research: {
      accountDomain: "nike.com",
      prospectId: "saved-evidence-test",
      researchedAt: at.toISOString(),
      sources: structuredClone(sources),
      facts: structuredClone(facts),
      gaps: [],
      assumptions: [],
    },
  };
}
function validate(value = research(), time = at) {
  return validateResearch(value, time, { company: true, prospect: false });
}
beforeEach(() => {
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("retains the actual saved source identities, timestamps and public excerpt hashes", () => {
  expect(sources).toHaveLength(3);
  for (const s of sources) {
    expect(s.id).toBe(
      "web:" +
        createHash("sha256")
          .update(s.url + s.excerpt)
          .digest("hex")
          .slice(0, 20),
    );
    expect(Date.parse(s.observedAt)).toBeLessThanOrEqual(at.getTime());
    expect(s.excerpt.length).toBeLessThan(18000);
  }
});
it("captures relevant Who We Are business text without truncation; annual-report listing is not report contents", () => {
  expect(who.excerpt).toContain(exactQuote);
  expect(who.excerpt).toContain("2026 Revenue $46.4B");
  expect(annual.excerpt).toContain("Form 10-K: Annual report");
  expect(annual.excerpt).not.toContain(exactQuote);
});
it("accepts a narrowly source-backed product finding using untouched saved content", () => {
  expect(validate()).toEqual([]);
});
it("rejects punctuation-altered quotations rather than fuzzy matching", () => {
  const r = research();
  r.research.facts[0].quotes[0].text = exactQuote.replace(
    "designer, marketer,",
    "designer and marketer",
  );
  expect(validate(r)).toContain("Quote does not occur in its actual source: account:products");
});
it("rejects an authentic quotation attributed to the wrong retrieved source", () => {
  const r = research();
  r.research.facts[0].sourceIds = [annual.id];
  r.research.facts[0].quotes[0].sourceId = annual.id;
  expect(validate(r)).toContain("Quote does not occur in its actual source: account:products");
});
it("preserves source freshness enforcement", () => {
  const r = research();
  r.research.sources.find((s) => s.id === who.id)!.observedAt = "2020-01-01T00:00:00.000Z";
  expect(validate(r)).toContain("Source is unavailable, stale or invalid: " + who.id);
});
it("preserves run/account identity enforcement", () => {
  const r = research();
  r.research.accountDomain = "different.example";
  expect(validate(r)).toContain("Research identity does not match this run");
});
it("documents that exact quotation matching alone does not establish semantic entailment", () => {
  expect(who.excerpt).not.toContain("paid search");
  expect(validate(research([bad]))).toEqual([]); // Independent grounding must reject this test claim.
});
async function service(facts: (typeof good)[], review: CompanyGroundingReview) {
  const rows = new Map<string, CompanyRun>();
  const store: CompanyStore = {
    get: vi.fn(async (_a, id) => rows.get(id) ?? null),
    list: vi.fn(async () => [...rows.values()]),
    create: vi.fn(async (_a, r) => {
      rows.set(r.id, structuredClone(r));
      return true;
    }),
    finish: vi.fn(async (_a, r) => {
      rows.set(r.id, structuredClone(r));
    }),
  };
  const model: WorkforceModel = {
    discover: vi.fn(async () => sources.map((s) => s.url)),
    structured: vi.fn(async (stage, schema) =>
      schema.parse(stage === "ACCOUNT_RESEARCH" ? { facts, gaps: [], assumptions: [] } : review),
    ) as WorkforceModel["structured"],
  };
  const result = await runCompanyResearch(
    fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID,
    input,
    "offline-saved-nike-evidence-test",
    {
      store,
      budgetStore: new MemoryDailyStore(),
      model: () => model,
      now: () => at,
      reader: async (url) => {
        const source = sources.find((s) => s.url === url);
        if (!source) throw Error("SOURCE_REDIRECT");
        return { url, title: source.title, text: source.excerpt };
      },
    },
  );
  return { result, model, store };
}
it("passes the existing full service gate for saved real content with an explicitly mocked accepting reviewer", async () => {
  const { result, model } = await service([good], {
    identityMatches: true,
    supportedFactIds: [good.id],
    rejectedFactIds: [],
    concerns: [],
  });
  expect(result.status).toBe("REVIEW_REQUIRED");
  expect(result.research.facts).toEqual([good]);
  expect(result.approved).toBe(false);
  expect(result.canSend).toBe(false);
  expect(result.canEnroll).toBe(false);
  expect(model.structured).toHaveBeenCalledTimes(2);
});
it("independent rejection withholds an unsupported claim even when its quotation is verbatim", async () => {
  const { result } = await service([bad], {
    identityMatches: true,
    supportedFactIds: [],
    rejectedFactIds: [bad.id],
    concerns: [
      {
        severity: "BLOCKING",
        scope: "FACT",
        code: "CLAIM_NOT_ENTAILED",
        reason: "Unsupported paid-search statement (offline fixture).",
        factIds: [bad.id],
        sourceIds: [who.id],
      },
    ],
  });
  expect(result.status).toBe("INCOMPLETE");
  expect(result.research.facts).toEqual([]);
});
it("reproduces all-or-nothing clearing when only one candidate is rejected", async () => {
  const { result } = await service([good, bad], {
    identityMatches: true,
    supportedFactIds: [good.id],
    rejectedFactIds: [bad.id],
    concerns: [
      {
        severity: "BLOCKING",
        scope: "FACT",
        code: "CLAIM_NOT_ENTAILED",
        reason: "One unsupported offline test claim.",
        factIds: [bad.id],
        sourceIds: [who.id],
      },
    ],
  });
  expect(result.status).toBe("INCOMPLETE");
  expect(result.research.facts).toEqual([]);
  expect(JSON.stringify(result.research.facts)).not.toContain(bad.statement);
  expect(result.groundingAudit?.candidates.find((c) => c.factId === bad.id)).toMatchObject({
    statement: bad.statement,
    reviewerDecision: "REJECTED",
    verified: false,
  });
  expect(
    result.groundingAudit?.candidates.find((c) => c.factId === good.id)?.reviewerDecision,
  ).toBe("SUPPORTED");
});
it.each(["coverage", "identity", "concern"])(
  "produces the same generic saved issue for %s review failure",
  async (reason) => {
    const { result } = await service([good], {
      identityMatches: reason !== "identity",
      supportedFactIds: reason === "coverage" ? [] : [good.id],
      rejectedFactIds: [],
      concerns:
        reason === "concern"
          ? [
              {
                severity: "BLOCKING",
                scope: "GLOBAL",
                code: "OTHER_REVIEWER_CONCERN",
                reason: "Offline review concern",
                factIds: [],
                sourceIds: [],
              },
            ]
          : [],
    });
    expect(result.issues).toEqual([
      "Independent grounding/identity review failed; extracted facts were withheld",
    ]);
    expect(result.research.facts).toEqual([]);
  },
);
