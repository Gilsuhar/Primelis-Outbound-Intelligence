import { describe, expect, it } from "vitest";

import {
  classifyReplyIntent,
  normalizeReplyConversation,
  validateReplyOutput,
} from "./reply-intelligence";
import type { ReplyToProspectInput } from "./types";

const base: ReplyToProspectInput = {
  prospectMessage: "Tell me more.",
  channel: "EMAIL",
  desiredTone: "CONSULTATIVE",
  desiredLength: "STANDARD",
};

function classify(prospectMessage: string) {
  return classifyReplyIntent({ ...base, prospectMessage });
}

describe("reply intelligence", () => {
  it.each([
    ["Sounds interesting.", "INTERESTED"],
    ["Sounds interesting. What data do you use?", "DATA_SOURCE_QUESTION"],
    ["Can you send more info?", "REQUESTS_MORE_INFORMATION"],
    ["Do you have a deck?", "DECK_REQUEST"],
    ["What is the pricing?", "REQUESTS_PRICING"],
    ["What does the fee structure look like?", "REQUESTS_FEE_STRUCTURE"],
    ["What value or ROI should we expect?", "REQUESTS_ROI_OR_VALUE"],
    ["How does the data source work?", "DATA_SOURCE_QUESTION"],
    ["We already have a dashboard for this.", "EXISTING_DASHBOARD"],
    ["We built an internal tool for brand search.", "EXISTING_INTERNAL_TOOL"],
    ["Our agency handles paid search.", "AGENCY_HANDLES_IT"],
    ["We already use Revvim.", "USES_ANOTHER_VENDOR"],
    ["We do not want to pause branded ads.", "DOES_NOT_WANT_TO_PAUSE"],
    ["This is not a priority right now.", "NOT_A_PRIORITY"],
    ["I am on vacation until August.", "VACATION_OR_UNAVAILABLE"],
    ["You should speak with our Head of Paid Search.", "REFERRAL"],
    ["Wrong contact, not my area.", "WRONG_CONTACT"],
    ["No thanks, we are all set.", "POLITE_DECLINE"],
    ["Stop emailing me.", "STRONG_REJECTION"],
  ] as const)("classifies %s", (message, intent) => {
    expect(classify(message).primaryIntent).toBe(intent);
  });

  it("preserves latest prospect message and keeps seller history separate", () => {
    const turns = normalizeReplyConversation(
      [
        "Prospect: Do you have a deck?",
        "Seller: As promised, see attached the deck.",
        "Prospect: What does the fee structure look like?",
      ].join("\n\n"),
    );

    expect(turns.find((turn) => turn.isLatest)).toMatchObject({
      role: "PROSPECT",
      text: "What does the fee structure look like?",
    });
    expect(turns.filter((turn) => turn.role === "SELLER").map((turn) => turn.text)).toEqual([
      "As promised, see attached the deck.",
    ]);
  });

  it("rejects internal labels, invented attachments, pricing figures, and duplicate paragraphs", () => {
    const analysis = classify("What is the pricing?");
    expect(
      validateReplyOutput(
        {
          recommendedReply: "primaryIntent: REQUESTS_PRICING",
          shorterAlternative: "Commercials depend on scope.",
        },
        analysis,
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateReplyOutput(
        {
          recommendedReply: "I attached the deck and booked a meeting.",
          shorterAlternative: "Commercials depend on scope.",
        },
        analysis,
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateReplyOutput(
        {
          recommendedReply: "It is $10k/month.",
          shorterAlternative: "Commercials depend on scope.",
        },
        analysis,
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateReplyOutput(
        {
          recommendedReply: "Commercials depend on scope.\n\nCommercials depend on scope.",
          shorterAlternative: "Commercials depend on scope.",
        },
        analysis,
      ),
    ).toMatchObject({ ok: false });
  });
});
