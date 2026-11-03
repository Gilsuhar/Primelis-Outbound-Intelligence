// @vitest-environment node
import { expect, it } from "vitest";
import { qualifiedFixture, qualificationTime as now } from "@/test/recycler-qualified";
import { loadRecyclerReview } from "./review";
import { emptySnapshot } from "./shared";
import { recordKey, type Reader, type SupplementalEvidence } from "./types";
import { filterReviewRows, reviewCsv, reviewSections } from "@/features/prospect-recycler/review";

async function workflow(change?: (proof: SupplementalEvidence) => void) {
  const f = qualifiedFixture();
  const hub = emptySnapshot({ record: f.input.identity.records[0], fullName: "Fictional Reviewer", emails: [f.input.identity.email!], email: f.input.identity.email, employerDomain: f.input.identity.employerDomain, mappedOutreachId: "synthetic-outreach" }, now);
  const out = emptySnapshot({ ...hub.prospect, record: { system: "OUTREACH", id: "synthetic-outreach" }, mappedOutreachId: undefined }, now);
  f.input.identity.records.push(out.prospect.record);
  f.input.candidateId = f.input.identity.records.map(recordKey).sort().join("+");
  for (const check of [...f.input.history, ...f.input.sequences]) {
    if (check.system === "OUTREACH") { check.status = "COMPLETE"; check.recordIds = [out.prospect.record.id]; }
  }
  for (const check of f.input.suppressions) {
    if (check.source === "OUTREACH") { check.status = "COMPLETE"; check.recordIds = [out.prospect.record.id]; }
    if (check.source === "LOCAL") check.recordIds.push(recordKey(out.prospect.record));
  }
  for (const snapshot of [hub, out]) {
    snapshot.history = structuredClone(f.input.history.find(h => h.system === snapshot.prospect.record.system)!);
    snapshot.historyTraversal = "COMPLETE";
    snapshot.suppression = structuredClone(f.input.suppressions.find(s => s.source === snapshot.prospect.record.system)!);
    snapshot.sequences = structuredClone(f.input.sequences.find(s => s.system === snapshot.prospect.record.system)!);
  }
  out.communications = f.input.communications.map(c => ({ ...c, record: out.prospect.record }));
  const proof: SupplementalEvidence = { qualification: f.qualification, history: f.input.history, suppressions: f.input.suppressions, sequences: f.input.sequences, emailVerification: f.input.emailVerification, employmentVerification: f.input.employmentVerification };
  change?.(proof);
  const reader = (snapshot: typeof hub): Reader => ({ system: snapshot.prospect.record.system, discover: async () => ({ items: [snapshot.prospect], status: "COMPLETE", pages: 1, issues: [] }), collect: async () => snapshot });
  return loadRecyclerReview({ readers: { HUBSPOT: reader(hub), OUTREACH: reader(out) }, asOf: now, mode: "DEMO", evidence: { [f.input.candidateId]: proof } });
}
it("carries safely matched identity, qualification and authoritative receipts through to dashboard and CSV", async () => {
  const list = await workflow();
  expect(list.rows).toHaveLength(1);
  expect(list.rows[0].decision.status).toBe("ELIGIBLE");
  expect(list.rows[0].providers).toEqual(["HUBSPOT", "OUTREACH"]);
  expect(list.rows[0].decision.latestRelevantOutbound?.record.system).toBe("OUTREACH");
  expect(reviewSections(list).top50).toHaveLength(1);
  expect(filterReviewRows(list.rows, "Fictional Search Company", "ELIGIBLE")).toHaveLength(1);
  expect(filterReviewRows(list.rows, "Fictional", "HOLD")).toHaveLength(0);
  expect(reviewCsv(list, "TOP50")).toContain("synthetic-hubspot");
  expect(reviewCsv(list, "TOP50")).toContain("not approved to send");
});
it.each(["ownership", "company", "responsibility", "opportunities"] as const)("holds an end-to-end review with missing %s receipt", async key => {
  const list = await workflow(p => { delete p.qualification![key]; });
  expect(list.rows[0].decision.status).toBe("HOLD");
  expect(reviewSections(list).top50).toHaveLength(0);
  expect(reviewCsv(list, "REVIEW")).toContain(`QUALIFICATION_${key.toUpperCase()}_MISSING`);
});
it("displays missing verification without hiding the candidate", async () => {
  const list = await workflow(p => { delete p.emailVerification; });
  expect(reviewSections(list).needsVerification).toHaveLength(1);
  expect(list.rows[0].decision.status).toBe("HOLD");
});
it("deduplicates repeated HubSpot records into a held review row without merging evidence", async () => {
  const snapshot = emptySnapshot({ record: { system: "HUBSPOT", id: "duplicate" }, fullName: "Fictional duplicate", emails: ["duplicate@example.invalid"], email: "duplicate@example.invalid", employerDomain: "example.invalid" }, now);
  const list = await loadRecyclerReview({ asOf: now, mode: "DEMO", source: "HUBSPOT", readers: { HUBSPOT: {
    system: "HUBSPOT", discover: async () => ({ items: [snapshot.prospect, snapshot.prospect], status: "COMPLETE", pages: 1, issues: [] }), collect: async () => structuredClone(snapshot),
  } } });
  expect(list.rows).toHaveLength(1);
  expect(list.rows[0].hubspotId).toBe("duplicate");
  expect(list.rows[0].decision.status).toBe("HOLD");
  expect(list.rows[0].decision.reasons.some(reason => reason.code === "DUPLICATE_IDENTITY")).toBe(true);
});
