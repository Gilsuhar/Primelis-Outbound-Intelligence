import { z } from "zod";
import { intakeSchema, researchSchema, runSchema } from "../gate-a-contracts";
import { groundingAuditSchema } from "./grounding-audit";

export const companyInputSchema = intakeSchema
  .pick({ companyName: true, companyDomain: true })
  .strict();
export type CompanyInput = z.infer<typeof companyInputSchema>;
export const companyRunSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    input: companyInputSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.enum(["RUNNING", "REVIEW_REQUIRED", "INCOMPLETE", "FAILED"]),
    research: researchSchema,
    issues: z.array(z.string()),
    usage: runSchema.shape.usage,
    groundingAudit: groundingAuditSchema.optional(),
    approved: z.literal(false),
    canSend: z.literal(false),
    canEnroll: z.literal(false),
  })
  .strict();
export type CompanyRun = z.infer<typeof companyRunSchema>;
