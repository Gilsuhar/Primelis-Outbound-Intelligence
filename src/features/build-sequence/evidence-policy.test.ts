import { describe, expect, it } from "vitest";
import { applySequenceReviewPolicy, hasVerifiedSerpScreenshot } from "./evidence-policy";
import type { BuildSequenceInput, SequenceStep } from "./types";

const input: BuildSequenceInput = {
  companyName: "Acme",
  contactRole: "Head of Paid Search",
  observedTrigger: "Review coverage",
  primaryChannel: "EMAIL",
  sequenceLength: 4,
  desiredTone: "DIRECT",
  desiredOverallDuration: "15 days",
  screenshotAvailable: true,
  screenshotManuallyVerified: true,
  screenshotSource: "GOOGLE_SERP",
  screenshotUrl: "https://evidence.example/acme.png",
  brandKeyword: "acme shoes",
  marketCountry: "US",
  device: "desktop",
  observationDate: "2026-01-01",
  screenshotShows: "Acme's ad appeared above its organic result.",
};
const now = new Date("2026-01-02T12:00:00Z");

describe("Manual Google SERP evidence policy", () => {
  it("accepts a complete manually verified, dated Google screenshot", () => {
    expect(hasVerifiedSerpScreenshot(input, now)).toBe(true);
  });
  it.each([
    "screenshotAvailable",
    "screenshotManuallyVerified",
    "screenshotSource",
    "screenshotUrl",
    "brandKeyword",
    "marketCountry",
    "device",
    "observationDate",
    "screenshotShows",
  ] as const)("holds when %s is missing", (field) => {
    expect(hasVerifiedSerpScreenshot({ ...input, [field]: undefined }, now)).toBe(false);
  });
  it.each([
    { observationDate: "2026-02-30" },
    { observationDate: "2027-01-01" },
    { brandKeyword: "OtherCompany pricing" },
    { screenshotUrl: "javascript:alert(1)" },
    { device: "unknown" },
    { screenshotContext: "Generic example, not from Acme" },
  ])("rejects invalid or generic evidence %j", (override) => {
    expect(hasVerifiedSerpScreenshot({ ...input, ...override }, now)).toBe(false);
  });
  it("never promotes any step to approved and keeps the replies in the first thread", () => {
    const steps = Array.from({ length: 4 }, (_, i) => ({
      stepNumber: i + 1,
      channel: "EMAIL",
      subjectLine: `Subject ${i}`,
      delay: "Day 1",
      purpose: "FIRST_TOUCH_RELEVANCE",
      channelRationale: "Email",
      messageBody: "Draft",
      cta: "",
      claimsUsed: [],
      sourceIds: [],
    })) as SequenceStep[];
    const reviewed = applySequenceReviewPolicy(
      { ...input, screenshotManuallyVerified: false },
      steps,
    );
    expect(reviewed.map((step) => step.approvalStatus)).toEqual([
      "PENDING_HUMAN_APPROVAL",
      "HOLD",
      "HOLD",
      "PENDING_HUMAN_APPROVAL",
    ]);
    expect(reviewed.map((step) => step.subjectLine)).toEqual([
      "Subject 0",
      "Re: Subject 0",
      "Re: Subject 0",
      "Re: Subject 0",
    ]);
    expect(reviewed.map((step) => step.threadMode)).toEqual([
      "NEW_THREAD",
      "REPLY_TO_FIRST",
      "REPLY_TO_FIRST",
      "REPLY_TO_FIRST",
    ]);
  });
});
