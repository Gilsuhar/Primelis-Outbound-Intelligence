import { describe, expect, it } from "vitest";

import type {
  ReplyKnowledgeRecord,
  ReplyToProspectInput,
  ReplyToProspectResult,
} from "@/features/reply-to-prospect/types";

import { DeterministicReplyProvider } from "./reply-to-prospect-provider";
import {
  classifyProspectMessage,
  generateReplyToProspect,
  type ReplyPersistence,
} from "./reply-to-prospect-service";

const baseInput: ReplyToProspectInput = {
  prospectMessage: "We already use another tool. How does Signal think about brand search?",
  channel: "EMAIL",
  desiredTone: "CONSULTATIVE",
  desiredLength: "STANDARD",
  companyName: "Acme",
  creatorId: "seed-sales-user",
};

function knowledge(overrides: Partial<ReplyKnowledgeRecord>): ReplyKnowledgeRecord {
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

function persistence(records: ReplyKnowledgeRecord[]) {
  const persisted: Array<{
    creatorId: string;
    request: ReplyToProspectInput;
    result: Omit<ReplyToProspectResult, "draftId">;
  }> = [];
  const adapter: ReplyPersistence = {
    retrieveEligibleKnowledge: async (input) =>
      records.filter(
        (record) =>
          (record.channels.includes(input.channel) || record.channels.includes("INTERNAL")) &&
          !record.usageRestrictions &&
          record.sourceIds.length > 0 &&
          record.approvedText.length > 0 &&
          !(record.type === "OBJECTION" && /adthena|revvim|competitor/i.test(record.approvedText)),
      ),
    persistDraft: async (draft) => {
      persisted.push(draft);
      return "draft-id";
    },
  };
  return { adapter, persisted };
}

describe("Reply to Prospect service", () => {
  it("classifies prospect messages into useful categories", () => {
    expect(classifyProspectMessage(baseInput.prospectMessage)).toEqual(
      expect.arrayContaining(["EXISTING_VENDOR", "METHODOLOGY_QUESTION"]),
    );
  });

  it("retrieves only approved eligible records supplied by the persistence boundary", async () => {
    const { adapter } = persistence([
      knowledge({ id: "approved-email" }),
      knowledge({ id: "linkedin-only", channels: ["LINKEDIN"] }),
      knowledge({ id: "restricted", usageRestrictions: "Internal only." }),
      knowledge({ id: "needs-review-excluded", sourceIds: [] }),
    ]);

    const result = await generateReplyToProspect(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["approved-email"]);
    }
  });

  it("enforces LinkedIn channel eligibility", async () => {
    const { adapter } = persistence([
      knowledge({ id: "email-only", channels: ["EMAIL"] }),
      knowledge({ id: "internal-rule", type: "MESSAGE_EXAMPLE", channels: ["INTERNAL"] }),
    ]);

    const result = await generateReplyToProspect(
      { ...baseInput, channel: "LINKEDIN" },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["internal-rule"]);
    }
  });

  it("excludes competitor objection claims", async () => {
    const { adapter } = persistence([
      knowledge({
        id: "competitor-objection",
        type: "OBJECTION",
        approvedText: "Adthena is weaker than Signal.",
      }),
      knowledge({ id: "product-truth" }),
    ]);

    const result = await generateReplyToProspect(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["product-truth"]);
    }
  });

  it("does not introduce commercial terms in generated replies", async () => {
    const { adapter } = persistence([
      knowledge({
        approvedText: "Signal can discuss pricing and POC terms only when approved.",
      }),
    ]);

    const result = await generateReplyToProspect(
      { ...baseInput, prospectMessage: `${baseInput.prospectMessage} What is the price?` },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recommendedReply).not.toMatch(/\b(pricing|price|poc|proof of concept)\b/i);
      expect(result.data.shorterAlternative).not.toMatch(
        /\b(pricing|price|poc|proof of concept)\b/i,
      );
    }
  });

  it("answers LinkedIn deck requests directly without product jargon", async () => {
    const { adapter } = persistence([
      knowledge({
        approvedText:
          "Solo: the brand is the only advertiser and Signal may pause or reduce bids. Competitive: competitors are present and Signal seeks efficient CPC. Signal combines SERP conditions with Google Ads, Google Search Console and conversion-source data.",
      }),
    ]);

    const result = await generateReplyToProspect(
      {
        ...baseInput,
        channel: "LINKEDIN",
        prospectMessage:
          "Do you have a deck I can checkout?",
        companyName: "Nike",
        contactRole: "Head of Paid Search",
        desiredLength: "SHORT",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.detectedIntent).toContain("DECK_REQUEST");
      expect(result.data.recommendedReply).toMatch(/Yes, happy to send/i);
      expect(result.data.recommendedReply).toMatch(/deck/i);
      expect(result.data.recommendedReply).toMatch(/two bullets|match your setup/i);
      expect(result.data.recommendedReply).not.toMatch(
        /\b(Solo|Competitive|Ghost|SERP|conversion-source|Google Search Console|reduce bids)\b/i,
      );
      expect(result.data.recommendedReply).not.toMatch(/Would it be useful if/i);
      expect(result.data.recommendedReply.length).toBeLessThan(420);
    }
  });

  it("answers methodology questions in plain language before pitching", async () => {
    const { adapter } = persistence([
      knowledge({
        approvedText:
          "Signal combines SERP conditions with Google Ads, Google Search Console and conversion-source data to evaluate blended paid and organic traffic.",
      }),
    ]);

    const result = await generateReplyToProspect(
      {
        ...baseInput,
        channel: "LINKEDIN",
        prospectMessage:
          "How do you handle branded ads when no competitors are bidding on the brand?",
        companyName: "Nike",
        desiredLength: "SHORT",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recommendedReply).toMatch(/Good question|look at it/i);
      expect(result.data.recommendedReply).toMatch(/paid coverage|organic/i);
      expect(result.data.recommendedReply).not.toMatch(
        /\b(SERP|conversion-source|Google Search Console|solo|ghost|competitive)\b/i,
      );
      expect(result.data.recommendedReply.length).toBeLessThan(420);
    }
  });

  it("handles Revvim existing-vendor replies without generic replacement language", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateReplyToProspect(
      {
        ...baseInput,
        channel: "LINKEDIN",
        prospectMessage: "We already work with Revvim",
        desiredTone: "DIRECT",
        desiredLength: "SHORT",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.detectedIntent).toContain("EXISTING_VENDOR");
      expect(result.data.recommendedReply).toMatch(/Revvim is a serious setup/i);
      expect(result.data.recommendedReply).toMatch(/pause, lower CPC, or stay covered/i);
      expect(result.data.recommendedReply).toMatch(/decision automated/i);
      expect(result.data.recommendedReply).not.toMatch(/replace|replacing/i);
      expect(result.data.recommendedReply).not.toMatch(/better than|weaker than/i);
    }
  });

  it("returns source references and persists generated drafts separately", async () => {
    const { adapter, persisted } = persistence([knowledge({ id: "knowledge-1" })]);

    const result = await generateReplyToProspect(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sourceReferences).toEqual([
        { id: "source-1", title: "Approved source", sourceDate: "2026-01-01" },
      ]);
      expect(result.data.draftId).toBe("draft-id");
      expect(persisted[0].result.recordsUsed.map((record) => record.id)).toEqual(["knowledge-1"]);
      expect(persisted[0].result.provider.providerName).toBe("deterministic-development");
    }
  });

  it("uses deterministic fallback without an API key", async () => {
    const provider = new DeterministicReplyProvider();

    expect(provider.metadata).toMatchObject({
      providerName: "deterministic-development",
      deterministic: true,
    });
  });

  it("returns structured errors for invalid input", async () => {
    const { adapter } = persistence([]);

    const result = await generateReplyToProspect(
      { prospectMessage: "short" },
      { persistence: adapter },
    );

    expect(result).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Reply to Prospect input is malformed.",
    });
  });

  it("does not mutate original knowledge records", async () => {
    const original = knowledge({ id: "stable" });
    const { adapter } = persistence([original]);

    await generateReplyToProspect(baseInput, { persistence: adapter });

    expect(original).toEqual(knowledge({ id: "stable" }));
  });
});
