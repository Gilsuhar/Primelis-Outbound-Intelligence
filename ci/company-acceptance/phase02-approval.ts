/** Local initialization only. This is not an alternative hosted-worker authorization path. */
import { approvalSchema, checksum, fail } from "./policy";

export const PHASE02_EXECUTION_APPROVAL = "INITIALIZE_SNOWY_ART_PILOT_PHASE_02";
export const PHASE02_BINDING = {
  repository: "Gilsuhar/agentworkforce-ci-acceptance",
  repositoryId: "1426200737",
  ownerId: "79252537",
  cohort: "pilot-20261019",
  actor: "ci-fixture-pilot-20261019",
  policySha256: "02541f5342fe33b832016e17dad9c15be10af046300446dd63c3fcc62dc265cd",
} as const;

// The caller must have separate human execution approval and fresh control-plane
// evidence. A file/hash validates that approval's content; it cannot prove consent.
export function requirePhase02Approval(raw: string, expectedHash: string, now = new Date()) {
  try {
    if (
      Buffer.byteLength(raw) > 8192 ||
      !/^[a-f0-9]{64}$/.test(expectedHash) ||
      checksum(raw) !== expectedHash
    )
      fail("CI_PHASE02_MANIFEST_INVALID");
    const approval = approvalSchema.parse(JSON.parse(raw));
    for (const key of ["repository", "repositoryId", "ownerId", "cohort", "actor"] as const)
      if (approval[key] !== PHASE02_BINDING[key]) fail("CI_PHASE02_BINDING_DENIED");
    if (approval.database.policySha256 !== PHASE02_BINDING.policySha256)
      fail("CI_PHASE02_BINDING_DENIED");
    const start = Date.parse(approval.approvedAt),
      end = Date.parse(approval.expiresAt);
    if (!Number.isFinite(+now) || start > +now || end <= +now || end - start > 7 * 86400000)
      fail("CI_PHASE02_APPROVAL_EXPIRED");
    return expectedHash;
  } catch (error) {
    if (error instanceof Error && /^CI_PHASE02_[A-Z_]+$/.test(error.message)) throw error;
    return fail("CI_PHASE02_MANIFEST_INVALID");
  }
}
