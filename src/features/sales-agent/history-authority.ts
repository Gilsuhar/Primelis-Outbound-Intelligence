import { z } from "zod";
export const historyAuthoritySchema = z
  .object({
    state: z.enum(["COMPLETE", "PARTIAL", "UNRESOLVED_PROVIDER"]),
    sources: z.array(z.enum(["HUBSPOT", "OUTREACH"])).min(1),
    checkedAt: z.string().datetime({ offset: true }),
    through: z.string().datetime({ offset: true }),
    identityMatched: z.boolean(),
    permissionsVerified: z.boolean(),
    allUserHistory: z.boolean(),
    retentionComplete: z.boolean(),
    evidence: z.array(z.string().min(1).max(1000)).min(1).max(10),
  })
  .strict();
export type HistoryAuthority = z.infer<typeof historyAuthoritySchema>;
export function hasHistoricalAuthority(
  authority: HistoryAuthority | undefined,
  field: string,
  now: Date,
) {
  if (
    !authority ||
    authority.state !== "COMPLETE" ||
    !authority.identityMatched ||
    !authority.permissionsVerified
  )
    return false;
  for (const at of [authority.checkedAt, authority.through]) {
    const time = Date.parse(at);
    if (!Number.isFinite(time) || time > now.getTime() || now.getTime() - time > 86400000)
      return false;
  }
  if (field === "conflictingActiveOpportunity") return authority.sources.includes("HUBSPOT");
  if (
    !authority.sources.includes("OUTREACH") ||
    !authority.allUserHistory ||
    !authority.retentionComplete
  )
    return false;
  if (
    [
      "lastOutboundAt",
      "outreachHistoryComplete",
      "unsubscribed",
      "hardBounced",
      "complained",
    ].includes(field) &&
    !authority.sources.includes("HUBSPOT")
  )
    return false;
  return true;
}
