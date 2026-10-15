import "server-only";
import { draftResearchSchema } from "@/features/sales-agent/draft-engine";
import { normalizeCollectedEvidence } from "@/features/sales-agent/evidence";
import { PrismaEvidenceStore, type EvidenceStore } from "@/server/sales-agent/evidence-store";
import { snapshotSchema } from "./sales-agent-collection-service";
import { err, ok } from "./result";
import { verifyApprovedDraftProof } from "@/server/sales-agent/approved-draft-proof";

/** Manual research is saved locally, never used as provider verification or CRM input. */
export async function saveSalesAgentResearch(
  actorId: string,
  input: unknown,
  deps: {
    store?: EvidenceStore;
    now?: () => Date;
    verifyProof?: typeof verifyApprovedDraftProof;
  } = {},
) {
  if (!actorId.trim()) return err("UNAUTHENTICATED", "Sign in to save research");
  const parsed = draftResearchSchema.safeParse(input);
  if (!parsed.success)
    return err("VALIDATION_ERROR", "Check the research fields and HTTPS source URLs");
  if (parsed.data.contactId.startsWith("test-fixture-"))
    return err("VALIDATION_ERROR", "Fictional fixtures cannot be saved to live evidence");
  try {
    if (
      parsed.data.kind === "CASE_STUDY" &&
      !(await (deps.verifyProof ?? verifyApprovedDraftProof)(parsed.data))
    )
      return err(
        "VALIDATION_ERROR",
        "Use exact approved external case-study wording and its approved linked source, with cold-email usage permitted",
      );
    const store = deps.store ?? new PrismaEvidenceStore();
    let invalid = "";
    const saved = await store.edit(actorId, parsed.data.contactId, (raw) => {
      const snapshot = snapshotSchema.safeParse(raw);
      if (!snapshot.success) return null;
      if (
        parsed.data.companyDomain.toLowerCase() !==
        snapshot.data.contact.companyDomain?.toLowerCase()
      ) {
        invalid = "Research must match the current company domain";
        return null;
      }
      const now = (deps.now ?? (() => new Date()))();
      // Human attestation time is server-recorded; never provider qualification evidence.
      const entry = {
        ...parsed.data,
        verifiedAt: parsed.data.manuallyVerified ? now.toISOString() : null,
      };
      const research = [
        ...(snapshot.data.research ?? []).filter((item) => item.id !== entry.id),
        entry,
      ];
      if (research.length > 100) {
        invalid = "Research limit reached; update an existing entry";
        return null;
      }
      return {
        ...snapshot.data,
        research,
        provenanceAtCollection: normalizeCollectedEvidence(
          snapshot.data.contact,
          snapshot.data.observations,
          now,
        ).provenance,
      };
    });
    if (invalid) return err("VALIDATION_ERROR", invalid);
    if (!saved) return err("NOT_FOUND", "No saved contact is available in your review");
    return ok({ saved: true });
  } catch {
    return err(
      "RESEARCH_UNAVAILABLE",
      "Research could not be saved; retry after checking local evidence storage",
    );
  }
}
