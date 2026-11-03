import { describe, expect, it } from "vitest";
import { draftAccessForSnapshot } from "./draft-access";
import { qualifyProspect } from "@/features/sales-agent/qualification";
import { normalizeCollectedEvidence } from "@/features/sales-agent/evidence";
import { collectedContact, observation } from "@/test/sales-agent-collection-fixtures";
import { snapshotSchema } from "@/server/services/sales-agent-collection-service";
const now = new Date("2026-10-15T18:00:00Z");
function fixture() {
  return snapshotSchema.parse({
    version: 1,
    contact: { ...collectedContact, observedAt: now.toISOString() },
    observations: [observation("role", "Head of Paid Search")],
    integrationReceipts: { HUBSPOT: { jobId: "synthetic-sync", operation: "IMPORTED" } },
    providers: [],
    blockers: [],
    collectedAt: now.toISOString(),
  });
}
describe("combined real strict qualification and editorial intake", () => {
  it("allows unknown history/employment/email for review only while strict eligibility remains HOLD", () => {
    const s = fixture();
    const input = normalizeCollectedEvidence(s.contact, s.observations, now).input;
    expect(qualifyProspect(input, now).status).toBe("HOLD");
    expect(draftAccessForSnapshot(s, now)).toMatchObject({
      status: "DRAFT_ALLOWED",
      draftAllowed: true,
    });
    expect(draftAccessForSnapshot(s, now).warnings).toContain("OUTREACH_HISTORY_INCOMPLETE");
  });
  it.each(["unsubscribed", "hardBounced", "complained", "conflictingActiveOpportunity"] as const)(
    "blocks positive %s even with conflicting/stale negative clearance",
    (field) => {
      const s = fixture();
      s.observations.push(observation(field, true), observation(field, false));
      expect(draftAccessForSnapshot(s, now).status).toBe("BLOCKED");
    },
  );
  it("rejects Paid Social-only and wrong-owner contacts without provider research", () => {
    const s = fixture();
    s.observations = [observation("role", "Director of Paid Social")];
    expect(draftAccessForSnapshot(s, now).blockers).toContain("IRRELEVANT_PERSONA");
    s.contact.ownerId = "other";
    expect(draftAccessForSnapshot(s, now).blockers).toContain("OUTSIDE_OWNED_SCOPE");
  });
  it("blocks invalid current email; an old address does not poison a newly edited address", () => {
    const s = fixture();
    s.observations.push({
      ...observation("emailVerification", {
        status: "INVALID",
        independentlyVerified: true,
        emailMatchesCurrentRecord: true,
        businessEmailVerified: true,
      }),
      subjectEmail: s.contact.email,
    });
    expect(draftAccessForSnapshot(s, now).status).toBe("BLOCKED");
    s.contact.email = "new@fictional.example";
    expect(draftAccessForSnapshot(s, now).status).toBe("DRAFT_ALLOWED");
    expect(
      qualifyProspect(normalizeCollectedEvidence(s.contact, s.observations, now).input, now).status,
    ).toBe("HOLD");
  });
});
