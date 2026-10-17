/**
 * Editorial strategy selection, independent of prospect eligibility and sending.
 *
 * A missing company-specific source must not be converted into an invented fact.
 * INSIGHT_LED is a role/problem hypothesis, never a verified company claim.
 */
export type OutreachWritingMode = "EVIDENCE_LED" | "INSIGHT_LED";
export type OutreachWritingPlan = {
  mode: OutreachWritingMode;
  label: string;
  instructions: string[];
  requiresHumanReview: true;
  allowsSending: false;
};
export function selectOutreachWritingMode(input: {
  hasVerifiedCompanyInsight: boolean;
  hasRelevantRoleContext: boolean;
  hasApprovedProductKnowledge: boolean;
}): OutreachWritingPlan | null {
  if (!input.hasRelevantRoleContext || !input.hasApprovedProductKnowledge) return null;
  if (input.hasVerifiedCompanyInsight)
    return {
      mode: "EVIDENCE_LED",
      label: "Company-specific, evidence-backed outreach",
      instructions: [
        "Use only traceable verified company findings, with exact supporting references.",
        "Connect the finding to the recipient's actual responsibilities without inventing ownership.",
        "Do not claim proven waste or incrementality without evidence.",
      ],
      requiresHumanReview: true,
      allowsSending: false,
    };
  return {
    mode: "INSIGHT_LED",
    label: "Professional insight, company research unavailable",
    instructions: [
      "Do not imply that the company was audited, observed, or researched successfully.",
      "Do not fabricate SERP results, competitor bids, spend, conversions, role responsibilities, or company initiatives.",
      "Lead with one specific, genuinely interesting paid-search decision or tradeoff, phrased as a hypothesis or question.",
      "Use approved Signal product knowledge only; avoid generic flattery and promotional claims.",
      "Keep the email concise, natural, non-salesy, and clearly label it INSIGHT_LED / research-limited.",
      "Do not treat missing research as proof of email validity, employment, eligibility, or permission to send.",
    ],
    requiresHumanReview: true,
    allowsSending: false,
  };
}
