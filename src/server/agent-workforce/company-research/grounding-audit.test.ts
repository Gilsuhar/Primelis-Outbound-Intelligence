// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { groundedFactSchema, researchSchema } from "@/features/agent-workforce/gate-a-contracts";
import { groundingAuditSchema } from "@/features/agent-workforce/company-research/grounding-audit";
import { buildGroundingAudit } from "./grounding-audit";
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/nike-public-excerpts-2026-10-18.json", import.meta.url), "utf8"),
);
const source = fixture.sources.find((s: { url: string }) => s.url.endsWith("/who-we-are"));
const quote =
  "NIKE, Inc. is the world's leading designer, marketer, and distributor of authentic athletic footwear, apparel, equipment, and accessories for a wide variety of sports and fitness activities.";
const fact = groundedFactSchema.parse({
  id: "account:products",
  subject: "ACCOUNT",
  category: "PRODUCTS",
  statement:
    "NIKE's product categories include athletic footwear, apparel, equipment, and accessories.",
  sourceIds: [source.id],
  confidence: "HIGH",
  limitations: [],
  quotes: [{ sourceId: source.id, text: quote }],
});
function evidence() {
  return researchSchema.parse({
    accountDomain: "nike.com",
    prospectId: "offline-audit",
    researchedAt: fixture.at,
    sources: fixture.sources,
    facts: [fact],
    gaps: [],
    assumptions: [],
  });
}
const accepted = {
  identityMatches: true,
  supportedFactIds: [fact.id],
  rejectedFactIds: [],
  concerns: [],
};
const concern = (reason: string) => ({
  severity: "BLOCKING" as const,
  scope: "FACT" as const,
  code: "CLAIM_NOT_ENTAILED" as const,
  reason,
  factIds: [fact.id],
  sourceIds: [source.id],
});
it("records accepted review metadata without duplicating accepted finding text", () => {
  const audit = buildGroundingAudit(evidence(), accepted);
  expect(audit.status).toBe("ACCEPTED");
  expect(audit.reasonCodes).toEqual([]);
  expect(audit.candidates[0]).toMatchObject({
    verified: false,
    reviewerDecision: "SUPPORTED",
    statementOmitted: "ACCEPTED_FINDING_REFERENCE",
  });
  expect(audit.candidates[0].statement).toBeUndefined();
  expect(audit.candidates[0].quotes[0].text).toBeUndefined();
});
it("retains original candidate text and exact public quotes separately on rejection", () => {
  const audit = buildGroundingAudit(evidence(), {
    identityMatches: true,
    supportedFactIds: [],
    rejectedFactIds: [fact.id],
    concerns: [concern("The quote does not support the entire claim.")],
  });
  expect(audit.status).toBe("REJECTED");
  expect(audit.reasonCodes).toContain("REJECTED_FACTS");
  expect(audit.candidates[0]).toMatchObject({
    statement: fact.statement,
    reviewerDecision: "REJECTED",
    verified: false,
  });
  expect(audit.candidates[0].quotes[0]).toMatchObject({
    text: quote,
    exactMatch: true,
    sourceId: source.id,
  });
  expect(audit.reviewer?.concernCodes).toEqual(["CLAIM_NOT_ENTAILED"]);
  expect(audit.reviewer?.concerns?.[0]).toMatchObject({
    severity: "BLOCKING",
    candidateIds: ["candidate-1"],
    sourceIds: [source.id],
    reason: "The quote does not support the entire claim.",
  });
});
it("distinguishes missing, duplicate, conflicting and unknown reviewer identifiers without saving unknown text", () => {
  const audit = buildGroundingAudit(evidence(), {
    ...accepted,
    supportedFactIds: [fact.id, fact.id, "private-secret-id"],
    rejectedFactIds: [fact.id, "private-secret-rejected"],
  });
  expect(audit.reasonCodes).toContain("DUPLICATE_SUPPORTED_IDS");
  expect(audit.reasonCodes).toContain("SUPPORTED_COUNT_MISMATCH");
  expect(audit.candidates[0].reviewerDecision).toBe("CONFLICT");
  expect(audit.reviewer).toMatchObject({ unknownSupportedCount: 1, unknownRejectedCount: 1 });
  expect(JSON.stringify(audit)).not.toContain("private-secret");
  const missing = buildGroundingAudit(evidence(), { ...accepted, supportedFactIds: [] });
  expect(missing.reasonCodes).toContain("MISSING_SUPPORTED_IDS");
  expect(missing.reasonCodes).not.toContain("DUPLICATE_SUPPORTED_IDS");
});
it.each(["MALFORMED", "UNAVAILABLE"] as const)(
  "retains candidate evidence but no reviewer payload for %s",
  (status) => {
    const audit = buildGroundingAudit(evidence(), status);
    expect(audit.status).toBe(status);
    expect(audit.identityMatches).toBeNull();
    expect(audit.reviewer).toBeUndefined();
    expect(audit.candidates[0].reviewerDecision).toBe("UNAVAILABLE");
    expect(audit.candidates[0].quotes[0].text).toBe(quote);
  },
);
it("omits sensitive text and never saves private fields or raw reasoning", () => {
  const r = evidence();
  r.facts[0].statement = "Contact private.person@example.invalid using Bearer private-secret-token";
  r.facts[0].quotes[0].text = "Email private.person@example.invalid";
  r.sources[1].excerpt += " Email private.person@example.invalid";
  const audit = buildGroundingAudit(r, {
    ...accepted,
    identityMatches: false,
    concerns: [concern("Private reasoning: private.person@example.invalid token=secret")],
  });
  const serialized = JSON.stringify(audit);
  expect(serialized).not.toMatch(
    /private\.person|Bearer|private-secret-token|token=secret|Private reasoning/,
  );
  expect(audit.candidates[0].statementOmitted).toBe("SENSITIVE_CONTENT");
  expect(audit.candidates[0].quotes[0].textOmitted).toBe("SENSITIVE_CONTENT");
});
it("does not store invented quotes or unknown source identifiers as exact public evidence", () => {
  const r = evidence();
  r.facts[0].quotes = [{ sourceId: "private-secret-source", text: "Invented unsupported quote." }];
  const audit = buildGroundingAudit(r, "UNAVAILABLE");
  expect(audit.candidates[0].quotes[0]).toMatchObject({
    sourceId: "unknown-source",
    exactMatch: false,
    textOmitted: "NOT_EXACT_PUBLIC_SOURCE",
  });
  expect(JSON.stringify(audit)).not.toContain("Invented unsupported quote");
  expect(JSON.stringify(audit)).not.toContain("private-secret-source");
});
it("bounds audit text at 12000 characters without truncating an exact quote", () => {
  const r = evidence();
  const long = "Public company description ".repeat(30);
  r.sources[1].excerpt = long;
  r.facts = Array.from({ length: 12 }, (_, i) => ({
    ...fact,
    id: "account:test" + i,
    statement: "Public company description.",
    quotes: Array.from({ length: 4 }, () => ({ sourceId: source.id, text: long })),
  }));
  const audit = buildGroundingAudit(r, "UNAVAILABLE");
  const texts = audit.candidates.flatMap((c) => [
    c.statement ?? "",
    ...c.quotes.map((q) => q.text ?? ""),
  ]);
  expect(texts.join("").length).toBeLessThanOrEqual(12000);
  expect(
    audit.candidates.some((c) => c.quotes.some((q) => q.textOmitted === "AUDIT_TEXT_LIMIT")),
  ).toBe(true);
  expect(
    audit.candidates
      .flatMap((c) => c.quotes)
      .filter((q) => q.text)
      .every((q) => q.text === long),
  ).toBe(true);
  expect(groundingAuditSchema.parse(audit)).toEqual(audit);
});
