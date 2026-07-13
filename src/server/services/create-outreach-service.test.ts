import { describe, expect, it } from "vitest";

import type {
  CreateOutreachInput,
  CreateOutreachResult,
  OutreachKnowledgeRecord,
} from "@/features/create-outreach/types";

import { DeterministicOutreachProvider } from "./create-outreach-provider";
import { generateCreateOutreach, type CreateOutreachPersistence } from "./create-outreach-service";

const baseInput: CreateOutreachInput = {
  companyName: "Acme",
  companyWebsite: "https://example.invalid",
  contactFirstName: "Sam",
  contactRole: "VP Performance Marketing",
  industry: "Retail",
  companyContext: "Mid-market ecommerce brand",
  geographyOrMarkets: "US and UK",
  paidSearchContext: "Brand search spend appears active across several markets.",
  currentVendor: "Existing search platform",
  observedTrigger: "Hiring for paid search efficiency and market expansion.",
  channel: "EMAIL",
  messageType: "FIRST_TOUCH",
  desiredTone: "CONSULTATIVE",
  desiredLength: "STANDARD",
  internalNotes: "Keep this conservative.",
  creatorId: "seed-sales-user",
};

function knowledge(overrides: Partial<OutreachKnowledgeRecord>): OutreachKnowledgeRecord {
  return {
    id: "approved-product-truth",
    title: "Approved product truth",
    type: "PRODUCT_TRUTH",
    approvedText:
      "Signal evaluates paid and organic brand search together to support efficient decisions.",
    channels: ["EMAIL", "LINKEDIN", "INTERNAL"],
    sourceIds: ["source-1"],
    sourceTitles: ["Approved source"],
    sourceDates: ["2026-01-01"],
    ...overrides,
  };
}

function persistence(records: OutreachKnowledgeRecord[], actorRole = "SALES_USER") {
  const persisted: Array<{
    creatorId: string;
    request: CreateOutreachInput;
    result: Omit<CreateOutreachResult, "draftId">;
  }> = [];
  const adapter: CreateOutreachPersistence = {
    getActor: async (actorId) => ({ id: actorId, role: actorRole }),
    retrieveEligibleKnowledge: async (input) =>
      records.filter(
        (record) =>
          (record.channels.includes(input.channel) || record.channels.includes("INTERNAL")) &&
          !record.usageRestrictions &&
          record.sourceIds.length > 0 &&
          record.approvedText.length > 0 &&
          record.type !== "CASE_STUDY" &&
          !(record.type === "OBJECTION" && /adthena|revvim|competitor/i.test(record.approvedText)),
      ),
    persistDraft: async (draft) => {
      persisted.push(draft);
      return "outreach-draft-id";
    },
  };
  return { adapter, persisted };
}

describe("Create Outreach service", () => {
  it("retrieves only approved eligible knowledge from the persistence boundary", async () => {
    const { adapter } = persistence([
      knowledge({ id: "approved" }),
      knowledge({ id: "needs-review-excluded", sourceIds: [] }),
      knowledge({ id: "restricted-excluded", usageRestrictions: "Internal only." }),
    ]);

    const result = await generateCreateOutreach(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["approved"]);
    }
  });

  it("enforces channel restrictions", async () => {
    const { adapter } = persistence([
      knowledge({ id: "email-only", channels: ["EMAIL"] }),
      knowledge({ id: "internal-rule", type: "MESSAGE_EXAMPLE", channels: ["INTERNAL"] }),
    ]);

    const result = await generateCreateOutreach(
      { ...baseInput, channel: "LINKEDIN" },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["internal-rule"]);
    }
  });

  it("excludes case studies unless eligible under existing rules", async () => {
    const { adapter } = persistence([
      knowledge({ id: "case-study", type: "CASE_STUDY" as OutreachKnowledgeRecord["type"] }),
      knowledge({ id: "product-truth" }),
    ]);

    const result = await generateCreateOutreach(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["product-truth"]);
      expect(result.data.safetyNotes).toContain(
        "No case studies were used because none are currently eligible for this workflow.",
      );
    }
  });

  it("excludes competitor claims and blocks pricing or POC wording", async () => {
    const { adapter } = persistence([
      knowledge({
        id: "competitor-objection",
        type: "OBJECTION",
        approvedText: "Adthena is worse than Signal.",
      }),
      knowledge({
        id: "product-truth",
        approvedText: "Signal does not require POC pricing language.",
      }),
    ]);

    const result = await generateCreateOutreach(
      {
        ...baseInput,
        currentVendor: "Adthena",
        internalNotes: "Ask about pricing and POC.",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["product-truth"]);
      expect(result.data.recommendedMessage).not.toMatch(
        /\b(pricing|price|poc|proof of concept)\b/i,
      );
      expect(result.data.safetyNotes).toEqual(
        expect.arrayContaining([
          "Competitor-specific claims were excluded unless approved and source-backed.",
          "Pricing, POC, trial, discount, and commercial-offer language was blocked.",
        ]),
      );
    }
  });

  it("labels assumptions and missing context conservatively", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateCreateOutreach(
      {
        ...baseInput,
        companyWebsite: undefined,
        paidSearchContext: undefined,
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.data.detectedSignals.some((signal) => signal.confidence === "USER_PROVIDED"),
      ).toBe(true);
      expect(result.data.detectedSignals.some((signal) => signal.confidence === "INFERRED")).toBe(
        true,
      );
      expect(result.data.knowledgeLimitations).toEqual(
        expect.arrayContaining([
          "Company website was not provided, so account facts are treated conservatively.",
          "No verified paid-search context was provided.",
        ]),
      );
    }
  });

  it("changes persona emphasis by role", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);
    const paidSearch = await generateCreateOutreach(
      { ...baseInput, contactRole: "Paid Search Manager" },
      { persistence: adapter },
    );
    const cmo = await generateCreateOutreach(
      { ...baseInput, contactRole: "CMO" },
      { persistence: adapter },
    );

    expect(paidSearch.ok && paidSearch.data.personaGuidance.emphasis).toBe("operational control");
    expect(cmo.ok && cmo.data.personaGuidance.emphasis).toBe("governance");
  });

  it("returns email subject lines and LinkedIn connection text", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);
    const email = await generateCreateOutreach(baseInput, { persistence: adapter });
    const linkedIn = await generateCreateOutreach(
      { ...baseInput, channel: "LINKEDIN" },
      { persistence: adapter },
    );

    expect(email.ok && email.data.subjectLines).toHaveLength(3);
    expect(email.ok && email.data.connectionRequest).toBeUndefined();
    expect(linkedIn.ok && linkedIn.data.subjectLines).toEqual([]);
    expect(linkedIn.ok && linkedIn.data.connectionRequest).toContain("Open to connecting");
  });

  it("persists generated outreach separately as a draft", async () => {
    const { adapter, persisted } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateCreateOutreach(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.draftId).toBe("outreach-draft-id");
      expect(persisted[0].result.recordsUsed.map((record) => record.id)).toEqual(["product-truth"]);
      expect(persisted[0].result.provider.providerName).toBe("deterministic-development");
    }
  });

  it("does not mutate original knowledge records", async () => {
    const original = knowledge({ id: "stable" });
    const { adapter } = persistence([original]);

    await generateCreateOutreach(baseInput, { persistence: adapter });

    expect(original).toEqual(knowledge({ id: "stable" }));
  });

  it("uses deterministic fallback without an API key", async () => {
    const provider = new DeterministicOutreachProvider();

    expect(provider.metadata).toMatchObject({
      providerName: "deterministic-development",
      deterministic: true,
    });
  });

  it("returns structured errors for invalid input and unauthorized users", async () => {
    const { adapter } = persistence([]);
    const invalid = await generateCreateOutreach({ companyName: "" }, { persistence: adapter });
    const forbidden = await generateCreateOutreach(baseInput, {
      persistence: persistence([knowledge({})], "VIEWER").adapter,
    });

    expect(invalid).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Create Outreach input is malformed.",
    });
    expect(forbidden).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Only authorized sales or knowledge users can create outreach drafts.",
    });
  });
});
