import { describe, expect, it } from "vitest";
import { normalizeCollectedEvidence } from "./evidence";
import { qualifyProspect } from "./qualification";
import {
  collectedContact,
  collectionNow,
  observation,
  verifiedObservations,
} from "@/test/sales-agent-collection-fixtures";

const normalize = (items = verifiedObservations, contact = collectedContact) =>
  normalizeCollectedEvidence(contact, items, collectionNow);

describe("evidence normalization", () => {
  it("qualifies fully source-backed and independently verified evidence", () => {
    const result = normalize();
    expect(qualifyProspect(result.input, collectionNow).status).toBe("READY");
    expect(result.provenance.every((item) => item.accepted)).toBe(true);
    expect(result.provenance[0]).toMatchObject({
      provider: "ZOOMINFO",
      sourceRecordId: "fixture:ZOOMINFO:42:employeeCount",
      observedAt: collectionNow.toISOString(),
      verifiedAt: "2026-10-15T08:00:00.000Z",
      freshness: "FRESH",
      expiresAt: "2026-11-14T08:00:00.000Z",
    });
  });
  it("never upgrades CRM field presence into independent verification", () => {
    const result = normalize(
      verifiedObservations.map((item) => ({
        ...item,
        provider: "HUBSPOT",
        verifiedAt: null,
        independent: false,
        supportingEvidence: [],
      })),
    );
    expect(qualifyProspect(result.input, collectionNow).status).toBe("HOLD");
    expect(result.input.emailVerification).toBeUndefined();
    expect(result.input.currentEmploymentVerified).toBeUndefined();
    expect(result.provenance.every((item) => item.freshness === "UNVERIFIED")).toBe(true);
  });
  it.each(["2026-09-01T00:00:00Z", "2026-10-16T00:00:00Z", "unknown", null])(
    "rejects stale/invalid/missing ZoomInfo verification timestamps: %s",
    (verifiedAt) => {
      const items = verifiedObservations.map((item) =>
        item.field === "emailVerification" ? { ...item, verifiedAt } : item,
      );
      const result = normalize(items);
      expect(result.input.emailVerification).toBeUndefined();
      expect(qualifyProspect(result.input, collectionNow).status).toBe("HOLD");
    },
  );
  it("requires supporting evidence even when ZoomInfo says VALID", () => {
    const result = normalize(
      verifiedObservations.map((item) =>
        item.field === "emailVerification" ? { ...item, supportingEvidence: [] } : item,
      ),
    );
    expect(result.input.emailVerification).toBeUndefined();
  });
  it.each(["SURFE", "BORING", "HUBSPOT"] as const)(
    "never treats %s green status as independent verification",
    (provider) => {
      const result = normalize(
        verifiedObservations.map((item) =>
          item.field === "emailVerification" ? { ...item, provider } : item,
        ),
      );
      expect(qualifyProspect(result.input, collectionNow).status).toBe("HOLD");
    },
  );
  it("requires revalidation after a manual/Surfe email edit, even for the same email text", () => {
    const result = normalize(verifiedObservations, {
      ...collectedContact,
      emailModifiedAt: "2026-10-15T09:00:00.000Z",
    });
    expect(result.input.emailVerification).toBeUndefined();
  });
  it("requires known email edit history and exact email identity", () => {
    expect(
      normalize(verifiedObservations, { ...collectedContact, emailModifiedAt: undefined }).input
        .emailVerification,
    ).toBeUndefined();
    expect(
      normalize(verifiedObservations, { ...collectedContact, email: "changed@example.com" }).input
        .emailVerification,
    ).toBeUndefined();
  });
  it("requires employment verification bound to the current company", () => {
    const result = normalize(verifiedObservations, {
      ...collectedContact,
      companyDomain: "different.com",
    });
    expect(result.input.currentEmploymentVerified).toBeUndefined();
  });
  it("does not accept evidence belonging to another HubSpot record", () => {
    const result = normalize(
      verifiedObservations.map((item) => ({ ...item, hubspotRecordId: "other" })),
    );
    expect(result.provenance.every((item) => item.freshness === "INVALID")).toBe(true);
    expect(qualifyProspect(result.input, collectionNow).status).toBe("HOLD");
  });
  it("keeps conflicting company evidence traceable and excludes it from qualification", () => {
    const result = normalize([
      ...verifiedObservations,
      observation("employeeCount", 50, "SIMILARWEB"),
    ]);
    expect(result.conflicts).toContain("Conflicting employeeCount evidence");
    expect(result.input.employeeCount).toBeUndefined();
    expect(result.provenance.filter((item) => item.field === "employeeCount")).toHaveLength(2);
  });
  it("does not invent Outreach history from HubSpot last activity", () => {
    const result = normalize(
      verifiedObservations.map((item) =>
        item.provider === "OUTREACH" ? { ...item, provider: "HUBSPOT" } : item,
      ),
    );
    expect(result.input.lastOutboundAt).toBeUndefined();
    expect(result.input.outreachHistoryComplete).toBeUndefined();
    expect(qualifyProspect(result.input, collectionNow).reasons).toContain(
      "Outreach history incomplete",
    );
  });
  it("preserves positive safety blocks over newer negative assertions", () => {
    const result = normalize([
      ...verifiedObservations,
      observation("unsubscribed", true, "HUBSPOT", {
        verifiedAt: null,
        independent: false,
        supportingEvidence: [],
      }),
    ]);
    expect(result.input.unsubscribed).toBe(true);
    expect(qualifyProspect(result.input, collectionNow).status).toBe("REJECTED");
  });
  it("does not silently convert ambiguous ranges or currency into qualification numbers", () => {
    const result = normalize([
      observation("employeeCount", "80-100"),
      observation("annualRevenueUsd", { amount: 100_000_000, currency: "UNKNOWN" }),
    ]);
    expect(result.input.employeeCount).toBeUndefined();
    expect(result.input.annualRevenueUsd).toBeUndefined();
  });
});

describe("conflicting current CRM observations", () => {
  it("holds current CRM contradictions despite a verified provider", () => {
    const result = normalizeCollectedEvidence(
      collectedContact,
      [
        ...verifiedObservations,
        observation("employeeCount", 50, "HUBSPOT", {
          verifiedAt: null,
          supportingEvidence: [],
          independent: false,
        }),
      ],
      collectionNow,
    );
    expect(result.conflicts).toContain("Conflicting employeeCount evidence");
    expect(result.input.employeeCount).toBeUndefined();
  });
  it("does not treat equivalent title capitalization as a conflict", () => {
    const result = normalizeCollectedEvidence(
      collectedContact,
      [
        ...verifiedObservations,
        observation("role", "HEAD OF PAID SEARCH", "HUBSPOT", {
          verifiedAt: null,
          supportingEvidence: [],
          independent: false,
        }),
      ],
      collectionNow,
    );
    expect(result.conflicts).toEqual([]);
  });
});

describe("provider authority for negative safety clearance", () => {
  it("does not clear suppression or opportunities using an unrelated enrichment provider", () => {
    const result = normalizeCollectedEvidence(
      collectedContact,
      verifiedObservations.map((item) =>
        ["unsubscribed", "hardBounced", "complained", "conflictingActiveOpportunity"].includes(
          item.field,
        )
          ? { ...item, provider: "ZOOMINFO" }
          : item,
      ),
      collectionNow,
    );
    expect(result.input.unsubscribed).toBeUndefined();
    expect(result.input.hardBounced).toBeUndefined();
    expect(result.input.complained).toBeUndefined();
    expect(result.input.conflictingActiveOpportunity).toBeUndefined();
    expect(qualifyProspect(result.input, collectionNow).status).toBe("HOLD");
  });
});
