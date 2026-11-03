import type { ClaimFixture } from "@/features/knowledge/types";

export type ClaimInvariantResult =
  | {
      ok: true;
      claim: ClaimFixture;
    }
  | {
      ok: false;
      code: "SOURCE_REQUIRED" | "TRACEABILITY_REQUIRED";
      message: string;
      claim: ClaimFixture;
    };

export function validateClaimForApproval(claim: ClaimFixture): ClaimInvariantResult {
  if (claim.sourceIds.length === 0) {
    return {
      ok: false,
      code: "SOURCE_REQUIRED",
      message: "Factual claims require at least one source before approval.",
      claim,
    };
  }

  return {
    ok: true,
    claim,
  };
}

export function validateApprovedClaimInvariants(claim: ClaimFixture): ClaimInvariantResult {
  if (claim.approvalStatus === "APPROVED" && claim.sourceIds.length === 0) {
    return {
      ok: false,
      code: "SOURCE_REQUIRED",
      message: "Approved factual claims must remain source-backed.",
      claim,
    };
  }

  if (
    claim.approvalStatus === "APPROVED" &&
    claim.approvedWording &&
    claim.sourceIds.length === 0
  ) {
    return {
      ok: false,
      code: "TRACEABILITY_REQUIRED",
      message: "Approved wording cannot exist on an unsourced approved factual claim.",
      claim,
    };
  }

  return {
    ok: true,
    claim,
  };
}

export function removeClaimSource(claim: ClaimFixture, sourceId: string): ClaimInvariantResult {
  const nextSourceIds = claim.sourceIds.filter((id) => id !== sourceId);

  if (claim.approvalStatus === "APPROVED" && nextSourceIds.length === 0) {
    return {
      ok: false,
      code: "SOURCE_REQUIRED",
      message:
        "Removing the final source from an approved factual claim is blocked to preserve traceability.",
      claim,
    };
  }

  return {
    ok: true,
    claim: {
      ...claim,
      sourceIds: nextSourceIds,
    },
  };
}
