import type { BuildSequenceInput, SequenceStep } from "./types";

// Seller attestation is required: a pasted keyword or availability checkbox
// alone is never evidence of a Google search result.
export function hasVerifiedSerpScreenshot(input: BuildSequenceInput, now = new Date()) {
  const date = input.observationDate ?? "";
  const parsed = new Date(`${date}T00:00:00Z`);
  const brand = input.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const keyword = (input.brandKeyword ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return Boolean(
    input.screenshotAvailable &&
    input.screenshotManuallyVerified &&
    input.screenshotSource === "GOOGLE_SERP" &&
    input.screenshotUrl &&
    /^https:\/\//i.test(input.screenshotUrl) &&
    brand.length >= 2 &&
    keyword.includes(brand) &&
    input.marketCountry?.trim() &&
    /^(desktop|mobile|tablet)$/i.test(input.device ?? "") &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    parsed.getTime() <= now.getTime() &&
    input.screenshotShows?.trim() &&
    !/generic|not (?:from|of)|example only/i.test(input.screenshotContext ?? ""),
  );
}

export function applySequenceReviewPolicy(
  input: BuildSequenceInput,
  steps: SequenceStep[],
  hasApprovedProof = false,
) {
  const subject = steps[0]?.subjectLine?.replace(/^Re:\s*/i, "") ?? "Branded search visibility";
  return steps.map((step): SequenceStep => {
    const evidenceHold = step.stepNumber === 2 && !hasVerifiedSerpScreenshot(input);
    const proofHold = step.stepNumber === 3 && !hasApprovedProof;
    return {
      ...step,
      subjectLine: step.stepNumber === 1 ? subject : `Re: ${subject}`,
      threadMode: step.stepNumber === 1 ? "NEW_THREAD" : "REPLY_TO_FIRST",
      approvalStatus: evidenceHold || proofHold ? "HOLD" : "PENDING_HUMAN_APPROVAL",
      holdReason: evidenceHold
        ? "Manually verify a prospect Google SERP screenshot with keyword, market, device, observation date, source and screenshot URL."
        : proofHold
          ? "Select an approved source-backed case study before approving Email 3."
          : undefined,
    };
  });
}

export function serpEvidenceBody(input: BuildSequenceInput) {
  return hasVerifiedSerpScreenshot(input)
    ? `In the Google SERP screenshot for "${input.brandKeyword}" (${input.marketCountry}, ${input.device}, ${input.observationDate}), the observed search-page coverage was: ${input.screenshotShows}`
    : "A Google SERP visibility check would compare branded-search coverage with bid decisions. A verified screenshot is needed before drawing any account-specific conclusion.";
}
