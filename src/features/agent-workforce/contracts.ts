import { z } from "zod";

/**
 * Contracts for the autonomous intelligence pipeline.
 * These objects are NOT approved for sending or Outreach enrollment.
 */
const httpsSource = z.object({
  id: z.string().min(1),
  url: z.string().url().refine((url) => {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  }),
  title: z.string().min(1),
  observedAt: z.string().datetime({ offset: true }),
  excerpt: z.string().min(1),
  sourceType: z.enum(["COMPANY_SITE", "PUBLIC_WEB", "AUTHORIZED_PROVIDER", "SERP_CAPTURE"]),
}).strict();

export const agentSourceSchema = httpsSource;
export type AgentSource = z.infer<typeof agentSourceSchema>;

export const agentFactSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  limitations: z.array(z.string()),
}).strict();
export type AgentFact = z.infer<typeof agentFactSchema>;

export const accountResearchSchema = z.object({
  accountDomain: z.string().min(3),
  prospectId: z.string().min(1),
  researchedAt: z.string().datetime({ offset: true }),
  sources: z.array(agentSourceSchema),
  facts: z.array(agentFactSchema),
  gaps: z.array(z.string()),
}).strict().superRefine((value, ctx) => {
  const sourceIds = new Set(value.sources.map((source) => source.id));
  if (sourceIds.size !== value.sources.length)
    ctx.addIssue({ code: "custom", message: "Duplicate source identifiers", path: ["sources"] });
  for (const [index, fact] of value.facts.entries())
    for (const sourceId of fact.sourceIds)
      if (!sourceIds.has(sourceId))
        ctx.addIssue({ code: "custom", message: "Fact cites unknown source", path: ["facts", index, "sourceIds"] });
});
export type AccountResearch = z.infer<typeof accountResearchSchema>;

export const salesAngleSchema = z.enum([
  "COMPETITOR_DEFENSE",
  "BRAND_SPEND_EFFICIENCY",
  "INCREMENTALITY",
  "OTHER_EVIDENCE_LED",
  "NO_PITCH",
]);
export const agentStrategySchema = z.object({
  prospectId: z.string().min(1),
  angle: salesAngleSchema,
  hypothesis: z.string().min(1),
  supportingFactIds: z.array(z.string()),
  uncertainties: z.array(z.string()),
  rationale: z.string().min(1),
}).strict();
export type AgentStrategy = z.infer<typeof agentStrategySchema>;

export const personalSequenceSchema = z.object({
  prospectId: z.string().min(1),
  accountDomain: z.string().min(3),
  strategy: agentStrategySchema,
  messages: z.array(z.object({
    step: z.number().int().min(1).max(4),
    subject: z.string().min(1),
    body: z.string().min(1),
    purpose: z.string().min(1),
    supportingFactIds: z.array(z.string()),
  }).strict()).length(4),
  review: z.object({
    verdict: z.enum(["NEEDS_REVIEW", "HOLD"]),
    concerns: z.array(z.string()),
  }).strict(),
  approved: z.literal(false),
  canSend: z.literal(false),
  canEnroll: z.literal(false),
}).strict();
export type PersonalSequence = z.infer<typeof personalSequenceSchema>;

/** Reject disconnected citations and unsupported facts before any human review. */
export function validateAgentOutput(research: AccountResearch, sequence: PersonalSequence) {
  const facts = new Set(research.facts.map((fact) => fact.id));
  const concerns: string[] = [];
  if (sequence.accountDomain !== research.accountDomain || sequence.prospectId !== research.prospectId)
    concerns.push("Research and sequence must belong to the same prospect and account");
  if (sequence.strategy.prospectId !== research.prospectId)
    concerns.push("Strategy must belong to the researched prospect");
  if (sequence.strategy.angle === "NO_PITCH")
    concerns.push("No evidence-backed pitch is available");
  if (new Set(sequence.messages.map((message) => message.step)).size !== 4 ||
      sequence.messages.some((message, index) => message.step !== index + 1))
    concerns.push("Exactly four ordered email steps are required");
  for (const id of [...sequence.strategy.supportingFactIds, ...sequence.messages.flatMap((message) => message.supportingFactIds)])
    if (!facts.has(id)) concerns.push(`Unknown cited fact: ${id}`);
  if (!sequence.strategy.supportingFactIds.length)
    concerns.push("Strategy has no supporting research facts");
  return { valid: concerns.length === 0, concerns: [...new Set(concerns)] };
}
