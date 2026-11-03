// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  prepareProspects,
  getPreparationPlan,
  resolveChoiceContinuationContact,
} from "./preparation";
import {
  buildInternalContactDraftContext,
  prioritizePreparation,
  summarizePreparationEligibility,
} from "@/features/agent-workforce/dashboard/prospect-preparation";
import { reviewEvidenceSnapshot } from "@/server/services/sales-agent-collection-service";
import {
  MemoryEvidenceStore,
  collectedContact,
  collectionNow,
  observation,
} from "@/test/sales-agent-collection-fixtures";
import { MemoryDailyStore } from "../daily/test-store";
import { fictionalCompanyEnv } from "../company-research/test-fixtures";
import {
  executeAutomaticCompany,
  verifyReusableCompanyResearch,
} from "../company-research/automatic-execution";
import { validateResearch } from "../evidence-validation";
import { MockWorkforceModel } from "@/test/workforce-fixtures";
import type { WorkforceModel } from "../openai";
import {
  internalDocumentSchema,
  type InternalCompanyDocument,
} from "@/features/agent-workforce/company-research/internal-review";
import type { EvidenceSnapshot } from "@/server/sales-agent/evidence-store";

const actor = fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID;
beforeEach(() => {
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
  vi.stubEnv("LOCAL_INTERNAL_SALES_ENABLED", "true");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(collectionNow);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
function snapshot(
  id: string,
  domain = `fixture${id}.example`,
  role = "Head of Paid Search",
): EvidenceSnapshot {
  const contact = {
    ...collectedContact,
    hubspotRecordId: id,
    companyDomain: domain,
    companyName: `Fictional ${id}`,
    fullName: `Fictional recipient ${id}`,
  };
  const observations = [
    observation("role", role, "HUBSPOT", {
      hubspotRecordId: id,
      verifiedAt: null,
      independent: false,
    }),
  ];
  contact.observations = observations;
  return {
    version: 1,
    contact,
    observations,
    provenanceAtCollection: [],
    blockers: [],
    collectedAt: collectionNow.toISOString(),
    providers: [
      { provider: "HUBSPOT", status: "CONNECTED", message: "Offline fictional fixture" },
      {
        provider: "OUTREACH",
        status: "NOT_CONFIGURED",
        message: "Unresolved fictional identity; HOLD",
      },
    ],
  };
}
async function fixture(count = 3, fail = false) {
  const store = new MemoryEvidenceStore();
  await store.save(
    actor,
    Array.from({ length: count }, (_, i) => snapshot(String(i + 1))),
  );
  const documents: InternalCompanyDocument[] = [];
  const stages: string[] = [];
  const contactContexts: unknown[] = [];
  const model: WorkforceModel = {
    discover: async () => {
      stages.push("DISCOVERY");
      return [];
    },
    structured: async (stage, schema, instruction, raw, usage) => {
      stages.push(stage);
      if (fail && stage === "ACCOUNT_RESEARCH") throw Error("FICTIONAL_PROVIDER_FAILURE");
      if (stage === "SEQUENCE") {
        const recipient = (
          raw as { recipient?: { displayName?: string; emailAddress?: string | null } }
        ).recipient;
        if (recipient) contactContexts.push(raw);
        const firstName = recipient?.displayName?.split(/\s+/)[0] ?? "Fictional recipient";
        return schema.parse({
          approach: "Offline simulated contact-personalized inquiry",
          limitations: ["Synthetic model output; not a real contact draft or provider result"],
          emails: Array.from({ length: 4 }, (_, i) => ({
            subject: `Fictional ${i + 1}`,
            body: `Hi ${firstName}, this is synthetic offline copy for test ${i + 1}. Would a short conversation be useful?`,
          })),
        });
      }
      const output = await new MockWorkforceModel().structured(
        stage,
        z.any(),
        instruction,
        (raw as { task?: unknown }).task ?? raw,
        usage,
      );
      if (stage === "QUALITY_REVIEW") delete output.oiq;
      return schema.parse(output);
    },
  };
  const create = vi.fn(
    async (
      a: string,
      _host: string | null,
      raw: unknown,
      _execute?: boolean,
      options?: {
        maxModelCalls?: 5;
        contactDraft?: import("@/features/agent-workforce/company-research/internal-review").InternalContactDraftContext;
      },
    ) => {
      const input = raw as { company: string; reuseResearchId?: string };
      const doc = internalDocumentSchema.parse({
        version: 1,
        id: randomUUID(),
        owner: a,
        company: input.company,
        createdAt: collectionNow.toISOString(),
        image: null,
        review: null,
      });
      documents.push(doc);
      doc.automatic = await executeAutomaticCompany(a, input.company, null, {
        model: () => model,
        budgetStore: new MemoryDailyStore(),
        maxModelCalls: options?.maxModelCalls,
        contactDraft: options?.contactDraft,
        reuse: documents.find((d) => d.id === input.reuseResearchId),
        reader: async (url) => ({
          url,
          title: "Fictional offline source",
          text: `${input.company} sells outdoor equipment through its online store. Explicitly fictional content for isolated testing, not live research.`,
        }),
        checkpoint: async (result) => {
          doc.automatic = result;
        },
      });
      return doc;
    },
  );
  const deps = {
    store,
    documents: async () => documents,
    create,
    budget: new MemoryDailyStore(),
    now: () => collectionNow,
    collect: vi.fn(async () => {
      throw Error("LIVE_INTAKE_FORBIDDEN");
    }),
    outreach: vi.fn(() => {
      throw Error("REPEATED_OUTREACH_FORBIDDEN");
    }),
  };
  return { deps, documents, stages, contactContexts };
}
it("prioritizes at most five unique companies without promoting title or unresolved history to eligibility", () => {
  const snapshots = Array.from({ length: 8 }, (_, i) => snapshot(String(i + 1)));
  snapshots.push(snapshot("9", "fixture1.example"));
  snapshots.push({ ...snapshot("10"), contact: { ...snapshot("10").contact, ownerId: "other" } });
  snapshots.push({
    ...snapshot("11"),
    observations: [
      ...snapshot("11").observations,
      observation("hardBounced", true, "HUBSPOT", { hubspotRecordId: "11" }),
    ],
  });
  snapshots.push({
    ...snapshot("12"),
    observations: [
      ...snapshot("12").observations,
      observation("lastOutboundAt", collectionNow.toISOString(), "OUTREACH", {
        hubspotRecordId: "12",
      }),
    ],
  });
  const result = prioritizePreparation(
    snapshots.map((s) => reviewEvidenceSnapshot(s, collectionNow)),
    collectionNow,
  );
  expect(result.selected).toHaveLength(5);
  expect(new Set(result.selected.map((i) => i.domain)).size).toBe(5);
  expect(result.selected.every((i) => i.row.qualification.status === "HOLD")).toBe(true);
  expect(result.excluded.map((i) => i.contactId)).toEqual(
    expect.arrayContaining(["9", "10", "11", "12"]),
  );
});
it("summarizes actual gates and never presents incomplete Outreach history as a clean record", () => {
  const row = reviewEvidenceSnapshot(snapshot("1"), collectionNow);
  const summary = summarizePreparationEligibility(row);
  expect(summary.lastOutbound).toContain("Unknown");
  expect(summary.lastOutbound).toContain("incomplete or unresolved");
  expect(summary.eligibilityChecks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "emailVerification", state: "UNKNOWN" }),
      expect.objectContaining({ id: "currentEmploymentVerified", state: "UNKNOWN" }),
      expect.objectContaining({ id: "outreachHistoryComplete", state: "UNKNOWN" }),
      expect.objectContaining({ id: "activeSequence", state: "UNKNOWN" }),
    ]),
  );
});
it("uses only accepted fresh contact facts and keeps unresolved person details out of the writer context", () => {
  const value = snapshot("verified-contact");
  value.contact.fullName = "Fictional Verified Buyer";
  value.observations = [
    observation("role", "Head of Paid Search", "SURFE", {
      hubspotRecordId: "verified-contact",
      supportingEvidence: [
        "Current role: Head of Paid Search; private contact contact@example.test, +1 (415) 555-0198",
      ],
    }),
    observation("currentEmploymentVerified", true, "ZOOMINFO", {
      hubspotRecordId: "verified-contact",
      subjectCompanyDomain: value.contact.companyDomain,
    }),
    observation("paidSearchResponsibility", "PROVEN", "SURFE", {
      hubspotRecordId: "verified-contact",
    }),
  ];
  const row = reviewEvidenceSnapshot(value, collectionNow);
  const context = buildInternalContactDraftContext(row);
  expect(context.verifiedPersonalizationFacts.map((fact) => fact.field)).toEqual([
    "role",
    "paidSearchResponsibility",
  ]);
  expect(context.verifiedPersonalizationFacts[0].supportingEvidence[0]).not.toContain(
    "contact@example.test",
  );
  expect(context.verifiedPersonalizationFacts[0].supportingEvidence[0]).not.toContain("415");
  expect(context).toMatchObject({ eligibility: "HOLD", outboundReady: false });
  expect(context.unresolved.join(" ")).toContain("Business email validity is unresolved");
  expect(context).not.toHaveProperty("email");
});
it("uses a current identity-matched employment verification result without exposing contact coordinates", () => {
  const value = snapshot("verified-contact");
  value.contact.fullName = "Fictional Verified Buyer";
  value.observations = [];
  const row = reviewEvidenceSnapshot(value, collectionNow);
  row.qualification.gates = row.qualification.gates.map((gate) =>
    ["role", "paidSearchResponsibility", "currentEmploymentVerified"].includes(gate.id)
      ? { ...gate, state: "CLEAR" as const }
      : gate,
  );
  const identity = {
    hubspotRecordId: value.contact.hubspotRecordId,
    fullName: value.contact.fullName,
    email: value.contact.email,
    companyDomain: value.contact.companyDomain,
    emailModifiedAt: value.contact.emailModifiedAt,
    emailSource: value.contact.emailSource,
  };
  row.verification.EMPLOYMENT = {
    requestKey: "fictional-employment",
    identity,
    providerId: "OFFLINE_FIXTURE",
    state: "COMPLETED",
    startedAt: collectionNow.toISOString(),
    leaseUntil: collectionNow.toISOString(),
    nextRetryAt: collectionNow.toISOString(),
    attempts: 1,
    message: "Fictional offline verification fixture",
    result: {
      kind: "EMPLOYMENT",
      identity,
      proof: {
        providerId: "OFFLINE_FIXTURE",
        sourceRecordId: "offline:employment:verified-contact",
        sourceUrl: "https://profiles.example/verified-contact",
        checkedAt: collectionNow.toISOString(),
        evidence: ["Fictional public profile confirms current role."],
        independent: true,
      },
      status: "VERIFIED",
      employerDomain: "fixtureverified-contact.example",
      current: true,
      role: "Head of Paid Search",
      seniority: "HEAD",
      searchResponsibility: "PROVEN",
      responsibilityScope: "PAID_SEARCH",
      responsibilityEvidence: ["Fictional profile states responsibility for Paid Search."],
    },
  };
  const context = buildInternalContactDraftContext(row);
  expect(context.verifiedPersonalizationFacts.map((fact) => fact.field)).toEqual([
    "role",
    "paidSearchResponsibility",
  ]);
  expect(context.verifiedPersonalizationFacts[0].source).toBe("OFFLINE_FIXTURE");
  expect(context.unresolved.join(" ")).toContain("Business email validity is unresolved");
});
it("prepares only the selected contact, reuses its cached unresolved Outreach checks and leaves gates unchanged", async () => {
  const f = await fixture();
  const before = (await f.deps.store.list(actor)) as EvidenceSnapshot[];
  const plan = await prepareProspects(actor, "localhost:3000", false, "1", f.deps);
  expect(plan.items).toHaveLength(3);
  expect(plan.lastAction?.companies).toHaveLength(1);
  expect(plan.lastAction?.maxCalls).toBe(5);
  expect(plan.maxEstimatedUsd).toBe(1);
  expect(plan.lastAction).toMatchObject({
    paidAuthorized: false,
    outcome: "NOT AUTHORIZED",
    actualCalls: 0,
    actualEstimatedUsd: 0,
  });
  expect(
    plan.items.every((i) => i.eligibility === "HOLD" && i.outreach.includes("UNRESOLVED")),
  ).toBe(true);
  expect(f.deps.create).not.toHaveBeenCalled();
  expect(f.deps.outreach).not.toHaveBeenCalled();
  const after = (await f.deps.store.list(actor)) as EvidenceSnapshot[];
  expect(after).toHaveLength(before.length);
  expect(
    after.find((entry) => entry.contact.hubspotRecordId === "1")?.preparationAttempts,
  ).toMatchObject([
    {
      paidAuthorized: false,
      stage: "OUTREACH_CHECK",
      outcome: "NOT AUTHORIZED",
      failureCode: null,
      actualCalls: 0,
      actualEstimatedUsd: 0,
    },
  ]);
  expect(
    after
      .filter((entry) => entry.contact.hubspotRecordId !== "1")
      .every((entry) => !entry.preparationAttempts),
  ).toBe(true);
});

it("persists a sanitized blocked preflight attempt without starting model work", async () => {
  const f = await fixture(1);
  vi.stubEnv("LOCAL_INTERNAL_SALES_ENABLED", "false");
  await expect(prepareProspects(actor, "localhost:3000", true, "1", f.deps)).rejects.toThrow(
    "PREPARATION_AI_NOT_READY",
  );
  expect(f.deps.create).not.toHaveBeenCalled();
  const reopened = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(reopened.items[0].latestAttempt).toMatchObject({
    paidAuthorized: true,
    stage: "PREFLIGHT",
    outcome: "BLOCKED",
    failureCode: "PREPARATION_AI_NOT_READY",
    actualCalls: 0,
    actualEstimatedUsd: 0,
  });
});

it("resolves a saved-continuation contact only from Gil-owned Choice Hotels snapshots and keeps HOLD facts unresolved", async () => {
  const f = await fixture(1);
  const target = snapshot("muna-record", "choicehotels.com", "Head of Paid Search");
  target.contact.fullName = "Fictional Reviewer";
  target.contact.companyName = "Choice Hotels";
  await f.deps.store.save(actor, [target]);

  const context = await resolveChoiceContinuationContact(
    actor,
    "localhost:3000",
    "muna-record",
    f.deps,
  );
  expect(context).toMatchObject({
    contactId: "muna-record",
    displayName: "Fictional Reviewer",
    companyName: "Choice Hotels",
    eligibility: "HOLD",
    outboundReady: false,
    verifiedPersonalizationFacts: [],
  });
  expect(context.unresolved.join(" ")).toContain("Current employment");
  expect(context.unresolved.join(" ")).toContain("Search responsibility");
  expect(context).not.toHaveProperty("email");

  target.contact.ownerId = "different-owner";
  await f.deps.store.save(actor, [target]);
  await expect(
    resolveChoiceContinuationContact(actor, "localhost:3000", "muna-record", f.deps),
  ).rejects.toThrow();
});
it("prepares only the selected contact through offline research/grounding/writing/review, then reuses its packet", async () => {
  const f = await fixture();
  const result = await prepareProspects(actor, "localhost:3000", true, "1", f.deps);
  expect(f.deps.create).toHaveBeenCalledOnce();
  expect(result.newCalls).toBe(5);
  expect(result.lastAction).toMatchObject({
    paidAuthorized: true,
    outcome: "COMPLETED",
    actualCalls: 5,
    actualEstimatedUsd: result.newEstimatedUsd,
  });
  expect(f.deps.create.mock.calls.every((call) => call[4]?.maxModelCalls === 5)).toBe(true);
  const after = await f.deps.store.list(actor);
  expect(
    after.find((raw) => (raw as EvidenceSnapshot).contact.hubspotRecordId === "1"),
  ).toMatchObject({ preparation: { state: "REVIEW_REQUIRED" } });
  expect(
    after
      .filter((raw) => (raw as EvidenceSnapshot).contact.hubspotRecordId !== "1")
      .every((raw) => !(raw as EvidenceSnapshot).preparation),
  ).toBe(true);
  expect(result.items.find((i) => i.contactId === "1")).toMatchObject({
    action: "REUSE_PACKET",
    result: {
      directDrafts: { emails: expect.arrayContaining([expect.any(Object)]) },
      internalContact: { contactId: "1" },
    },
  });
  expect(f.contactContexts).toHaveLength(1);
  const firstContext = f.contactContexts[0] as {
    recipient: {
      displayName: string;
      emailAddress: string | null;
      verifiedPersonalizationFacts: unknown[];
      unresolved: string[];
    };
  };
  expect(firstContext.recipient.displayName).toBe("Fictional recipient 1");
  expect(firstContext.recipient.emailAddress).toBeNull();
  expect(firstContext.recipient.verifiedPersonalizationFacts).toEqual([]);
  expect(firstContext.recipient.unresolved.join(" ")).toContain("Current employment");
  expect(result.items.find((i) => i.contactId === "1")).toMatchObject({
    result: { directReview: { verdict: "PASS" }, run: { canSend: false, canEnroll: false } },
    eligibility: "HOLD",
  });
  expect(f.stages).toEqual([
    "DISCOVERY",
    "ACCOUNT_RESEARCH",
    "EVIDENCE_VALIDATION",
    "SEQUENCE",
    "QUALITY_REVIEW",
  ]);
  const reopened = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(reopened.items.map((i) => i.documentId)).toEqual(result.items.map((i) => i.documentId));
  const second = await prepareProspects(actor, "localhost:3000", true, "1", f.deps);
  expect(second.newCalls).toBe(0);
  expect(f.deps.create).toHaveBeenCalledOnce();
});
it("rejects a contact outside the server's owner-scoped preparation plan", async () => {
  const f = await fixture(2);
  await expect(
    prepareProspects(actor, "localhost:3000", false, "not-in-owner-queue", f.deps),
  ).rejects.toThrow("PREPARATION_CONTACT_NOT_AVAILABLE");
  expect(f.deps.outreach).not.toHaveBeenCalled();
  expect(f.deps.create).not.toHaveBeenCalled();
});
it("reuses cached company research for one contact-writing continuation without rerunning discovery or research", async () => {
  const f = await fixture(1);
  const first = await prepareProspects(actor, "localhost:3000", true, "1", f.deps);
  expect(first.newCalls).toBe(5);
  expect(f.stages).toEqual([
    "DISCOVERY",
    "ACCOUNT_RESEARCH",
    "EVIDENCE_VALIDATION",
    "SEQUENCE",
    "QUALITY_REVIEW",
  ]);
  // Simulate an older company-only packet: its saved drafts cannot count as contact drafts.
  delete f.documents[0].automatic!.internalContact;
  const continuationPlan = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(continuationPlan.items[0]).toMatchObject({ action: "REUSE_RESEARCH", maxCalls: 2 });
  const second = await prepareProspects(actor, "localhost:3000", true, "1", f.deps);
  expect(second.newCalls).toBe(2);
  expect(f.stages.slice(5)).toEqual(["SEQUENCE", "QUALITY_REVIEW"]);
  expect(second.items[0]).toMatchObject({
    action: "REUSE_PACKET",
    result: { internalContact: { contactId: "1", eligibility: "HOLD", outboundReady: false } },
  });
  expect((await getPreparationPlan(actor, "localhost:3000", f.deps)).items[0].maxCalls).toBe(0);
});
it("routes a verified contact packet with REVISE through two-call research reuse, including official media subdomains", async () => {
  const f = await fixture(1);
  await prepareProspects(actor, "localhost:3000", true, "1", f.deps);

  const target = snapshot("1", "fictional1.example");
  target.contact.companyName = "fixture1.example";
  await f.deps.store.save(actor, [target]);

  const saved = f.documents[0];
  saved.company = "fixture1.example";
  saved.automatic!.run!.intake.companyName = "fixture1.example Inc.";
  saved.automatic!.run!.intake.companyDomain = "media.fictional1.example";
  saved.automatic!.run!.research.accountDomain = "media.fictional1.example";
  saved.automatic!.directReview!.verdict = "REVISE";
  expect(
    validateResearch(
      {
        ...saved.automatic!.run!,
        intake: { ...saved.automatic!.run!.intake, companyName: "fixture1.example" },
      },
      collectionNow,
      { company: true, prospect: false },
    ),
  ).toEqual([]);
  expect(() =>
    verifyReusableCompanyResearch(saved, actor, "fixture1.example", collectionNow),
  ).not.toThrow();

  const plan = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(plan.items[0]).toMatchObject({
    contactId: "1",
    company: "fixture1.example",
    action: "REUSE_RESEARCH",
    maxCalls: 2,
    requiresIncrementalEstimate: true,
    estimatedIncrementalUsd: null,
    result: {
      internalContact: { contactId: "1", eligibility: "HOLD" },
      directDrafts: { emails: expect.any(Array) },
      directReview: { verdict: "REVISE" },
    },
  });
  expect(plan.maxCalls).toBe(2);
  expect(plan.items[0].result?.directDrafts?.emails).toHaveLength(4);
  expect(f.deps.create).toHaveBeenCalledOnce();
  await expect(prepareProspects(actor, "localhost:3000", true, "1", f.deps)).rejects.toThrow(
    "PREPARATION_INCREMENTAL_ESTIMATE_UNAVAILABLE",
  );
  expect(f.deps.create).toHaveBeenCalledOnce();
});
it("creates a new contact-linked version from saved grounded research when the prior verdict is REVISE", async () => {
  const f = await fixture(1);
  const originalResult = await prepareProspects(actor, "localhost:3000", true, "1", f.deps);
  expect(originalResult.newCalls).toBe(5);
  expect(originalResult.lastAction?.outcome).toBe("COMPLETED");
  await f.deps.store.edit(actor, "1", (raw) => {
    const current = raw as EvidenceSnapshot;
    return {
      ...current,
      contact: {
        ...current.contact,
        fullName: "Fictional Reviewer",
        companyName: "Choice Hotels",
        companyDomain: "choicehotels.com",
      },
    };
  });
  const original = f.documents[0];
  const originalId = original.id;
  original.company = "Choice Hotels";
  original.automatic!.run!.intake.companyName = "Choice Hotels International, Inc.";
  original.automatic!.run!.intake.companyDomain = "media.choicehotels.com";
  original.automatic!.run!.research.accountDomain = "media.choicehotels.com";
  original.automatic!.internalContact = {
    contactId: "1",
    displayName: "Fictional Reviewer",
    label: "INTERNAL REVIEW ONLY",
    eligibility: "HOLD",
    outboundReady: false,
    unresolved: ["Employment, Search responsibility and email validity are unresolved."],
  };
  const research = original.automatic!.run!.research;
  const sourceUrl = "https://choicehotels.com/";
  const excerpt =
    "Choice Hotels International, Inc. provides lodging accommodations through a portfolio of hotel brands. Fictional offline evidence for isolated testing, not live research.";
  const sourceId =
    "web:" +
    createHash("sha256")
      .update(sourceUrl + excerpt)
      .digest("hex")
      .slice(0, 20);
  research.sources = [
    {
      ...research.sources[0],
      id: sourceId,
      url: sourceUrl,
      excerpt,
      title: "Fictional Choice Hotels source",
    },
  ];
  research.facts = [
    {
      ...research.facts[0],
      statement:
        "Choice Hotels International, Inc. provides lodging accommodations through hotel brands.",
      sourceIds: [sourceId],
      quotes: [
        {
          sourceId,
          text: "Choice Hotels International, Inc. provides lodging accommodations through a portfolio of hotel brands.",
        },
      ],
    },
  ];
  original.automatic!.groundingAudit!.candidates =
    original.automatic!.groundingAudit!.candidates.map((candidate) => ({
      ...candidate,
      sourceIds: [sourceId],
      quotes: candidate.quotes.map((quote) => ({ ...quote, sourceId })),
    }));
  expect(() =>
    verifyReusableCompanyResearch(original, actor, "Choice Hotels", collectionNow),
  ).not.toThrow();
  const originalDrafts = structuredClone(original.automatic!.directDrafts);
  const originalEvidence = structuredClone(original.automatic!.groundingAudit);
  original.automatic!.directReview!.verdict = "REVISE";
  original.automatic!.usage = [
    {
      stage: "DISCOVERY",
      model: "offline-fixture",
      attempts: 1,
      inputTokens: 50,
      outputTokens: 20,
      estimatedCostUsd: 0.00651,
    },
    {
      stage: "SEQUENCE",
      model: "offline-fixture",
      attempts: 1,
      inputTokens: 100,
      outputTokens: 40,
      estimatedCostUsd: 0.00981375,
    },
    {
      stage: "QUALITY_REVIEW",
      model: "offline-fixture",
      attempts: 1,
      inputTokens: 80,
      outputTokens: 30,
      estimatedCostUsd: 0.010461,
    },
  ];

  const plan = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(plan.items[0]).toMatchObject({
    contactId: "1",
    name: "Fictional Reviewer",
    company: "Choice Hotels",
    action: "REUSE_RESEARCH",
    maxCalls: 2,
    estimatedIncrementalUsd: 0.02027475,
    requiresIncrementalEstimate: true,
    eligibility: "HOLD",
    result: { directReview: { verdict: "REVISE" } },
  });
  expect(plan.maxCalls).toBe(2);

  const continuation = await prepareProspects(actor, "localhost:3000", true, "1", f.deps);
  expect(continuation.newCalls).toBe(2);
  expect(f.stages.slice(5)).toEqual(["SEQUENCE", "QUALITY_REVIEW"]);
  expect(f.deps.create).toHaveBeenCalledTimes(2);
  expect(f.deps.create.mock.calls[1][2]).toEqual({
    company: "Choice Hotels",
    reuseResearchId: originalId,
  });
  expect(f.deps.create.mock.calls[1][4]).toMatchObject({
    maxModelCalls: 5,
    contactDraft: {
      contactId: "1",
      displayName: "Fictional Reviewer",
      companyName: "Choice Hotels",
      eligibility: "HOLD",
      outboundReady: false,
    },
  });
  expect(f.documents).toHaveLength(2);
  expect(f.documents[0].id).toBe(originalId);
  expect(f.documents[0].automatic!.directReview!.verdict).toBe("REVISE");
  expect(f.documents[0].automatic!.directDrafts).toEqual(originalDrafts);
  expect(f.documents[0].automatic!.groundingAudit).toEqual(originalEvidence);
  expect(f.documents[1].id).not.toBe(originalId);
  expect(f.documents[1].automatic).toMatchObject({
    internalContact: {
      contactId: "1",
      displayName: "Fictional Reviewer",
      eligibility: "HOLD",
      outboundReady: false,
    },
    groundingAudit: originalEvidence,
  });
});
it("does not reuse a media-subdomain packet when the contact, company label, or canonical domain differs", async () => {
  const f = await fixture(1);
  await prepareProspects(actor, "localhost:3000", true, "1", f.deps);
  const saved = f.documents[0];
  saved.company = "fixture1.example";
  saved.automatic!.run!.intake.companyName = "fixture1.example Inc.";
  saved.automatic!.run!.intake.companyDomain = "media.fictional1.example";
  saved.automatic!.run!.research.accountDomain = "media.fictional1.example";

  const target = snapshot("1", "example-fictional1.example");
  target.contact.companyName = "fixture1.example";
  await f.deps.store.save(actor, [target]);
  const wrongDomain = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(wrongDomain.items[0].action).toBe("RESEARCH");

  const differentCompany = snapshot("1", "fictional1.example");
  differentCompany.contact.companyName = "Different Company";
  await f.deps.store.save(actor, [differentCompany]);
  const wrongCompany = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(wrongCompany.items[0].action).toBe("RESEARCH");

  saved.automatic!.internalContact!.contactId = "someone-else";
  const wrongContact = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(wrongContact.items[0].action).toBe("RESEARCH");

  saved.automatic!.internalContact!.contactId = "1";
  saved.owner = "different-owner";
  const wrongOwner = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(wrongOwner.items[0].action).toBe("RESEARCH");
});
it("stops on an incomplete company, preserves the attempt and never retries it", async () => {
  const f = await fixture(3, true);
  const result = await prepareProspects(actor, "localhost:3000", true, "1", f.deps);
  expect(f.deps.create).toHaveBeenCalledOnce();
  expect(result.items[0].action).toBe("BLOCKED");
  expect(result.items[0].receipt?.state).toBe("BLOCKED");
  expect(result.lastAction).toMatchObject({ paidAuthorized: true, outcome: "BLOCKED" });
  expect(result.items[0].result?.directDrafts).toBeUndefined();
  expect(result.warnings.join()).toContain("remaining companies were not attempted");
});
it("retains a crash checkpoint and blocks a second worker/click", async () => {
  const f = await fixture(1);
  f.deps.create.mockRejectedValueOnce(Error("FICTIONAL_INTERRUPTION"));
  await expect(prepareProspects(actor, "localhost:3000", true, "1", f.deps)).rejects.toThrow(
    "FICTIONAL_INTERRUPTION",
  );
  const reopened = await getPreparationPlan(actor, "localhost:3000", f.deps);
  expect(reopened.items[0].action).toBe("BLOCKED");
  expect(reopened.items[0].latestAttempt).toMatchObject({
    paidAuthorized: true,
    stage: "WRITING_REVIEW",
    outcome: "BLOCKED",
    failureCode: "PREPARATION_UNAVAILABLE",
    actualCalls: null,
    actualEstimatedUsd: null,
  });
  expect(JSON.stringify(reopened.items[0].latestAttempt)).not.toContain("FICTIONAL_INTERRUPTION");
  await prepareProspects(actor, "localhost:3000", true, "1", f.deps);
  expect(f.deps.create).toHaveBeenCalledOnce();
});
it("fails closed for wrong actor/host, disabled AI and conflicting provider requests", async () => {
  const f = await fixture(1);
  await expect(prepareProspects("other", "localhost:3000", true, "1", f.deps)).rejects.toThrow(
    "LOCAL_COMPANY_ONLY",
  );
  await expect(prepareProspects(actor, "evil.example", true, "1", f.deps)).rejects.toThrow(
    "LOCAL_COMPANY_ONLY",
  );
  vi.stubEnv("LOCAL_INTERNAL_SALES_ENABLED", "false");
  await expect(prepareProspects(actor, "localhost:3000", true, "1", f.deps)).rejects.toThrow(
    "PREPARATION_AI_NOT_READY",
  );
  expect(f.deps.create).not.toHaveBeenCalled();
});

it("blocks any pending request before preparation and preserves its reservation", async () => {
  const f = await fixture(1);
  await f.deps.budget.change(actor, (state) => {
    state.pending.existing = {
      day: "2026-10-15",
      month: "2026-10",
      reservedUsd: 0.2,
      until: "2026-10-15T23:59:59Z",
      provider: "OPENAI",
    };
  });
  const before = await f.deps.budget.get(actor);
  await expect(prepareProspects(actor, "localhost:3000", true, "1", f.deps)).rejects.toThrow(
    "PREPARATION_AI_NOT_READY",
  );
  expect(f.deps.create).not.toHaveBeenCalled();
  expect(await f.deps.budget.get(actor)).toEqual(before);
});
it("prevents simultaneous preparation while the first action is waiting", async () => {
  const f = await fixture(1);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.deps.documents = async () => {
    entered();
    await held;
    return [];
  };
  const first = prepareProspects(actor, "localhost:3000", false, "1", f.deps);
  await waiting;
  await expect(prepareProspects(actor, "localhost:3000", false, "1", f.deps)).rejects.toThrow(
    "PREPARATION_BUSY",
  );
  release();
  await first;
  expect(f.deps.create).not.toHaveBeenCalled();
});

it("refreshes only stale Outreach evidence and stops a known active sequence before paid work", async () => {
  const f = await fixture(1);
  const old = snapshot("1");
  old.collectedAt = "2026-10-13T12:00:00.000Z";
  await f.deps.store.save(actor, [old]);
  const collect = vi.fn(async () => ({
    observations: [observation("activeSequence", true, "OUTREACH", { hubspotRecordId: "1" })],
    blockers: [],
  }));
  const deps = { ...f.deps, outreach: () => ({ provider: "OUTREACH" as const, collect }) };
  const result = await prepareProspects(actor, "localhost:3000", true, "1", deps);
  expect(collect).toHaveBeenCalledOnce();
  expect(f.deps.create).not.toHaveBeenCalled();
  expect(result.items).toHaveLength(0);
  expect(result.excluded[0].reason).toContain("activeSequence");
  const saved = (await f.deps.store.list(actor))[0] as EvidenceSnapshot;
  expect(saved.observations).toEqual(expect.arrayContaining(old.observations));
  expect(
    saved.provenanceAtCollection.some((p) => p.field === "activeSequence" && p.value === true),
  ).toBe(true);
});
