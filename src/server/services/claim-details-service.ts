import { z } from "zod";

import { getPersistenceAdapter } from "@/server/repositories/adapter-factory";

import { err, ok } from "./result";

const claimDetailsSchema = z.object({
  claimId: z.string().min(1),
});

export async function retrieveClaimDetails(input: unknown) {
  const parsed = claimDetailsSchema.safeParse(input);

  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Claim details input is malformed.");
  }

  const repositories = getPersistenceAdapter();
  const claim = await repositories.claims.getClaimById(parsed.data.claimId);

  if (!claim) {
    return err("CLAIM_NOT_FOUND", "Claim not found.");
  }

  return ok({
    claim,
    sources: await repositories.sources.getSourcesByIds(claim.sourceIds),
    warnings: {
      missingSource: claim.sourceIds.length === 0,
      restricted: claim.approvalStatus === "RESTRICTED",
      notApproved: claim.approvalStatus !== "APPROVED",
    },
  });
}
