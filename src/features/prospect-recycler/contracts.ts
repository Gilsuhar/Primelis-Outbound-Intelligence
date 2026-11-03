import { z } from "zod";
import { timestamp } from "./calendar";

const time = z
  .string()
  .refine((value) => timestamp(value) !== null, "Explicit valid timestamp required");
const text = z.string().trim().min(1);
const employerDomain = text.regex(
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
  "Business domain required",
);
const system = z.enum(["HUBSPOT", "OUTREACH"]);
const record = z.object({ system, id: text }).strict();
const status = z.enum(["COMPLETE", "PARTIAL", "UNKNOWN", "NOT_PRESENT"]);
const check = {
  status,
  /** Provider IDs; LOCAL uses recyclerRecordKey for every linked record. */
  recordIds: z.array(text),
  checkedAt: time,
  authoritative: z.boolean(),
  evidenceId: text,
};
const verification = {
  record,
  email: z.string().email(),
  employerDomain,
  providerId: text,
  independent: z.boolean(),
  checkedAt: time,
  expiresAt: time,
  evidenceId: text,
};

/**
 * All evidence is supplied by the caller; this module performs no collection or persistence.
 * COMPLETE means all pages/records for the explicitly declared scope were checked.
 * NOT_PRESENT is an authoritative identity lookup, never an inference from a missing ID.
 * Communications must be supplied explicitly, including an empty array after a complete read.
 * Include all known suppression observations: a positive always overrides negative checks.
 */
export const recyclerInputSchema = z
  .object({
    candidateId: text,
    identity: z
      .object({
        resolution: z.enum(["VERIFIED", "AMBIGUOUS", "UNRESOLVED"]),
        records: z.array(record).min(1),
        email: z.string().email().optional(),
        employerDomain: employerDomain.optional(),
        emailChangedAt: time.optional(),
      })
      .strict(),
    scope: z
      .object({
        id: text,
        channels: z.array(z.enum(["EMAIL", "CALL", "LINKEDIN", "SMS", "OTHER"])).min(1),
      })
      .strict(),
    history: z
      .array(
        z
          .object({
            ...check,
            system,
            scopeId: text,
            channels: z.array(z.enum(["EMAIL", "CALL", "LINKEDIN", "SMS", "OTHER"])),
            from: time,
            through: time,
            allUsers: z.boolean(),
            retentionComplete: z.boolean(),
          })
          .strict(),
      )
      .default([]),
    communications: z.array(
      z
        .object({
          id: text,
          record,
          at: time,
          scopeId: text,
          channel: z.enum(["EMAIL", "CALL", "LINKEDIN", "SMS", "OTHER"]),
          direction: z.enum(["OUTBOUND", "INBOUND"]),
          outcome: z.enum(["SENT", "DELIVERED", "COMPLETED", "DRAFT", "SCHEDULED", "FAILED"]),
          relevance: z.enum(["RELEVANT", "IRRELEVANT", "UNKNOWN"]),
        })
        .strict(),
    ),
    emailVerification: z
      .object({
        ...verification,
        status: z.enum(["VALID", "INVALID", "CATCH_ALL", "UNKNOWN"]),
        businessEmail: z.boolean(),
      })
      .strict()
      .optional(),
    employmentVerification: z
      .object({
        ...verification,
        current: z.boolean(),
        status: z.enum(["VERIFIED", "INVALID", "UNKNOWN"]),
      })
      .strict()
      .optional(),
    suppressions: z
      .array(
        z
          .object({
            ...check,
            source: z.enum(["HUBSPOT", "OUTREACH", "LOCAL"]),
            unsubscribed: z.boolean().nullable(),
            complained: z.boolean().nullable(),
            hardBounced: z.boolean().nullable(),
            doNotContact: z.boolean().nullable(),
          })
          .strict(),
      )
      .default([]),
    sequences: z
      .array(
        z
          .object({
            ...check,
            system,
            states: z.array(z.object({ id: text, state: text }).strict()),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type RecyclerInput = z.infer<typeof recyclerInputSchema>;
export type RecyclerSystem = z.infer<typeof system>;
export type RecyclerStatus = "ELIGIBLE" | "HOLD" | "EXCLUDED";
export type RecyclerReason = {
  code: string;
  status: RecyclerStatus;
  message: string;
  evidenceIds: string[];
};
export type RecyclerEvidenceTimestamp = {
  kind: "HISTORY" | "EMAIL" | "EMPLOYMENT" | "SUPPRESSION" | "SEQUENCE" | "COMMUNICATION" | "QUALIFICATION";
  source: string;
  evidenceId: string;
  checkedAt?: string;
  expiresAt?: string;
  from?: string;
  through?: string;
  occurredAt?: string;
};
export type RecyclerDecision = {
  candidateId: string | null;
  status: RecyclerStatus;
  evaluatedAt: string;
  timezone: "Asia/Jerusalem";
  scopeId: string | null;
  reasons: RecyclerReason[];
  evidenceTimestamps: RecyclerEvidenceTimestamp[];
  latestRelevantOutbound: RecyclerInput["communications"][number] | null;
  /** Cooldown anniversary only; other HOLD/EXCLUDED reasons may still prevent eligibility. */
  nextEligibleAt: string | null;
  nextEligibleDate: string | null;
};
