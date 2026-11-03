import { z } from "zod";
import { qualifyProspect, SIGNAL_HUBSPOT_OWNER_ID } from "./qualification";

const text = z.string().trim().min(1).max(1800);
const publicUrl = z
  .string()
  .url()
  .max(1000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });

/** Read-only context, never an eligibility receipt or an accepted grounding result. */
export const observedProspectSchema = z
  .object({
    kind: z.literal("READ_ONLY_OBSERVATIONS"),
    observedAt: z.string().datetime(),
    contact: z
      .object({
        id: z.string().regex(/^\d+$/),
        ownerId: z.literal(SIGNAL_HUBSPOT_OWNER_ID),
        name: text,
        title: text,
        company: text,
        url: publicUrl,
      })
      .strict(),
    observations: z
      .array(
        z
          .object({
            label: text,
            value: text,
            limitation: text,
            url: publicUrl,
          })
          .strict(),
      )
      .min(1)
      .max(15),
    context: z
      .array(
        z
          .object({
            statement: text,
            quote: text,
            url: publicUrl,
            limitation: text,
          })
          .strict(),
      )
      .max(3),
    hypothesis: text,
    nextActions: z.array(text).min(1).max(10),
  })
  .strict();

export type ObservedProspect = z.infer<typeof observedProspectSchema>;

export function observedProspectDecision(packet: ObservedProspect, now = new Date()) {
  // Observation recency is not independent verification. No CRM field, title or
  // prose in this review packet is promoted into verified qualification evidence.
  const decision = qualifyProspect(
    {
      hubspotRecordId: packet.contact.id,
      hubspotOwnerId: packet.contact.ownerId,
    },
    now,
  );
  return {
    ...decision,
    drafts: [] as never[],
    grounding: "NOT_RUN" as const,
    semanticJudgement: "NOT_RUN" as const,
  };
}
