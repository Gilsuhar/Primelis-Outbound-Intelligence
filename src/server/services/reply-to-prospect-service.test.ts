import { describe, expect, it } from "vitest";

import type {
  ReplyKnowledgeRecord,
  ReplyToProspectInput,
  ReplyToProspectResult,
} from "@/features/reply-to-prospect/types";

import {
  DeterministicReplyProvider,
  enforceReplyConversationStage,
} from "./reply-to-prospect-provider";
import {
  classifyProspectMessage,
  generateReplyToProspect,
  type ReplyPersistence,
} from "./reply-to-prospect-service";
import { detectConversationStage } from "./reply-conversation-stage";

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

  it("uses full LinkedIn thread context and follows up after deck and commercials", async () => {
    const thread = [
      "Hi Jack- thanks for connecting, how do you handle branded ads when no competitors are bidding on your brand?",
      "Do you have a deck I can checkout?",
      "Hey again Jack, As promised, see attached the deck, which includes an overview of the technology, integration details, NinjaTrader examples, case studies and more.",
      "I see. Thanks. Whats the fee structure look like? How do the commercials work?",
      "Hi Jack, Our pricing is outlined on the second to last slide of the presentation. We charge a flat monthly fee based on your brand ad spend. Typically, fintech clients see 30-60% savings, with ROI ranging from 5x to 20x the cost of the technology.",
      "Hi Jack, would love to hear your thoughts whenever you have a chance.",
    ].join("\n\n");
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateReplyToProspect(
      {
        ...baseInput,
        channel: "LINKEDIN",
        prospectMessage: thread,
        companyName: "NinjaTrader",
        desiredTone: "DIRECT",
        desiredLength: "SHORT",
      },
      { persistence: adapter },
    );

    expect(detectConversationStage(thread)).toMatchObject({
      deckRequestIsOld: true,
      pricingAlreadyAnswered: true,
      needsFollowUpAfterCommercials: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recommendedReply).toMatch(/fee structure|Signal value|short technical walkthrough|pressure-test/i);
      expect(result.data.shorterAlternative).toMatch(/pricing\/value tradeoff|pressure-test/i);
      expect(result.data.recommendedReply).not.toMatch(/send (the )?deck again|happy to send it|two relevant bullets/i);
      expect(result.data.safetyWarnings).toEqual(
        expect.arrayContaining([
          "Conversation history shows the deck was already sent; do not offer to send it again.",
          "Conversation history shows commercials were already answered; reply should move toward feedback or a walkthrough.",
        ]),
      );
    }
  });

  it("blocks OpenAI from repeating commercials after they were already answered", async () => {
    const thread = [
      "Hi Jack- thanks for connecting, how do you handle branded ads when no competitors are bidding on your brand?",
      "Do you have a deck I can checkout?",
      "Hey again Jack, As promised, see attached the deck, which includes an overview of the technology, integration details, NinjaTrader examples, case studies and more.",
      "I see. Thanks. Whats the fee structure look like? How do the commercials work?",
      "Hi Jack, Our pricing is outlined on the second to last slide of the presentation. We charge a flat monthly fee based on your brand ad spend. Typically, fintech clients see 30-60% savings, with ROI ranging from 5x to 20x the cost of the technology.",
      "Hi Jack, would love to hear your thoughts whenever you have a chance.",
    ].join("\n\n");
    const input = {
      ...baseInput,
      channel: "LINKEDIN" as const,
      prospectMessage: thread,
      companyName: "NinjaTrader",
      desiredTone: "DIRECT" as const,
      desiredLength: "SHORT" as const,
    };
    const fallback = await new DeterministicReplyProvider().generate({
      input,
      intents: ["DECK_REQUEST"],
      records: [knowledge({ id: "product-truth" })],
      safetyWarnings: [],
    });

    const guarded = enforceReplyConversationStage(input, fallback, {
      recommendedReply:
        "On the commercials: Signal is a flat monthly fee tied to your trailing 12-month brand spend in Google Ads, across the markets you activate.",
      shorterAlternative:
        "Thanks for the note. The core idea is simple: compare paid brand coverage with organic results before deciding where spend is still needed. Do you already track this today?",
    });

    expect(guarded.recommendedReply).toBe(fallback.recommendedReply);
    expect(guarded.shorterAlternative).toBe(fallback.shorterAlternative);
    expect(guarded.recommendedReply).not.toMatch(/On the commercials|flat monthly fee|trailing 12-month/i);
    expect(guarded.shorterAlternative).not.toMatch(/Do you already track this today/i);
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
