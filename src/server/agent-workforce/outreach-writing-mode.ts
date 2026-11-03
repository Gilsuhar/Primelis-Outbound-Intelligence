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

export function writingModeInstruction(mode?: OutreachWritingMode) {
  if (mode !== "INSIGHT_LED") return "";
  return "MODE OVERRIDE: INSIGHT_LED, research-limited editorial drafting. No verified company/prospect research is supplied. Treat intake title only as unverified context, never assert responsibilities or employment. Supersede company-specific/verified-role requirements in the general rubric below: a concrete branded-search decision or tradeoff, phrased conditionally or as an open question, can justify outreach without company facts. Do not imply an audit or any account observation. Use only approved product knowledge for factual claims; cite those knowledge IDs in the assertion ledger. Empty research IDs are correct. Explore original approaches and avoid generic benefits or a title recital. OIQ companyInsight means professional insight specificity (30), verifiedEvidence means grounding/accuracy in approved knowledge (25), other weights unchanged. The company-name swap test is diagnostic, not an automatic cap in this mode; generic professional insight still merits low points. Missing company/SERP evidence is a limitation, not missing core evidence unless the draft alleges an observation. In coreInsight.factIds and observationIds use only real supplied IDs; use empty lists when absent. Explicitly evaluate unsupported implications even in questions. No review score grants send eligibility. ";
}
