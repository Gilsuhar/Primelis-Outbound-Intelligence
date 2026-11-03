// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { syntheticDocument } from "@/test/synthetic-company-documents";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  executeAutomaticCompany,
  internalCompanyDraftingClearance,
  verifyReusableCompanyResearch,
} from "./automatic-execution";
import { fictionalCompanyEnv } from "./test-fixtures";
import { MemoryDailyStore } from "../daily/test-store";
import { MockWorkforceModel } from "@/test/workforce-fixtures";
import type { WorkforceModel } from "../openai";
import {
  internalSalesEditorialConcerns,
  internalSalesReviewStandard,
  internalSalesWritingStandard,
} from "../commercial-quality";
import {
  automaticCompanySchema,
  internalDocumentSchema,
} from "@/features/agent-workforce/company-research/internal-review";
import { prepareChoiceHotelsContinuation } from "./choice-hotels-continuation";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T20:00:00.000Z"));
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
  vi.stubEnv("LOCAL_INTERNAL_SALES_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const actor = fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID;
const image = { mime: "image/png" as const, base64: "AAAA", sha256: "a".repeat(64) };
const unknown = { value: null, basis: "UNKNOWN" };
function fixture(
  failure = "",
  suppliedEmails?: { subject: string; body: string }[],
  profileSupport = false,
) {
  const mock = new MockWorkforceModel();
  const stages: string[] = [];
  const prompts: { stage: string; instruction: string; context: unknown }[] = [];
  const checkpoint = vi.fn();
  const model: WorkforceModel = {
    discover: async () => {
      stages.push("DISCOVERY");
      return ["https://acme.example/"];
    },
    structured: async (stage, schema, instruction, raw, usage) => {
      stages.push(stage);
      prompts.push({ stage, instruction, context: raw });
      if (stage === failure) throw new Error("secret-provider-error");
      if (stage === "COMPANY_RESOLUTION")
        return schema.parse({
          companyName: "Fictional Acme",
          domain: "acme.example",
          unambiguous: failure !== "AMBIGUOUS",
        });
      const context = raw as { task?: unknown };
      if (stage === "SEQUENCE")
        return schema.parse({
          approach: "Explicitly fictional offline product-led inquiry.",
          limitations: ["No auction or recipient evidence."],
          emails:
            suppliedEmails ??
            Array.from({ length: failure === "MALFORMED_WRITING" ? 3 : 4 }, (_, i) => ({
              subject: `Offline email ${i + 1}`,
              body:
                failure === "CLEAN_PASS"
                  ? `Fictional offline draft ${i + 1}. Is this a useful conversation?`
                  : `Fictional offline draft ${i + 1}. Signal guarantees a 90% saving.`,
            })),
        });
      const output = await mock.structured(stage, z.any(), instruction, context.task ?? raw, usage);
      if (stage === "PROSPECT_INTELLIGENCE" && profileSupport) {
        const quote = "Alice De Benetti is the Global One Search Lead at acme.example.";
        Object.assign(output, {
          facts: [
            {
              id: "prospect:position",
              statement: quote,
              subject: "PROSPECT",
              category: "POSITION",
              confidence: "HIGH",
              sourceIds: [(raw as { sources: { id: string }[] }).sources[0].id],
              quotes: [
                { sourceId: (raw as { sources: { id: string }[] }).sources[0].id, text: quote },
              ],
              limitations: [],
            },
            {
              id: "prospect:unrelated",
              statement: "Bob Generic is a marketing director at acme.example.",
              subject: "PROSPECT",
              category: "POSITION",
              confidence: "HIGH",
              sourceIds: [(raw as { sources: { id: string }[] }).sources[0].id],
              quotes: [
                {
                  sourceId: (raw as { sources: { id: string }[] }).sources[0].id,
                  text: "Bob Generic is a marketing director at acme.example.",
                },
              ],
              limitations: [],
            },
          ],
          gaps: [],
          assumptions: [],
        });
      }
      if (stage === "ACCOUNT_RESEARCH" && failure === "NO_CONTEXT") output.facts = [];
      if (stage === "EVIDENCE_VALIDATION" && failure === "GROUNDING") {
        output.identityMatches = false;
      }
      if (stage === "EVIDENCE_VALIDATION" && failure === "UNSUPPORTED_PROFILE") {
        output.supportedFactIds = ["account:business"];
        output.rejectedFactIds = ["prospect:position"];
        const profileFact = (
          raw as { research: { facts: { id: string; sourceIds: string[] }[] } }
        ).research.facts.find((fact) => fact.id === "prospect:position")!;
        output.concerns = [
          {
            severity: "BLOCKING",
            scope: "FACT",
            code: "CLAIM_NOT_ENTAILED",
            reason: "Retrieved public evidence does not support the supplied profile claim.",
            factIds: ["prospect:position"],
            sourceIds: profileFact.sourceIds,
          },
        ];
      }
      if (stage === "ACCOUNT_RESEARCH" && failure === "QUOTE")
        output.facts[0].quotes[0].text = "Invented source text";
      if (stage === "ACCOUNT_RESEARCH" && failure === "PARTIAL_QUOTE")
        output.facts[0].quotes.push({
          sourceId: output.facts[0].sourceIds[0],
          text: "Invented extra quotation",
        });
      if (stage === "ACCOUNT_RESEARCH" && failure === "PROSPECT")
        output.facts[0].subject = "PROSPECT";
      if (stage === "ACCOUNT_RESEARCH" && ["MIXED", "PARTIAL_REVIEW"].includes(failure)) {
        const rejected = structuredClone(output.facts[0]);
        rejected.id = "account:rejected";
        rejected.statement = "Unsupported competitor activity";
        if (failure === "MIXED") rejected.quotes[0].text = "Invented competitor quote";
        output.facts.push(rejected);
      }
      if (stage === "EVIDENCE_VALIDATION" && failure === "PARTIAL_REVIEW") {
        output.supportedFactIds = ["account:business"];
        output.rejectedFactIds = ["account:rejected"];
        output.concerns = [
          {
            severity: "BLOCKING",
            scope: "FACT",
            code: "CLAIM_NOT_ENTAILED",
            reason: "The source does not establish competitor activity.",
            factIds: ["account:rejected"],
            sourceIds: (raw as { research: { sources: { id: string }[] } }).research.sources.map(
              (s) => s.id,
            ),
          },
        ];
      }
      if (stage === "EVIDENCE_VALIDATION" && failure === "CHOICE_PARTIAL_REVIEW") {
        output.supportedFactIds = ["account:5", "account:6"];
        output.rejectedFactIds = ["account:4"];
        const africa = (
          raw as { research: { facts: { id: string; sourceIds: string[] }[] } }
        ).research.facts.find((fact) => fact.id === "account:4")!;
        output.concerns = [
          {
            severity: "BLOCKING",
            scope: "FACT",
            code: "CLAIM_NOT_ENTAILED",
            reason:
              "Surviving exact quotations do not establish the Africa detail or the full breadth of this claim.",
            factIds: ["account:4"],
            sourceIds: africa.sourceIds,
          },
        ];
      }
      if (stage === "EVIDENCE_VALIDATION" && failure === "GLOBAL_CONCERN")
        output.concerns = [
          {
            severity: "BLOCKING",
            scope: "GLOBAL",
            code: "OTHER_REVIEWER_CONCERN",
            reason: "Cross-cutting source integrity defect.",
            factIds: [],
            sourceIds: [],
          },
        ];
      if (stage === "EVIDENCE_VALIDATION" && failure === "MISSING_DECISION")
        output.supportedFactIds = [];
      if (stage === "EVIDENCE_VALIDATION" && failure === "SOURCE_CONCERN")
        output.concerns = [
          {
            severity: "BLOCKING",
            scope: "SOURCE",
            code: "SOURCE_INJECTION",
            reason: "The source cannot be trusted.",
            factIds: [],
            sourceIds: (raw as { research: { sources: { id: string }[] } }).research.sources.map(
              (s) => s.id,
            ),
          },
        ];
      if (stage === "EVIDENCE_VALIDATION" && failure === "CONFLICT_DECISION")
        output.rejectedFactIds = [...output.supportedFactIds];
      if (stage === "QUALITY_REVIEW") {
        delete output.oiq;
        output.verdict = failure === "CONTRADICTORY_PASS" ? "PASS" : "HOLD";
        output.checks.approvedClaimsOnly = false;
        output.unsupportedAssertions = [
          "Email 1: 'guarantees a 90% saving' is unsupported by product knowledge.",
        ];
        if (failure === "MISSING_REVIEW_STEP") output.checkedSteps = [1, 2, 3, 3];
        if (["CLEAN_PASS", "CHOICE_PARTIAL_REVIEW"].includes(failure)) {
          output.verdict = "PASS";
          output.checks = Object.fromEntries(Object.keys(output.checks).map((key) => [key, true]));
          output.unsupportedAssertions = [];
          output.concerns = [];
        }
      }
      return schema.parse(output);
    },
    imageStructured: async (stage, schema) => {
      stages.push(stage);
      return schema.parse(
        stage === "SCREENSHOT_REVIEW"
          ? {
              supported: failure !== "IMAGE",
              issues: failure === "IMAGE" ? ["Unsupported image claim"] : [],
            }
          : {
              sha256: image.sha256,
              query: unknown,
              market: unknown,
              device: unknown,
              capturedAt: unknown,
              missingContext: ["query", "market", "device", "capturedAt"],
              advertisers: [],
              brandPresence: "UNCLEAR",
              limitation: "Fictional image fixture only.",
            },
      );
    },
  };
  const reader = vi.fn(async (url: string) => ({
    url,
    title: "Fictional company",
    text:
      "acme.example sells outdoor equipment through its online store. " +
      "Fictional Acme sells outdoor equipment through its online store. " +
      "Alice De Benetti is the Global One Search Lead at acme.example. " +
      "Bob Generic is a marketing director at acme.example. This is an explicitly fictional offline source.",
  }));
  return {
    deps: { model: () => model, reader, budgetStore: new MemoryDailyStore(), checkpoint },
    stages,
    checkpoint,
    prompts,
  };
}

it("runs existing discovery, extraction, grounding, reasoning, four drafts and independent review unattended", async () => {
  const f = fixture();
  const result = await executeAutomaticCompany(actor, "acme.example", null, f.deps);
  expect(f.stages).toEqual([
    "DISCOVERY",
    "ACCOUNT_RESEARCH",
    "EVIDENCE_VALIDATION",
    "SEQUENCE",
    "QUALITY_REVIEW",
  ]);
  expect(result.status).toBe("REVIEW_REQUIRED");
  expect(result.directDrafts?.emails).toHaveLength(4);
  expect(result.directReview?.verdict).toBe("HOLD"); // completion is NOT approval
  expect(result.run?.sequence).toBeNull();
  expect(result.run?.eligibility.status).toBe("HOLD");
  expect(result.run?.intake.prospectName).toBe("Generic fictional recipient");
  expect(result.run?.knowledge.every((k) => k.restrictions.includes("INTERNAL_ONLY"))).toBe(true);
  expect([result.run?.approved, result.run?.canSend, result.run?.canEnroll]).toEqual([
    false,
    false,
    false,
  ]);
  expect(f.checkpoint).toHaveBeenCalled();
  expect(result.modelCalls).toBe(5);
  for (const stage of ["SEQUENCE", "QUALITY_REVIEW"]) {
    const prompt = f.prompts.find((p) => p.stage === stage)!;
    expect(prompt.context).toHaveProperty(
      "draftingClearance.internalDrafting",
      "INTERNAL_DRAFT_ALLOWED",
    );
    expect(prompt.context).toHaveProperty("draftingClearance.outboundReadiness", "HOLD");
    expect(prompt.instruction).toContain("those omissions alone are not grounds for NO_PITCH");
    expect(prompt.instruction).toContain("never imply that an audit, competitor presence, waste");
  }
  expect(f.prompts.find((p) => p.stage === "EVIDENCE_VALIDATION")?.context).not.toHaveProperty(
    "draftingClearance",
  );
});

it("persists redacted discovery and per-source retrieval outcomes in each research checkpoint", async () => {
  const f = fixture();
  const result = await executeAutomaticCompany(actor, "acme.example", null, {
    ...f.deps,
    reader: async () => {
      throw new Error("SOURCE_HTTP_403");
    },
  });
  expect(result.status).toBe("NO_PITCH");
  expect(result.sourceDiagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ stage: "DISCOVERY", outcome: "COMPLETED", sourceCount: 1 }),
      expect.objectContaining({ stage: "RETRIEVAL", outcome: "SOURCE_HTTP_403" }),
      expect.objectContaining({ stage: "EXTRACTION", outcome: "SKIPPED_NO_SOURCES" }),
    ]),
  );
  expect(JSON.stringify(result.sourceDiagnostics)).not.toContain("sensitive");
  expect(
    f.checkpoint.mock.calls.some(([checkpoint]) =>
      checkpoint.sourceDiagnostics?.some(
        (event: { stage: string; outcome: string }) =>
          event.stage === "RETRIEVAL" && event.outcome === "SOURCE_HTTP_403",
      ),
    ),
  ).toBe(true);
});

it("grounds profile-based internal personalization and never treats supplied profile text as proof", async () => {
  const f = fixture("CLEAN_PASS", undefined, true);
  const suppliedText =
    "Global One Search Lead. " + "User supplied Search and Ads responsibilities. ".repeat(3);
  const suppliedProfile = {
    name: "Alice De Benetti",
    source: "PASTED_TEXT" as const,
    value: suppliedText,
    sha256: createHash("sha256").update(suppliedText).digest("hex"),
    suppliedAt: "2026-10-21T08:00:00.000Z",
    status: "USER_SUPPLIED_UNVERIFIED" as const,
  };
  vi.stubEnv("GETLEADS_API_KEY", "fictional-test-only");
  const result = await executeAutomaticCompany(actor, "acme.example", null, {
    ...f.deps,
    profileDraft: {
      name: suppliedProfile.name,
      linkedInUrl: null,
      suppliedMaterialStatus: "USER_SUPPLIED_UNVERIFIED",
    },
    suppliedProfile,
  });
  expect(f.stages).toEqual([
    "DISCOVERY",
    "ACCOUNT_RESEARCH",
    "DISCOVERY",
    "PROSPECT_INTELLIGENCE",
    "EVIDENCE_VALIDATION",
    "SEQUENCE",
    "QUALITY_REVIEW",
  ]);
  expect(result.modelCalls).toBe(7);
  expect(result.internalProfile).toMatchObject({
    name: "Alice De Benetti",
    label: "INTERNAL ONLY · NOT OUTBOUND READY",
    verification: "VERIFIED",
    eligibility: "HOLD",
    outboundReady: false,
    verifiedFacts: [
      expect.objectContaining({ field: "currentRole", evidenceId: "prospect:position" }),
    ],
  });
  const writer = f.prompts.find((prompt) => prompt.stage === "SEQUENCE")!;
  expect(writer.context).toMatchObject({
    recipient: {
      kind: "NON_CRM_PROFILE_INTERNAL_ONLY",
      displayName: "Alice De Benetti",
      eligibility: "HOLD",
      outboundReady: false,
      emailAddress: null,
    },
  });
  expect(JSON.stringify(writer.context)).not.toContain(suppliedProfile.value);
  const writerContext = writer.context as {
    recipient: { verifiedPersonalizationFacts: { statement: string }[] };
    research: { facts: { id: string }[] };
  };
  expect(writerContext.research.facts.map((fact) => fact.id)).not.toContain("prospect:unrelated");
  expect(JSON.stringify(writerContext.recipient.verifiedPersonalizationFacts)).not.toContain(
    "Bob Generic",
  );
  expect(result.directDrafts?.emails).toHaveLength(4);
  expect(result.directReview).toBeDefined();
  expect(result.run?.intake.hubspotRecordId).toBeUndefined();
  expect(result.run?.eligibility.status).toBe("HOLD");
  expect(result.run?.canSend).toBe(false);
  expect(result.run?.canEnroll).toBe(false);
  expect(
    internalDocumentSchema.parse({
      version: 1,
      id: "e591f253-05a1-48d6-9e16-20e62eb24a6d",
      owner: actor,
      company: "acme.example",
      createdAt: "2026-10-21T08:00:00.000Z",
      image: null,
      review: null,
      suppliedProfile,
      automatic: result,
    }).automatic?.internalProfile?.label,
  ).toBe("INTERNAL ONLY · NOT OUTBOUND READY");
});

it("blocks personalized writing when independent profile grounding rejects the supplied role", async () => {
  const f = fixture("UNSUPPORTED_PROFILE", undefined, true);
  const result = await executeAutomaticCompany(actor, "acme.example", null, {
    ...f.deps,
    profileDraft: {
      name: "Alice De Benetti",
      linkedInUrl: null,
      suppliedMaterialStatus: "USER_SUPPLIED_UNVERIFIED",
    },
    suppliedProfile: {
      name: "Alice De Benetti",
      source: "PASTED_TEXT",
      value: "User supplied profile text that is not established by retrieved sources. ".repeat(2),
      sha256: "b".repeat(64),
      suppliedAt: "2026-10-21T08:00:00.000Z",
      status: "USER_SUPPLIED_UNVERIFIED",
    },
  });
  expect(result.status).toBe("BLOCKED");
  expect(result.issues).toContain("PROFILE_NOT_VERIFIED_FOR_PERSONALIZED_DRAFTS");
  expect(result.directDrafts).toBeUndefined();
  expect(f.stages).not.toContain("SEQUENCE");
  expect(result.internalProfile?.verification).toBe("UNVERIFIED");
  expect(result.contactEligibility).toBe("HOLD");
  expect(result.run?.canSend).toBe(false);
});

it("sends an unchanged claim with its exact surviving citation to independent grounding", async () => {
  const f = fixture("PARTIAL_QUOTE");
  const result = await executeAutomaticCompany(actor, "acme.example", null, f.deps);
  expect(f.stages).toContain("EVIDENCE_VALIDATION");
  expect(f.stages).toContain("SEQUENCE");
  expect(result.run?.research.facts[0].statement).toBe(
    "acme.example sells outdoor equipment through its online store.",
  );
  expect(result.run?.research.facts[0].quotes).toHaveLength(1);
  expect(result.run?.research.facts[0].quotes[0].text).toBe(
    result.run?.research.facts[0].statement,
  );
  expect(result.quarantinedEvidence).toHaveLength(1);
  expect(result.quarantinedEvidence?.[0].quotes[0]).toMatchObject({
    text: "Invented extra quotation",
    exactMatch: false,
  });
  expect(result.groundingAudit?.status).toBe("ACCEPTED");
});

// Synthetic saved evidence, offline permission checks only: no new semantic review or live drafts.
function savedNutrafol() {
  const doc = internalDocumentSchema.parse(
    JSON.parse(JSON.stringify(syntheticDocument("5af5468f-f42b-41f6-a419-2444fbbd0167"))),
  );
  return {
    run: structuredClone(doc.automatic!.run!),
    grounded: doc.automatic!.groundingAudit?.status === "ACCEPTED",
    now: new Date(new Date(doc.createdAt).getTime() + 60000),
  };
}
it("allows internal drafting on the four saved grounded Nutrafol facts without SERP or employment evidence", () => {
  const { run, grounded, now } = savedNutrafol();
  const before = JSON.stringify(run);
  expect(run.research.facts).toHaveLength(4);
  expect(run.research.facts.every((fact) => fact.subject === "ACCOUNT")).toBe(true);
  expect(internalCompanyDraftingClearance(run, grounded, now)).toMatchObject({
    internalDrafting: "INTERNAL_DRAFT_ALLOWED",
    outboundReadiness: "HOLD",
  });
  expect(run.strategy?.angle).toBe("NO_PITCH"); // historical decision is never rewritten
  expect(JSON.stringify(run)).toBe(before);
});
it.each([
  "grounding",
  "context",
  "identity",
  "knowledge",
  "unapproved-knowledge",
  "real-contact",
  "sending",
])("does not grant internal permission with missing or unsafe %s", (failure) => {
  const { run, grounded, now } = savedNutrafol();
  if (failure === "context") run.research.facts = [];
  if (failure === "identity") run.research.accountDomain = "unrelated.example";
  if (failure === "knowledge") run.knowledge = [];
  if (failure === "unapproved-knowledge") run.knowledge[0].text += " Guaranteed savings.";
  if (failure === "real-contact") run.intake.prospectName = "Different fictional recipient";
  if (failure === "sending") (run as unknown as { canSend: boolean }).canSend = true;
  expect(
    internalCompanyDraftingClearance(run, failure === "grounding" ? false : grounded, now)
      .internalDrafting,
  ).toBe("HOLD");
});

it("resolves a company name only from permitted retrieved source identity", async () => {
  const f = fixture();
  const result = await executeAutomaticCompany(actor, "Fictional Acme", null, f.deps);
  expect(result.run?.intake.companyDomain).toBe("acme.example");
  expect(result.modelCalls).toBe(7);
  expect(result.status).toBe("REVIEW_REQUIRED");
});

it.each([
  "QUOTE",
  "GROUNDING",
  "NO_CONTEXT",
  "AMBIGUOUS",
  "PROSPECT",
  "GLOBAL_CONCERN",
  "MISSING_DECISION",
  "CONFLICT_DECISION",
])("stops without drafting or retry for %s", async (failure) => {
  const f = fixture(failure);
  const result = await executeAutomaticCompany(
    actor,
    failure === "AMBIGUOUS" ? "Fictional Acme" : "acme.example",
    null,
    f.deps,
  );
  expect(["BLOCKED", "NO_PITCH"]).toContain(result.status);
  expect(result.run?.sequence ?? null).toBeNull();
  expect(f.stages).not.toContain("SEQUENCE");
  expect(JSON.stringify(result)).not.toContain("secret-provider-error");
});

it.each(["MIXED", "PARTIAL_REVIEW"])(
  "retains independently verified facts and excludes rejected candidates: %s",
  async (failure) => {
    const f = fixture(failure);
    const result = await executeAutomaticCompany(actor, "acme.example", null, f.deps);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.run?.research.facts.map((f) => f.id)).toEqual(["account:business"]);
    expect(result.groundingAudit?.status).toBe("ACCEPTED");
    expect(result.directDrafts?.emails).toHaveLength(4);
    if (failure === "MIXED") {
      expect(result.rejectedEvidence?.[0].factId).toBe("account:rejected");
      expect(result.rejectedEvidence?.[0].quotes[0].exactMatch).toBe(false);
    } else expect(result.candidateGroundingAudit?.status).toBe("REJECTED");
  },
);

it("source-level blocking overrides individually supported IDs without weakening the review", async () => {
  const f = fixture("SOURCE_CONCERN");
  const result = await executeAutomaticCompany(actor, "acme.example", null, f.deps);
  expect(result.status).toBe("NO_PITCH");
  expect(result.run?.research.facts).toEqual([]);
  expect(result.candidateGroundingAudit?.reviewer?.concerns?.[0].severity).toBe("BLOCKING");
  expect(f.stages).not.toContain("STRATEGY");
});

it("preserves four drafts and NOT RUN review when reviewer fails; no retry", async () => {
  const f = fixture("QUALITY_REVIEW");
  const result = await executeAutomaticCompany(actor, "acme.example", null, f.deps);
  expect(result.status).toBe("FAILED");
  expect(result.directDrafts?.emails).toHaveLength(4);
  expect(result.directReview).toBeUndefined();
  expect(f.stages.filter((s) => s === "QUALITY_REVIEW")).toHaveLength(1);
});

function reusableNutrafol() {
  return internalDocumentSchema.parse(
    JSON.parse(JSON.stringify(syntheticDocument("60d7aec5-b74f-4674-ba8c-383878702eb9"))),
  );
}
it("uses synthetic saved Nutrafol grounding for exactly one plain writing call and one review without historical strategy or drafts", async () => {
  const reuse = reusableNutrafol();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(new Date(reuse.createdAt).getTime() + 60000));
  const baseline = JSON.stringify(reuse);
  const f = fixture();
  const result = await executeAutomaticCompany(actor, "nutrafol.com", null, { ...f.deps, reuse });
  expect(f.stages).toEqual(["SEQUENCE", "QUALITY_REVIEW"]);
  expect(f.deps.reader).not.toHaveBeenCalled();
  expect(result.modelCalls).toBe(2);
  expect(result.directDrafts?.emails).toHaveLength(4);
  expect(result.directReview?.verdict).toBe("HOLD");
  expect(result.reusedResearch?.documentId).toBe(reuse.id);
  expect(result.run?.research.facts).toEqual(reuse.automatic!.run!.research.facts);
  expect(result.run?.strategy).toBeNull();
  expect(result.run?.sequence).toBeNull();
  expect(
    result.run?.usage.every((entry) => ["SEQUENCE", "QUALITY_REVIEW"].includes(entry.stage)),
  ).toBe(true);
  expect(JSON.stringify(f.prompts[0].context).length).toBeLessThan(160000);
  expect(f.prompts[0].context).not.toHaveProperty("strategy");
  expect(f.prompts[0].context).not.toHaveProperty("previousDraft");
  expect(f.prompts[0].context).toHaveProperty("styleExamples");
  expect(JSON.stringify(reuse)).toBe(baseline);
});
it("grounds Choice Hotels first, rejects the unsupported Africa scope, then writes from surviving facts without rediscovery", async () => {
  const raw = JSON.stringify(syntheticDocument("d4eb59e6-8160-4d45-a8d2-44c0174b7b65"));
  const prepared = prepareChoiceHotelsContinuation(
    raw,
    actor,
    "Choice Hotels",
    new Date("2026-10-21T10:00:00.000Z"),
  );
  const original = JSON.stringify(prepared.source);
  const f = fixture("CHOICE_PARTIAL_REVIEW");
  const result = await executeAutomaticCompany(actor, "Choice Hotels", null, {
    ...f.deps,
    continuation: prepared,
  });
  expect(
    f.stages,
    JSON.stringify({
      status: result.status,
      issues: result.issues,
      audit: result.groundingAudit?.reasonCodes,
      candidate: result.candidateGroundingAudit?.reasonCodes,
    }),
  ).toEqual(["EVIDENCE_VALIDATION", "SEQUENCE", "QUALITY_REVIEW"]);
  expect(f.deps.reader).not.toHaveBeenCalled();
  expect(result.modelCalls).toBe(3);
  expect(result.continuedResearch).toMatchObject({
    documentId: prepared.source.id,
    runId: prepared.source.automatic!.run!.id,
    startingStage: "EVIDENCE_VALIDATION",
    candidateFactIds: ["account:4", "account:5", "account:6"],
  });
  expect(result.candidateGroundingAudit?.status).toBe("REJECTED");
  expect(
    result.candidateGroundingAudit?.candidates.find((candidate) => candidate.factId === "account:4")
      ?.reviewerDecision,
  ).toBe("REJECTED");
  expect(result.groundingAudit?.status).toBe("ACCEPTED");
  expect(result.run?.research.facts.map((fact) => fact.id)).toEqual(["account:5", "account:6"]);
  expect(f.prompts.find((prompt) => prompt.stage === "SEQUENCE")?.context).toMatchObject({
    research: {
      facts: [
        expect.objectContaining({ id: "account:5" }),
        expect.objectContaining({ id: "account:6" }),
      ],
    },
  });
  expect(result.directDrafts?.emails).toHaveLength(4);
  expect(result.directReview?.verdict).toBe("PASS");
  expect(result.contactEligibility).toBe("HOLD");
  expect([result.run?.approved, result.run?.canSend, result.run?.canEnroll]).toEqual([
    false,
    false,
    false,
  ]);
  expect(JSON.stringify(prepared.source)).toBe(original);
});
it("links an offline Choice continuation to a HOLD contact without asserting unverified role or employment", async () => {
  const raw = JSON.stringify(syntheticDocument("d4eb59e6-8160-4d45-a8d2-44c0174b7b65"));
  const prepared = prepareChoiceHotelsContinuation(
    raw,
    actor,
    "Choice Hotels",
    new Date("2026-10-21T10:00:00.000Z"),
  );
  const contactDraft = {
    contactId: "fictional-choice-contact",
    displayName: "Fictional Reviewer",
    companyName: "Choice Hotels",
    companyDomain: "choicehotels.com",
    verifiedPersonalizationFacts: [],
    unresolved: [
      "Current employment at this company is not independently verified.",
      "Current title and role are unresolved.",
      "Actual Paid Search responsibility is unresolved.",
      "Business email validity is unresolved; no email address is supplied to the writer.",
    ],
    eligibility: "HOLD" as const,
    outboundReady: false as const,
  };
  const f = fixture("CHOICE_PARTIAL_REVIEW");
  const result = await executeAutomaticCompany(actor, "Choice Hotels", null, {
    ...f.deps,
    continuation: prepared,
    contactDraft,
  });
  expect(f.deps.reader).not.toHaveBeenCalled();
  expect(f.stages).toEqual(["EVIDENCE_VALIDATION", "SEQUENCE", "QUALITY_REVIEW"]);
  expect(result.modelCalls).toBe(3);
  expect(result.internalContact).toMatchObject({
    contactId: "fictional-choice-contact",
    displayName: "Fictional Reviewer",
    eligibility: "HOLD",
    outboundReady: false,
    unresolved: contactDraft.unresolved,
  });
  const writer = f.prompts.find((prompt) => prompt.stage === "SEQUENCE")!;
  expect(writer.context).toMatchObject({
    recipient: {
      kind: "REAL_CRM_CONTACT_INTERNAL_ONLY",
      displayName: "Fictional Reviewer",
      verifiedPersonalizationFacts: [],
      eligibility: "HOLD",
      outboundReady: false,
      emailAddress: null,
    },
  });
  expect(JSON.stringify(writer.context)).not.toContain("employment is verified");
  expect(result.directDrafts?.emails).toHaveLength(4);
  expect(result.directReview).toBeDefined();
  expect(result.contactEligibility).toBe("HOLD");
  expect(result.run?.approved).toBe(false);
  expect(result.run?.canSend).toBe(false);
  expect(result.run?.canEnroll).toBe(false);
});
it("stops after independent grounding when the saved Choice Hotels facts do not pass", async () => {
  const raw = JSON.stringify(syntheticDocument("d4eb59e6-8160-4d45-a8d2-44c0174b7b65"));
  const prepared = prepareChoiceHotelsContinuation(
    raw,
    actor,
    "Choice Hotels",
    new Date("2026-10-21T10:00:00.000Z"),
  );
  const f = fixture("GROUNDING");
  const result = await executeAutomaticCompany(actor, "Choice Hotels", null, {
    ...f.deps,
    continuation: prepared,
  });
  expect(f.stages).toEqual(["EVIDENCE_VALIDATION"]);
  expect(result.directDrafts).toBeUndefined();
  expect(result.modelCalls).toBe(1);
  expect(result.contactEligibility).toBe("HOLD");
});
it.each(["owner", "domain", "source", "quote", "stale", "audit"])(
  "refuses unsafe saved %s without discovery fallback or paid calls",
  async (failure) => {
    const reuse = reusableNutrafol();
    if (failure === "owner") reuse.owner = "someone-else";
    if (failure === "domain") reuse.automatic!.run!.research.accountDomain = "unrelated.example";
    if (failure === "source") reuse.automatic!.run!.research.sources[0].excerpt += " altered";
    if (failure === "quote") reuse.automatic!.run!.research.facts[0].quotes[0].text = "invented";
    if (failure === "stale")
      reuse.automatic!.run!.research.sources[0].observedAt = "2000-01-01T00:00:00Z";
    if (failure === "audit") reuse.automatic!.groundingAudit!.status = "REJECTED";
    expect(() => verifyReusableCompanyResearch(reuse, actor, "nutrafol.com")).toThrow(
      "SAVED_RESEARCH_NOT_VERIFIED",
    );
    const f = fixture();
    const result = await executeAutomaticCompany(actor, "nutrafol.com", null, { ...f.deps, reuse });
    expect(result.status).toBe("BLOCKED");
    expect(result.modelCalls).toBe(0);
    expect(f.stages).toEqual([]);
  },
);
it.each(["CONTRADICTORY_PASS", "MISSING_REVIEW_STEP", "MALFORMED_WRITING"])(
  "fails closed on %s without retry or falsely approving copy",
  async (failure) => {
    const f = fixture(failure);
    const result = await executeAutomaticCompany(actor, "acme.example", null, f.deps);
    expect(result.directReview?.verdict).not.toBe("PASS");
    expect(f.stages.filter((s) => s === "SEQUENCE")).toHaveLength(1);
    expect(f.stages.filter((s) => s === "QUALITY_REVIEW").length).toBeLessThanOrEqual(1);
    if (failure === "MISSING_REVIEW_STEP") {
      expect(result.directDrafts?.emails).toHaveLength(4);
      expect(result.status).toBe("FAILED");
    }
    if (failure === "MALFORMED_WRITING") expect(result.directDrafts).toBeUndefined();
  },
);

it("a complete simulated PASS remains internal-only and never creates an outbound-ready sequence", async () => {
  const f = fixture("CLEAN_PASS");
  const result = await executeAutomaticCompany(actor, "acme.example", null, f.deps);
  expect(result.directReview?.verdict).toBe("PASS");
  expect(result.status).toBe("REVIEW_REQUIRED");
  expect(result.run?.sequence).toBeNull();
  expect(result.contactEligibility).toBe("HOLD");
  expect(automaticCompanySchema.safeParse({ ...result, run: null }).success).toBe(false);
  expect([result.run?.approved, result.run?.canSend, result.run?.canEnroll]).toEqual([
    false,
    false,
    false,
  ]);
});

it("keeps the synthetic rejected copy for reference but downgrades an overgenerous mocked PASS to REVISE", async () => {
  const saved = internalDocumentSchema.parse(
    JSON.parse(JSON.stringify(syntheticDocument("5bfc80e8-8d53-4942-86f4-884405437724"))),
  );
  const before = JSON.stringify(saved);
  expect(saved.automatic!.directReview!.verdict).toBe("PASS");
  const f = fixture("CLEAN_PASS", saved.automatic!.directDrafts!.emails);
  const result = await executeAutomaticCompany(actor, "acme.example", null, f.deps);
  expect(result.directReview?.verdict).toBe("REVISE");
  expect(result.directReview?.concerns.join(" ")).toContain("repeat configuration disclaimers");
  expect(result.directDrafts?.emails).toEqual(saved.automatic!.directDrafts!.emails);
  expect(result.directReview?.unsupportedAssertions).toEqual([]); // editorial, not factual rejection
  expect(f.stages.filter((stage) => stage === "SEQUENCE")).toHaveLength(1);
  expect(f.stages.filter((stage) => stage === "QUALITY_REVIEW")).toHaveLength(1);
  expect(result.contactEligibility).toBe("HOLD");
  expect(JSON.stringify(saved)).toBe(before); // no rewriting historical outcomes
});

it("gives the writer and independent critic the same style references, with a distinct editorial rejection standard", async () => {
  const f = fixture("CLEAN_PASS");
  await executeAutomaticCompany(actor, "acme.example", null, f.deps);
  const writer = f.prompts.find((p) => p.stage === "SEQUENCE")!;
  const critic = f.prompts.find((p) => p.stage === "QUALITY_REVIEW")!;
  expect(writer.instruction).toContain(internalSalesWritingStandard);
  expect(writer.instruction).not.toContain(internalSalesReviewStandard);
  expect(critic.instruction).toContain(internalSalesReviewStandard);
  expect(internalSalesWritingStandard).toContain(
    "loveholidays-cold-reply example primary style weight",
  );
  expect(internalSalesWritingStandard).toContain("explain one relevant mechanism");
  expect(internalSalesWritingStandard).toContain("three brief, natural follow-ups");
  expect(internalSalesWritingStandard).toContain("Avoid stock transitions");
  expect(internalSalesWritingStandard).toContain("external-use permission; otherwise omit proof");
  const writerContext = writer.context as {
    styleExamples: unknown[];
    knowledge: unknown[];
    salesMessaging: {
      conversationLearning: {
        examples: Array<{ id: string; stage: string; outcome: string; excerpt: string }>;
      };
    };
  };
  const criticContext = critic.context as typeof writerContext;
  expect(writerContext.styleExamples).toHaveLength(4);
  expect(criticContext.styleExamples).toEqual(writerContext.styleExamples);
  expect(criticContext.knowledge).toEqual(writerContext.knowledge);
  expect(writerContext.salesMessaging.conversationLearning.examples).toContainEqual(
    expect.objectContaining({
      id: "loveholidays-cold-reply",
      stage: "COLD_OUTREACH",
      outcome: "REPLY_OBSERVED",
    }),
  );
  expect(JSON.stringify(writerContext.styleExamples)).toContain("STYLE_ONLY_NOT_PROOF");
  expect(writer.context).toHaveProperty("salesMessaging.customerProof.candidateKnowledgeIds", []);
  expect(critic.context).toHaveProperty(
    "salesMessaging",
    (writer.context as { salesMessaging: unknown }).salesMessaging,
  );
  expect(writer.context).toHaveProperty("brandSearch");
  expect(writer.context).toHaveProperty("screenshotObservation", null);
  expect(critic.instruction).toContain("HOLD for factual violations");
});

it("does not mistake one necessary qualification or conditional product inquiry for editorial failure", () => {
  expect(
    internalSalesEditorialConcerns({
      messages: [
        {
          step: 1,
          subject: "Fictional example",
          body: "Signal can support pausing where configured. Would that be useful?",
        },
        {
          step: 2,
          subject: "Lower bids",
          body: "If pausing is not right, would you consider lowering bids?",
        },
        {
          step: 3,
          subject: "Competition",
          body: "How would you want to respond if competition returned?",
        },
        { step: 4, subject: "Closing", body: "Is this relevant for your team?" },
      ],
    }),
  ).toEqual([]); // no semantic verdict claimed by this mechanical check
});

it.each(["", "IMAGE"])(
  "checks original screenshot independently and never invents context: %s",
  async (failure) => {
    const f = fixture(failure);
    const result = await executeAutomaticCompany(actor, "Fictional Acme", image, f.deps);
    expect(result.modelCalls).toBeLessThanOrEqual(10);
    expect(result.screenshotReview).toBe(failure ? "REJECTED" : "PASSED");
    if (failure) expect(f.stages).not.toContain("SEQUENCE");
    else {
      expect(result.screenshot?.market).toEqual(unknown);
      expect(result.status).toBe("REVIEW_REQUIRED");
      expect(result.modelCalls).toBe(9);
      expect(f.prompts.find((p) => p.stage === "SEQUENCE")?.context).toHaveProperty(
        "screenshotObservation",
        result.screenshot,
      );
    }
  },
);

it("requires explicit local activation; rejects real-contact or clearance mutations", async () => {
  const f = fixture();
  vi.stubEnv("LOCAL_INTERNAL_SALES_ENABLED", "false");
  await expect(executeAutomaticCompany(actor, "acme.example", null, f.deps)).rejects.toThrow(
    "INTERNAL_SALES_DISABLED",
  );
  expect(f.stages).toEqual([]);
  vi.stubEnv("LOCAL_INTERNAL_SALES_ENABLED", "true");
  const result = await executeAutomaticCompany(actor, "acme.example", null, f.deps);
  const changed = structuredClone(result);
  changed.run!.intake.prospectName = "Stephanie Hotz";
  expect(automaticCompanySchema.safeParse(changed).success).toBe(false);
  changed.run!.intake.prospectName = "Generic fictional recipient";
  expect(
    automaticCompanySchema.safeParse({
      ...changed,
      run: { ...changed.run!, canSend: true },
    }).success,
  ).toBe(false);
});

vi.mock(
  "./continuation-binding",
  async () => (await import("@/test/synthetic-company-documents")).syntheticChoiceBinding,
);
