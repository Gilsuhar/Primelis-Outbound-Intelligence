// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "./fixtures/nike-grounding-candidates-2026-10-19.json";
import {
  companyGroundingReviewSchema,
  type CompanyGroundingReview,
} from "@/features/agent-workforce/company-research/grounding-review";
import {
  groundingReviewSchema,
  groundedFactSchema,
  researchSchema,
} from "@/features/agent-workforce/gate-a-contracts";
import { groundingAuditSchema } from "@/features/agent-workforce/company-research/grounding-audit";
import type { CompanyRun } from "@/features/agent-workforce/company-research/contracts";
import { buildGroundingAudit } from "./grounding-audit";
import { validateCompanyGroundingWithAi } from "./grounding-review";
import { validateGroundingWithAi } from "../creative-agents";
import { validateResearch } from "../evidence-validation";
import { structuredSchema, WorkforceError, type WorkforceModel } from "../openai";
import { runCompanyResearch } from "./service";
import { judgeCompanyResearch } from "./judgement";
import type { CompanyStore } from "./store";
import { MemoryDailyStore } from "../daily/test-store";
import { fictionalCompanyEnv } from "./test-fixtures";

// Statements, quotes and sources are historical public evidence. Categories, confidence,
// limitations and ALL new reviewer responses below are simulated test metadata, not recovered decisions.
const facts = fixture.candidates.map((c, i) =>
  groundedFactSchema.parse({
    id: c.factId,
    statement: c.statement,
    subject: "ACCOUNT",
    category: ["BUSINESS_MODEL", "PRODUCTS", "MARKETS", "EMPLOYEES", "REVENUE", "WEBSITE"][i],
    confidence: "HIGH",
    limitations: ["Offline test metadata; historical candidate remains unverified."],
    sourceIds: c.sourceIds,
    quotes: c.quotes,
  }),
);
const research = () =>
  researchSchema.parse({
    accountDomain: "nike.com",
    prospectId: "offline-contract",
    researchedAt: fixture.at,
    sources: fixture.sources,
    facts,
    gaps: [],
    assumptions: [],
  });
const review = (): CompanyGroundingReview => ({
  identityMatches: true,
  supportedFactIds: facts.map((f) => f.id),
  rejectedFactIds: [],
  concerns: [],
});
const note = (): CompanyGroundingReview["concerns"][number] => ({
  severity: "NONBLOCKING",
  code: "CONTEXT_LIMITATION",
  scope: "SOURCE",
  reason: "Company self-description does not independently establish buying intent.",
  factIds: [],
  sourceIds: [fixture.sources[0].id],
});
const block = (): CompanyGroundingReview["concerns"][number] => ({
  severity: "BLOCKING",
  code: "OTHER_REVIEWER_CONCERN",
  scope: "GLOBAL",
  reason: "Simulated cross-source integrity discrepancy prevents accepting this evidence set.",
  factIds: [],
  sourceIds: fixture.sources.map((s) => s.id),
});
const audit = (r: CompanyGroundingReview) => buildGroundingAudit(research(), r);

beforeEach(() => {
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Network forbidden in offline regression");
    }),
  );
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("verifies all six saved candidates, ten exact quotes and three unchanged public source hashes", () => {
  expect(facts).toHaveLength(6);
  expect(facts.flatMap((f) => f.quotes)).toHaveLength(10);
  for (const s of fixture.sources)
    expect(s.id).toBe(
      "web:" +
        createHash("sha256")
          .update(s.url + s.excerpt)
          .digest("hex")
          .slice(0, 20),
    );
  expect(
    validateResearch(
      { id: "offline-contract", intake: fixture.input, research: research() },
      new Date(fixture.at),
      { company: true, prospect: false },
    ),
  ).toEqual([]);
  expect(fixture.historicalReview).toMatchObject({
    supportedCount: 6,
    rejectedCount: 0,
    concernCount: 2,
    reasonCodes: ["REVIEWER_CONCERNS"],
  });
});

it("distinguishes explicit nonblocking context from genuine global blockers without inferring historical intent", () => {
  const r = review();
  r.concerns = [note()];
  expect(audit(r).status).toBe("ACCEPTED");
  r.concerns.push(block());
  const a = audit(r);
  expect(a.status).toBe("REJECTED");
  expect(a.reasonCodes).toEqual(["REVIEWER_CONCERNS"]);
  expect(a.reviewer?.supportedCount).toBe(6);
  expect(a.reviewer?.concerns).toEqual([
    expect.objectContaining(noteWithoutFactIds(note())),
    expect.objectContaining(noteWithoutFactIds(block())),
  ]);
});
function noteWithoutFactIds(c: ReturnType<typeof note>) {
  return {
    severity: c.severity,
    code: c.code,
    scope: c.scope,
    reason: c.reason,
    sourceIds: c.sourceIds,
    candidateIds: [],
    attributionOmitted: false,
  };
}

it.each([
  "CLAIM_NOT_ENTAILED",
  "QUOTE_OR_SOURCE_SUPPORT",
  "IDENTITY",
  "FRESHNESS",
  "NUMERIC_OR_PERIOD_CONTEXT",
  "SOURCE_INJECTION",
  "OTHER_REVIEWER_CONCERN",
] as const)("does not allow a %s defect to be labeled nonblocking", (code) => {
  const r = review();
  r.concerns = [{ ...note(), code }];
  expect(audit(r).reasonCodes).toContain("INCONSISTENT_REVIEW");
});

it.each([
  [
    "missing fact decision",
    (r: CompanyGroundingReview) => {
      r.supportedFactIds.pop();
    },
  ],
  [
    "duplicate supported ID",
    (r: CompanyGroundingReview) => {
      r.supportedFactIds[1] = r.supportedFactIds[0];
    },
  ],
  [
    "supported and rejected",
    (r: CompanyGroundingReview) => {
      r.rejectedFactIds = [facts[0].id];
    },
  ],
  [
    "unknown rejected ID",
    (r: CompanyGroundingReview) => {
      r.rejectedFactIds = ["unknown-private-id"];
    },
  ],
  [
    "unknown concern fact",
    (r: CompanyGroundingReview) => {
      r.concerns = [{ ...note(), factIds: ["unknown-private-id"] }];
    },
  ],
  [
    "unknown concern source",
    (r: CompanyGroundingReview) => {
      r.concerns = [{ ...note(), sourceIds: ["unknown-private-source"] }];
    },
  ],
  [
    "missing fact attribution",
    (r: CompanyGroundingReview) => {
      r.concerns = [{ ...note(), scope: "FACT" }];
    },
  ],
  [
    "missing source attribution",
    (r: CompanyGroundingReview) => {
      r.concerns = [{ ...note(), sourceIds: [] }];
    },
  ],
  [
    "unrelated source attribution",
    (r: CompanyGroundingReview) => {
      r.concerns = [
        { ...note(), scope: "FACT", factIds: [facts[0].id], sourceIds: [fixture.sources[1].id] },
      ];
    },
  ],
  [
    "blocking fact also supported",
    (r: CompanyGroundingReview) => {
      r.concerns = [
        { ...block(), scope: "FACT", factIds: [facts[0].id], sourceIds: facts[0].sourceIds },
      ];
    },
  ],
  [
    "identity affirmed with identity defect",
    (r: CompanyGroundingReview) => {
      r.concerns = [{ ...block(), code: "IDENTITY" }];
    },
  ],
  [
    "identity denied without explanation",
    (r: CompanyGroundingReview) => {
      r.identityMatches = false;
    },
  ],
  [
    "rejection without blocking explanation",
    (r: CompanyGroundingReview) => {
      r.rejectedFactIds = [r.supportedFactIds.pop()!];
    },
  ],
  [
    "blocking contextual limitation",
    (r: CompanyGroundingReview) => {
      r.concerns = [{ ...note(), severity: "BLOCKING" }];
    },
  ],
] as const)("fails closed for %s", (_name, mutate) => {
  const r = review();
  mutate(r);
  expect(audit(r).status).toBe("REJECTED");
  expect(audit(r).reasonCodes).toContain("INCONSISTENT_REVIEW");
  expect(JSON.stringify(audit(r))).not.toContain("unknown-private");
});

it("retains known claim/source attribution and a concise rejection explanation", () => {
  const r = review();
  r.supportedFactIds.shift();
  r.rejectedFactIds = [facts[0].id];
  r.concerns = [
    {
      ...block(),
      scope: "FACT",
      code: "CLAIM_NOT_ENTAILED",
      factIds: [facts[0].id],
      sourceIds: facts[0].sourceIds,
    },
  ];
  const a = audit(r);
  expect(a.reasonCodes).not.toContain("INCONSISTENT_REVIEW");
  expect(a.reviewer?.concerns?.[0]).toMatchObject({
    candidateIds: ["candidate-1"],
    sourceIds: facts[0].sourceIds,
    reason: block().reason,
  });
  expect(a.candidates[0]).toMatchObject({ reviewerDecision: "REJECTED", verified: false });
});

it.each([
  "Contact private@example.invalid",
  "Bearer private-value",
  "api_key=private-value",
  "sk-private-value",
  "postgresql://private-value",
  "https://public.example/?token=private-value",
  "Cookie private-value",
  "Internal reasoning private-value",
])("omits sensitive explanation: %s", (reason) => {
  const r = review();
  r.concerns = [{ ...block(), reason }];
  const a = audit(r);
  expect(a.reviewer?.concerns?.[0]).toMatchObject({
    reasonOmitted: "SENSITIVE_CONTENT",
    severity: "BLOCKING",
  });
  expect(a.reviewer?.concerns?.[0].reason).toBeUndefined();
});

it("bounds explanation count/length and the combined audit text", () => {
  expect(
    companyGroundingReviewSchema.safeParse({
      ...review(),
      concerns: [{ ...note(), reason: "x".repeat(301) }],
    }).success,
  ).toBe(false);
  expect(
    companyGroundingReviewSchema.safeParse({
      ...review(),
      concerns: Array.from({ length: 21 }, note),
    }).success,
  ).toBe(false);
  const r = review();
  r.concerns = Array.from({ length: 20 }, () => ({
    ...block(),
    reason: "Public context. ".repeat(20),
  }));
  const a = audit(r);
  const text = [
    ...(a.reviewer?.concerns ?? []).map((c) => c.reason ?? ""),
    ...a.candidates.flatMap((c) => [c.statement ?? "", ...c.quotes.map((q) => q.text ?? "")]),
  ].join("");
  expect(text.length).toBeLessThanOrEqual(12000);
  expect(groundingAuditSchema.parse(a)).toEqual(a);
});

it.each([
  { ...review(), concerns: ["Legacy ambiguous prose"] },
  { ...review(), concerns: [{ ...note(), severity: undefined }] },
  { ...review(), concerns: [{ ...note(), reason: " " }] },
  { ...review(), concerns: [{ ...note(), sourceIds: undefined }] },
  { ...review(), supportedFactIds: undefined },
  { ...review(), identityMatches: undefined },
  { ...review(), concerns: undefined },
  { ...review(), rawReasoning: "Not requested" },
])("treats malformed or missing contract fields as MALFORMED", (value) => {
  expect(companyGroundingReviewSchema.safeParse(value).success).toBe(false);
  expect(buildGroundingAudit(research(), value as never).status).toBe("MALFORMED");
});

it("serializes the explicit company schema with required concern fields and preserves the prospect contract", async () => {
  const json = structuredSchema(companyGroundingReviewSchema);
  expect(JSON.stringify(json)).toContain('"NONBLOCKING"');
  expect(JSON.stringify(json)).toContain('"additionalProperties":false');
  const model = {
    structured: vi.fn(async (_stage, schema) => schema.parse(review())),
    discover: vi.fn(),
  } as unknown as WorkforceModel;
  const run = { intake: fixture.input, research: research(), usage: [] };
  await validateCompanyGroundingWithAi(run, model);
  expect(model.structured).toHaveBeenLastCalledWith(
    "EVIDENCE_VALIDATION",
    companyGroundingReviewSchema,
    expect.stringContaining("Never downgrade"),
    expect.anything(),
    [],
  );
  await validateGroundingWithAi(run, model);
  expect(model.structured).toHaveBeenLastCalledWith(
    "EVIDENCE_VALIDATION",
    groundingReviewSchema,
    expect.not.stringContaining("CONTEXT_LIMITATION"),
    expect.anything(),
    [],
  );
  expect(fetch).not.toHaveBeenCalled();
});

async function service(response: unknown, selectedFacts = facts, unavailable = false) {
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
    discover: vi.fn(async () => fixture.sources.map((s) => s.url)),
    structured: vi.fn(async (stage, schema) => {
      if (stage === "ACCOUNT_RESEARCH")
        return schema.parse({ facts: selectedFacts, gaps: [], assumptions: [] });
      if (unavailable) throw new WorkforceError("MODEL_FAILED", "private upstream details");
      return response;
    }) as WorkforceModel["structured"],
  };
  const result = await runCompanyResearch(
    fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID,
    fixture.input,
    "offline-nike-contract-test",
    {
      store,
      budgetStore: new MemoryDailyStore(),
      model: () => model,
      now: () => new Date(fixture.at),
      reader: async (url) => {
        const s = fixture.sources.find((s) => s.url === url);
        if (!s) throw Error("SOURCE_REDIRECT");
        return { url, title: s.title, text: s.excerpt };
      },
    },
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(result).toMatchObject({ approved: false, canSend: false, canEnroll: false });
  return result;
}

it("runs the six saved candidates through the service with explicitly simulated nonblocking review", async () => {
  const r = review();
  r.concerns = [note()];
  const result = await service(r);
  expect(result.status).toBe("REVIEW_REQUIRED");
  expect(result.research.facts).toHaveLength(6);
  expect(result.groundingAudit?.reviewer?.concerns?.[0].severity).toBe("NONBLOCKING");
  // The separate Judgement numeric gate is not weakened to make this six-claim simulation pass.
  expect(
    judgeCompanyResearch(result, new Date(fixture.at), "OFFLINE_SIMULATION").hardFailures,
  ).toContain("UNSUPPORTED_METRIC");
});

it("demonstrates one narrow source-backed claim plus independent Judgement with simulated review only", async () => {
  const result = await service(
    { ...review(), supportedFactIds: [facts[0].id], concerns: [note()] },
    [facts[0]],
  );
  const j = judgeCompanyResearch(result, new Date(fixture.at), "OFFLINE_SIMULATION");
  expect(j.outcome).toBe("COMPANY_BRIEF_ONLY");
  expect(j.verifiedFacts).toHaveLength(1);
  expect(j.mode).toBe("OFFLINE_SIMULATION");
  expect(j).toMatchObject({ approved: false, canSend: false, canEnroll: false });
  const inconsistentAudit = structuredClone(result);
  inconsistentAudit.groundingAudit!.reviewer!.concernCount = 0;
  expect(
    judgeCompanyResearch(inconsistentAudit, new Date(fixture.at), "OFFLINE_SIMULATION").outcome,
  ).toBe("HOLD");
  // Historical summaries without explicit severities never become nonblocking retroactively.
  delete result.groundingAudit!.reviewer!.concerns;
  expect(judgeCompanyResearch(result, new Date(fixture.at), "OFFLINE_SIMULATION").outcome).toBe(
    "HOLD",
  );
});

it.each(["global", "identity", "contradictory", "missing", "malformed", "unavailable"])(
  "service fails closed for %s review",
  async (kind) => {
    const r = review();
    if (kind === "global") r.concerns = [block()];
    if (kind === "identity") {
      r.identityMatches = false;
      r.concerns = [{ ...block(), code: "IDENTITY" }];
    }
    if (kind === "contradictory") r.rejectedFactIds = [facts[0].id];
    if (kind === "missing") r.supportedFactIds.pop();
    const result = await service(
      kind === "malformed" ? { ...r, concerns: ["Unstructured concern"] } : r,
      facts,
      kind === "unavailable",
    );
    expect(result.status).toBe(
      ["malformed", "unavailable"].includes(kind) ? "FAILED" : "INCOMPLETE",
    );
    expect(result.research.facts).toEqual([]);
    expect(judgeCompanyResearch(result, new Date(fixture.at), "OFFLINE_SIMULATION").outcome).toBe(
      "HOLD",
    );
    expect(JSON.stringify(result)).not.toContain("private upstream");
  },
);
