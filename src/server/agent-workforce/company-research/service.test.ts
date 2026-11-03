// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runCompanyResearch } from "./service";
import { fictionalCompanyEnv } from "./test-fixtures";
import type { CompanyRun } from "@/features/agent-workforce/company-research/contracts";
import type { WorkforceModel } from "../openai";
import type { CompanyStore } from "./store";
import { MemoryDailyStore } from "../daily/test-store";
import { WorkforceError } from "../openai";
const actor = fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID;
const input = { companyName: "Fictional Acme", companyDomain: "acme.example" };
const quote = "Fictional Acme sells analytics software to retail companies.";
const fact = {
  id: "account:products",
  subject: "ACCOUNT",
  category: "PRODUCTS",
  statement: quote,
  sourceIds: [] as string[],
  confidence: "HIGH",
  limitations: [],
  quotes: [] as { sourceId: string; text: string }[],
};

function fixtures(
  options: {
    badQuote?: boolean;
    badReview?: boolean;
    prospect?: boolean;
    noSources?: boolean;
    failure?: boolean;
    reviewFailure?: "malformed" | "unavailable";
  } = {},
) {
  const rows = new Map<string, CompanyRun>();
  const store: CompanyStore = {
    get: vi.fn(async (_actor, id) => structuredClone(rows.get(id) ?? null)),
    list: vi.fn(async () => [...rows.values()]),
    create: vi.fn(async (_actor, run) => {
      if (rows.has(run.id)) return false;
      rows.set(run.id, structuredClone(run));
      return true;
    }),
    finish: vi.fn(async (_actor, run) => {
      rows.set(run.id, structuredClone(run));
    }),
  };
  const model: WorkforceModel = {
    discover: vi.fn(async () => {
      if (options.failure) throw new Error("fictional-secret-error-must-not-leak");
      return ["https://acme.example/"];
    }),
    structured: vi.fn(
      async <T>(stage: string, schema: z.ZodType<T>, _instruction: string, context: unknown) => {
        if (stage === "ACCOUNT_RESEARCH") {
          const source = (context as { sources: { id: string }[] }).sources[0];
          return schema.parse({
            facts: [
              {
                ...fact,
                ...(options.prospect ? { subject: "PROSPECT" } : {}),
                sourceIds: [source.id],
                quotes: [
                  { sourceId: source.id, text: options.badQuote ? "invented quote" : quote },
                ],
              },
            ],
            gaps: ["Revenue unavailable"],
            assumptions: ["Growth is an unverified hypothesis"],
          });
        }
        if (options.reviewFailure === "malformed")
          return schema.parse({ supportedFactIds: "private-secret-malformed" });
        if (options.reviewFailure === "unavailable")
          throw new WorkforceError("MODEL_FAILED", "private-secret-upstream-body");
        return schema.parse({
          identityMatches: !options.badReview,
          supportedFactIds: [fact.id],
          rejectedFactIds: [],
          concerns: [],
        });
      },
    ) as WorkforceModel["structured"],
  };
  const deps = {
    store,
    budgetStore: new MemoryDailyStore(),
    model: vi.fn(() => model),
    reader: vi.fn(async (url: string) => {
      if (options.noSources) throw new Error("unavailable");
      return { url, title: "Fictional Acme", text: quote.repeat(3) };
    }),
    now: () => new Date("2026-10-18T09:00:00Z"),
  };
  return { deps, model, rows };
}
beforeEach(() => {
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
describe("company-only research", () => {
  it("needs two fields, retrieves and validates company facts without contact gates or side effects", async () => {
    const { deps, model, rows } = fixtures();
    const result = await runCompanyResearch(actor, input, "fictional-request-key-001", deps);
    expect(result).toMatchObject({
      status: "REVIEW_REQUIRED",
      input,
      approved: false,
      canSend: false,
      canEnroll: false,
    });
    expect(result.research.facts).toHaveLength(1);
    expect(result.research.gaps).toContain("Revenue unavailable");
    expect(result.research.assumptions).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("prospectName");
    expect(model.structured).toHaveBeenCalledTimes(2);
    expect([...rows.values()][0]).toEqual(result);
  });
  it.each([{ badQuote: true }, { badReview: true }, { prospect: true }, { noSources: true }])(
    "withholds unvalidated evidence: %j",
    async (options) => {
      const { deps } = fixtures(options);
      const result = await runCompanyResearch(actor, input, "fictional-request-key-001", deps);
      expect(result.status).toBe("INCOMPLETE");
      expect(result.research.facts).toEqual([]);
      expect(result.issues.length).toBeGreaterThan(0);
    },
  );
  it("persists sanitized failures without a fallback", async () => {
    const { deps } = fixtures({ failure: true });
    const result = await runCompanyResearch(actor, input, "fictional-request-key-001", deps);
    expect(result.status).toBe("FAILED");
    expect(JSON.stringify(result)).not.toContain("fictional-secret-error");
    expect(deps.store.finish).toHaveBeenCalledOnce();
  });
  it("replays a request without more provider work and rejects changed inputs", async () => {
    const { deps, model } = fixtures();
    const first = await runCompanyResearch(actor, input, "fictional-request-key-001", deps);
    const replay = await runCompanyResearch(actor, input, "fictional-request-key-001", deps);
    expect(replay).toEqual(first);
    expect(model.discover).toHaveBeenCalledOnce();
    await expect(
      runCompanyResearch(
        actor,
        { ...input, companyName: "Different" },
        "fictional-request-key-001",
        deps,
      ),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("rejects concurrent duplicate requests without duplicated provider work", async () => {
    const { deps, model } = fixtures();
    const results = await Promise.all([
      runCompanyResearch(actor, input, "fictional-request-key-001", deps),
      runCompanyResearch(actor, input, "fictional-request-key-001", deps),
    ]);
    expect(results.some((run) => run.status === "REVIEW_REQUIRED")).toBe(true);
    expect(model.discover).toHaveBeenCalledOnce();
  });
  it("does no persistence, retrieval or provider work without opt-in", async () => {
    const { deps } = fixtures();
    vi.stubEnv("LOCAL_COMPANY_AI_ENABLED", "");
    await expect(
      runCompanyResearch(actor, input, "fictional-request-key-001", deps),
    ).rejects.toThrow("COMPANY_AI_DISABLED");
    expect(deps.store.create).not.toHaveBeenCalled();
    expect(deps.model).not.toHaveBeenCalled();
    expect(deps.reader).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, prospectName: "Injected" },
    { ...input, approved: true },
    { ...input, companyDomain: "localhost" },
    { ...input, companyDomain: "acme.local" },
    { ...input, companyDomain: "acme.internal" },
    { companyName: "Only name" },
  ])("rejects invalid/company-external fields: %j", async (body) => {
    const { deps } = fixtures();
    await expect(
      runCompanyResearch(actor, body, "fictional-request-key-001", deps),
    ).rejects.toThrow();
    expect(deps.model).not.toHaveBeenCalled();
  });
});
it("Company Research opts into fallback after three failed public candidates", async () => {
  const { deps, model } = fixtures();
  vi.mocked(model.discover).mockResolvedValue([
    "https://acme.example/first",
    "https://acme.example/second",
    "https://acme.example/good",
  ]);
  deps.reader.mockImplementation(async (url) => {
    if (!url.endsWith("/good")) throw new Error("SOURCE_REDIRECT");
    return { url, title: "Fictional Acme", text: quote.repeat(3) };
  });
  const result = await runCompanyResearch(actor, input, "fictional-fallback-request", deps);
  expect(result.status).toBe("REVIEW_REQUIRED");
  expect(result.research.sources[0].url).toBe("https://acme.example/good");
  expect(deps.reader).toHaveBeenCalledTimes(4);
  expect(model.discover).toHaveBeenCalledOnce();
});

it.each(["malformed", "unavailable"] as const)(
  "audits %s reviewer failures without changing FAILED status or exposing raw errors",
  async (reviewFailure) => {
    const { deps, model } = fixtures({ reviewFailure });
    const result = await runCompanyResearch(actor, input, "fictional-audit-error-request", deps);
    expect(result.status).toBe("FAILED");
    expect(result.research.facts).toEqual([]);
    expect(result.groundingAudit?.status).toBe(
      reviewFailure === "malformed" ? "MALFORMED" : "UNAVAILABLE",
    );
    expect(result.groundingAudit?.candidates[0].quotes[0].text).toBe(quote);
    expect(JSON.stringify(result)).not.toContain("private-secret");
    expect(model.structured).toHaveBeenCalledTimes(2);
    expect(deps.store.finish).toHaveBeenCalledOnce();
  },
);
it("records an audit for both accepted and rejected reviews without promoting rejected candidates", async () => {
  for (const badReview of [false, true]) {
    const { deps } = fixtures({ badReview });
    const r = await runCompanyResearch(actor, input, "fictional-audit-review-request", deps);
    expect(r.groundingAudit?.status).toBe(badReview ? "REJECTED" : "ACCEPTED");
    expect(r.groundingAudit?.identityMatches).toBe(!badReview);
    expect(r.research.facts).toHaveLength(badReview ? 0 : 1);
    expect(r.groundingAudit?.candidates.every((c) => c.verified === false)).toBe(true);
  }
});
