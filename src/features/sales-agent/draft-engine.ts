import { z } from "zod";
import type { IntakeContact } from "./evidence";
import type { AgentPlan } from "./orchestrator";
import { MAX_EVIDENCE_AGE_DAYS, parseTimestamp } from "./qualification";

export const researchKinds = ["COMPANY_FACT", "PERSON_FACT", "SERP", "CASE_STUDY"] as const;
const httpsUrl = z
  .string()
  .url()
  .max(1000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an HTTPS source URL without credentials");
/** Research cannot establish qualification or clear suppression/history requirements. */
export const draftResearchSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    contactId: z.string().trim().min(1).max(200),
    companyDomain: z.string().trim().min(1).max(240),
    kind: z.enum(researchKinds),
    text: z.string().trim().min(10).max(240),
    sourceUrl: httpsUrl,
    observedAt: z.string().max(80),
    verifiedAt: z.string().max(80).nullable(),
    manuallyVerified: z.boolean(),
    approvedForOutbound: z.boolean().default(false),
    caseStudyId: z.string().trim().min(1).max(200).optional(),
    keyword: z.string().trim().max(120).optional(),
    market: z.string().trim().max(100).optional(),
    device: z.enum(["desktop", "mobile", "tablet"]).optional(),
    screenshotUrl: httpsUrl.optional(),
    searchEngine: z.literal("GOOGLE").optional(),
  })
  .strict();
export type DraftResearch = z.infer<typeof draftResearchSchema>;
export type ResearchFinding = {
  kind: DraftResearch["kind"];
  status: "VERIFIED" | "MISSING" | "STALE" | "INVALID" | "CONFLICT";
  reason: string;
  evidence: DraftResearch[];
};
export type SalesAgentEmail = {
  step: number;
  day: number;
  angle: string;
  channel: "EMAIL";
  subject: string;
  body: string;
  cta: string;
  threadMode: "NEW_THREAD" | "REPLY_TO_FIRST";
  status: "PENDING_HUMAN_REVIEW" | "REQUIRES_RESEARCH";
  missingEvidence: string[];
  sources: { id: string; url: string; verifiedAt: string }[];
};

export function reviewDraftResearch(
  contact: IntakeContact,
  research: DraftResearch[],
  now: Date,
): ResearchFinding[] {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid research clock");
  return researchKinds.map((kind) => {
    // Do not return another contact's facts, even as rejected provenance.
    const candidates = research.filter(
      (item) => item.contactId === contact.hubspotRecordId && item.kind === kind,
    );
    const usable = candidates.filter((item) => {
      if (!draftResearchSchema.safeParse(item).success) return false;
      const observed = parseTimestamp(item.observedAt);
      const verified = item.verifiedAt ? parseTimestamp(item.verifiedAt) : null;
      if (
        !contact.companyDomain ||
        item.companyDomain.toLowerCase() !== contact.companyDomain.toLowerCase() ||
        !item.manuallyVerified ||
        observed === null ||
        verified === null ||
        observed > verified ||
        verified > now.getTime() ||
        now.getTime() - observed > MAX_EVIDENCE_AGE_DAYS * 86_400_000
      )
        return false;
      if (kind === "CASE_STUDY" && (!item.approvedForOutbound || !item.caseStudyId)) return false;
      if (
        kind === "SERP" &&
        (!item.keyword ||
          !item.market ||
          !item.device ||
          !item.screenshotUrl ||
          item.searchEngine !== "GOOGLE")
      )
        return false;
      return true;
    });
    // Fresh contradictory observations remain a conflict even when only one is verified.
    const current = candidates.filter((item) => {
      const observed = parseTimestamp(item.observedAt);
      return (
        observed !== null &&
        observed <= now.getTime() &&
        now.getTime() - observed <= MAX_EVIDENCE_AGE_DAYS * 86_400_000
      );
    });
    const canonical = (item: DraftResearch) =>
      JSON.stringify([
        item.text.trim().toLowerCase(),
        item.keyword,
        item.market,
        item.device,
        item.screenshotUrl,
      ]);
    if (usable.length && new Set(current.map(canonical)).size > 1)
      return {
        kind,
        status: "CONFLICT",
        reason: `Resolve conflicting ${kind} observations before drafting`,
        evidence: candidates,
      };
    if (usable.length)
      return {
        kind,
        status: "VERIFIED",
        reason: "Current, manually verified and source-linked; scoped to this contact and company",
        evidence: usable,
      };
    const stale = candidates.some((item) => {
      const at = parseTimestamp(item.observedAt);
      return at !== null && now.getTime() - at > MAX_EVIDENCE_AGE_DAYS * 86_400_000;
    });
    return {
      kind,
      status: !candidates.length ? "MISSING" : stale ? "STALE" : "INVALID",
      reason:
        kind === "SERP"
          ? "Provide a current, manually verified Google screenshot, keyword, market, device and source"
          : kind === "CASE_STUDY"
            ? "Provide current source-backed case-study wording explicitly approved for outbound"
            : `Verify a current ${kind === "PERSON_FACT" ? "person responsibility or priority" : "company business fact"} with its source`,
      evidence: candidates,
    };
  });
}

/** Pure drafting only: no provider calls, CRM writes, sending or enrollment. */
export function buildSalesAgentDrafts(
  contact: IntakeContact,
  plan: AgentPlan,
  research: DraftResearch[] = [],
  now = new Date(),
) {
  const findings = reviewDraftResearch(contact, research, now);
  const blocked = plan.decision.status !== "READY" || plan.prospectId !== contact.hubspotRecordId;
  const emails: SalesAgentEmail[] = [];
  const get = (kind: DraftResearch["kind"]) => {
    const finding = findings.find((item) => item.kind === kind)!;
    return finding.status === "VERIFIED" ? finding.evidence[0] : undefined;
  };
  if (!blocked) {
    const company = get("COMPANY_FACT"),
      person = get("PERSON_FACT"),
      serp = get("SERP"),
      proof = get("CASE_STUDY");
    // Identity labels are intake data, not independently verified personalization.
    const subject = "A question about branded search";
    const specs = [
      {
        day: 1,
        angle: "Business relevance and branded-search visibility",
        required: ["COMPANY_FACT", "PERSON_FACT"],
        used: [company, person],
        body:
          company && person
            ? `${company.text}\n\n${person.text}\n\nSignal monitors competitive conditions to help advertisers decide when branded-search coverage needs defending.`
            : "[Research required: verify a company business fact and the person's current responsibility before writing the opener.]",
        cta: "Is branded-search control something you’re reviewing?",
      },
      {
        day: 4,
        angle: "One dated Google SERP observation",
        required: ["SERP"],
        used: [serp],
        body: serp
          ? `The Google screenshot for “${serp.keyword}” (${serp.market}, ${serp.device}, ${serp.observedAt.slice(0, 10)}) records this observation:\n\n${serp.text}\n\nThat is one snapshot, rather than a conclusion about ongoing competitor activity or wasted spend.`
          : "[Research required: add a manually verified Google SERP screenshot with keyword, market, device, observation date and source. No competitor activity has been inferred.]",
        cta: "Would reviewing that snapshot together be useful?",
      },
      {
        day: 9,
        angle: "Bid decisions and approved customer proof",
        required: ["CASE_STUDY"],
        used: [proof],
        body: `Signal helps teams connect changing competitive conditions with branded-search bidding decisions.\n\n${proof ? proof.text : "[Research required: add an approved, source-backed customer example. No customer result or savings percentage is assumed.]"}`,
        cta: "Would a short explanation of the approach help?",
      },
      {
        day: 15,
        angle: "Low-pressure close",
        required: [],
        used: [],
        body: "I’ll leave this here for now. If branded-search control becomes a priority, I’m happy to pick it up again.",
        cta: "Would another time be better?",
      },
    ];
    specs.forEach((spec, index) => {
      const missingEvidence = spec.required.filter((kind) => !get(kind as DraftResearch["kind"]));
      emails.push({
        step: index + 1,
        day: spec.day,
        angle: spec.angle,
        channel: "EMAIL",
        subject: index ? `Re: ${subject}` : subject,
        body: spec.body,
        cta: spec.cta,
        threadMode: index ? "REPLY_TO_FIRST" : "NEW_THREAD",
        status: missingEvidence.length ? "REQUIRES_RESEARCH" : "PENDING_HUMAN_REVIEW",
        missingEvidence,
        sources: spec.used
          .filter((item): item is DraftResearch => Boolean(item))
          .map((item) => ({ id: item.id, url: item.sourceUrl, verifiedAt: item.verifiedAt! })),
      });
    });
  }
  return {
    status: blocked
      ? ("BLOCKED" as const)
      : emails.some((email) => email.status === "REQUIRES_RESEARCH")
        ? ("REQUIRES_RESEARCH" as const)
        : ("PENDING_HUMAN_REVIEW" as const),
    qualificationStatus: plan.decision.status,
    reasons: blocked ? plan.decision.reasons : [],
    emails,
    findings,
    humanApprovalRequired: true as const,
    approved: false as const,
    canSend: false as const,
    canEnroll: false as const,
  };
}
