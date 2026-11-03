import { describe, expect, it } from "vitest";
import { evaluateQualifiedRecyclerBatch } from "./qualification";
import { qualifiedFixture, qualificationTime as now } from "@/test/recycler-qualified";
import type { RecyclerInput } from "./contracts";
const evaluate = (fixture = qualifiedFixture(), at = now) => evaluateQualifiedRecyclerBatch([fixture.input], { [fixture.input.candidateId]: fixture.qualification }, at)[0];
describe("complete Recycler qualification", () => {
  it("requires both exact inclusive company thresholds and every safety gate", () => expect(evaluate().status).toBe("ELIGIBLE"));
  it.each(["ownership", "company", "responsibility", "opportunities"] as const)("holds missing %s", kind => {
    const f = qualifiedFixture(); delete f.qualification[kind];
    expect(evaluate(f).status).toBe("HOLD");
  });
  it.each(["ownership", "company", "responsibility", "opportunities"] as const)("holds stale, untrusted or mismatched %s", kind => {
    for (const patch of [{ checkedAt: "2020-01-01T00:00:00Z" }, { checkedAt: "2030-01-01T00:00:00Z" }, { authoritative: false }, { hubspotId: "other" }, { employerDomain: "other.invalid" }]) {
      const f = qualifiedFixture(); Object.assign(f.qualification[kind]!, patch);
      expect(evaluate(f).status).toBe("HOLD");
    }
  });
  it.each([{ employees: 79 }, { annualRevenueUsd: 29_999_999 }])("excludes a company failing either threshold", patch => {
    const f = qualifiedFixture(); Object.assign(f.qualification.company!, patch);
    expect(evaluate(f).status).toBe("EXCLUDED");
  });
  it.each(["ownership", "company", "responsibility"] as const)("does not import negative %s facts from an unrelated identity", kind => {
    const f = qualifiedFixture();
    f.qualification[kind]!.hubspotId = "unrelated-hubspot";
    if (kind === "ownership") f.qualification.ownership!.ownerId = "other-owner";
    if (kind === "company") f.qualification.company!.employees = 0;
    if (kind === "responsibility") f.qualification.responsibility!.paidSocialOnly = true;
    const result = evaluate(f);
    expect(result.status).toBe("HOLD");
    expect(result.reasons.some(reason => reason.code === "QUALIFICATION_IDENTITY_MISMATCH")).toBe(true);
    expect(result.reasons.some(reason => reason.status === "EXCLUDED")).toBe(false);
  });
  it.each([{ employees: null }, { annualRevenueUsd: null }])("holds unknown company metrics", patch => {
    const f = qualifiedFixture(); Object.assign(f.qualification.company!, patch); expect(evaluate(f).status).toBe("HOLD");
  });
  it("excludes Paid Social-only contacts", () => {
    const f = qualifiedFixture(); f.qualification.responsibility!.paidSocialOnly = true;
    expect(evaluate(f).status).toBe("EXCLUDED");
  });
  it.each(["CMO", "VP", "DIRECTOR", "HEAD"] as const)("requires explicit Search responsibility for %s", seniority => {
    const f = qualifiedFixture(); f.qualification.responsibility!.seniority = seniority;
    expect(evaluate(f).status).toBe("ELIGIBLE");
    f.qualification.responsibility!.searchResponsibility = null;
    expect(evaluate(f).status).toBe("HOLD");
  });
  it("excludes another owner", () => {
    const f = qualifiedFixture(); f.qualification.ownership!.ownerId = "other"; expect(evaluate(f).status).toBe("EXCLUDED");
  });
  it("holds Outreach-only even with claimed ownership receipts", () => {
    const f = qualifiedFixture(); f.input.identity.records = [{ system: "OUTREACH", id: "synthetic" }]; expect(evaluate(f).status).toBe("HOLD");
  });
  it.each([{ coverage: "PARTIAL" }, { activeConflict: null }, { activeConflict: true }])("holds incomplete/conflicting opportunities", patch => {
    const f = qualifiedFixture(); Object.assign(f.qualification.opportunities!, patch); expect(evaluate(f).status).toBe("HOLD");
  });
  it.each(["Boring green", "HubSpot", "Surfe", "manual"])("rejects %s as independent validation", provider => {
    const f = qualifiedFixture(); f.input.emailVerification!.providerId = provider; expect(evaluate(f).status).toBe("HOLD");
  });
  it("requires current ZoomInfo receipt and revalidation after email edits", () => {
    const f = qualifiedFixture(); f.input.emailVerification!.providerId = "ZoomInfo";
    expect(evaluate(f).status).toBe("ELIGIBLE");
    f.input.emailVerification!.checkedAt = "2026-01-01T00:00:00Z";
    expect(evaluate(f).status).toBe("HOLD");
    f.input.identity.emailChangedAt = now;
    expect(evaluate(f).reasons.some(r => r.code === "EMAIL_VERIFICATION_IDENTITY_MISMATCH")).toBe(true);
  });
  it.each([
    (i: RecyclerInput) => { i.history[0].status = "PARTIAL"; },
    (i: RecyclerInput) => { i.history[1].retentionComplete = false; },
    (i: RecyclerInput) => { delete i.emailVerification; },
    (i: RecyclerInput) => { delete i.employmentVerification; },
    (i: RecyclerInput) => { i.emailVerification!.status = "CATCH_ALL"; },
    (i: RecyclerInput) => { i.emailVerification!.status = "INVALID"; },
    (i: RecyclerInput) => { i.emailVerification!.status = "UNKNOWN"; },
    (i: RecyclerInput) => { i.suppressions[0].complained = null; },
    (i: RecyclerInput) => { i.sequences[0].states = [{ id: "s", state: "disabled" }]; },
    (i: RecyclerInput) => { i.identity.resolution = "AMBIGUOUS"; },
    (i: RecyclerInput) => { i.communications[0].at = ""; },
    (i: RecyclerInput) => { i.communications[0].at = now; },
  ])("never clears an incomplete safety gate", change => {
    const f = qualifiedFixture(); change(f.input); expect(evaluate(f).status).toBe("HOLD");
  });
  it.each(["unsubscribed", "hardBounced", "complained"] as const)("preserves %s exclusion", flag => {
    const f = qualifiedFixture(); f.input.suppressions[0][flag] = true; expect(evaluate(f).status).toBe("EXCLUDED");
  });
  it("holds duplicate HubSpot IDs even with different candidate IDs and emails", () => {
    const f = qualifiedFixture(), duplicate = structuredClone(f.input); duplicate.candidateId = "other";
    duplicate.identity.email = "other@example.invalid";
    expect(evaluateQualifiedRecyclerBatch([f.input, duplicate], { [f.input.candidateId]: f.qualification, other: f.qualification }, now).every(d => d.status === "HOLD")).toBe(true);
  });
  it.each([
    ["2024-02-29T10:00:00Z", "2024-06-29T09:00:00Z"],
    ["2026-06-30T09:00:00Z", "2026-10-30T10:00:00Z"],
    ["2024-10-31T10:00:00Z", "2025-02-28T10:00:00Z"],
  ])("uses calendar months and Jerusalem offsets from %s", (sent, anniversary) => {
    const f = qualifiedFixture(anniversary); f.input.communications[0].at = sent;
    expect(evaluate(f, anniversary).nextEligibleAt).toBe(new Date(anniversary).toISOString());
    expect(evaluate(f, anniversary).status).toBe("ELIGIBLE");
    expect(evaluate(f, new Date(Date.parse(anniversary) - 1).toISOString()).status).toBe("HOLD");
  });
});
