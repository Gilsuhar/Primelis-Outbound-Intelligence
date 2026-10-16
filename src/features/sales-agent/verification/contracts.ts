import { z } from "zod";
export const verificationKindSchema = z.enum(["EMAIL", "EMPLOYMENT"]);
export type VerificationKind = z.infer<typeof verificationKindSchema>;
export const identitySchema = z
  .object({
    hubspotRecordId: z.string().min(1),
    fullName: z.string(),
    email: z.string().optional(),
    companyDomain: z.string().optional(),
    emailModifiedAt: z.string().optional(),
    emailSource: z.string().optional(),
  })
  .strict();
export const proofSchema = z
  .object({
    providerId: z.string().min(1).max(100),
    sourceRecordId: z.string().min(1).max(200),
    sourceUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.hash &&
          ![...url.searchParams.keys()].some((key) =>
            /token|secret|key|authorization|credential|signature/i.test(key),
          )
        );
      }),
    checkedAt: z.string().datetime({ offset: true }),
    evidence: z.array(z.string().min(1).max(1000)).min(1).max(10),
    independent: z.boolean(),
  })
  .strict();
export const emailResultSchema = z
  .object({
    kind: z.literal("EMAIL"),
    identity: identitySchema,
    proof: proofSchema,
    status: z.enum(["VERIFIED", "INVALID", "CATCH_ALL", "UNKNOWN", "STALE"]),
    businessEmail: z.boolean(),
  })
  .strict();
export const employmentResultSchema = z
  .object({
    kind: z.literal("EMPLOYMENT"),
    identity: identitySchema,
    proof: proofSchema,
    status: z.enum(["VERIFIED", "INVALID", "UNKNOWN", "STALE"]),
    employerDomain: z.string(),
    current: z.boolean(),
    role: z.string().min(1).max(300),
    seniority: z.enum(["C_LEVEL", "VP", "DIRECTOR", "HEAD", "LEAD", "OTHER", "UNKNOWN"]),
    searchResponsibility: z.enum(["PROVEN", "ABSENT", "UNKNOWN"]),
    responsibilityScope: z.enum(["PAID_SEARCH", "PAID_SOCIAL_ONLY", "MIXED", "UNKNOWN"]),
    responsibilityEvidence: z.array(z.string().min(1).max(1000)).max(10),
  })
  .strict();
export const verificationResultSchema = z.discriminatedUnion("kind", [
  emailResultSchema,
  employmentResultSchema,
]);
export type VerificationResult = z.infer<typeof verificationResultSchema>;
export const attemptSchema = z
  .object({
    requestKey: z.string(),
    identity: identitySchema,
    providerId: z.string(),
    state: z.enum(["RUNNING", "COMPLETED", "FAILED", "UNRESOLVED_PROVIDER"]),
    startedAt: z.string(),
    leaseUntil: z.string(),
    nextRetryAt: z.string(),
    attempts: z.number().int().nonnegative(),
    message: z.string(),
    result: verificationResultSchema.optional(),
  })
  .strict();
export const verificationStateSchema = z
  .object({ EMAIL: attemptSchema.optional(), EMPLOYMENT: attemptSchema.optional() })
  .strict();
export type VerificationState = z.infer<typeof verificationStateSchema>;
export function verificationIdentity(
  contact: z.infer<typeof identitySchema>,
): z.infer<typeof identitySchema> {
  return {
    hubspotRecordId: contact.hubspotRecordId,
    fullName: contact.fullName,
    email: contact.email?.trim().toLowerCase(),
    companyDomain: contact.companyDomain?.toLowerCase(),
    emailModifiedAt: contact.emailModifiedAt,
    emailSource: contact.emailSource,
  };
}
export function sameVerificationIdentity(
  a: z.infer<typeof identitySchema>,
  b: z.infer<typeof identitySchema>,
) {
  return JSON.stringify(verificationIdentity(a)) === JSON.stringify(verificationIdentity(b));
}
