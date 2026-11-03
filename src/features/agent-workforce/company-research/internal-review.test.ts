import { expect, it } from "vitest";
import {
  companyRequestSchema,
  internalAnalysisSchema,
  internalDocumentSchema,
} from "./internal-review";
const analysis = () => ({
  version: 1,
  kind: "AGENT_ASSISTED_INTERNAL_REVIEW",
  company: "Fictional company",
  companyDomain: null,
  preparedAt: "2026-10-20T09:00:00.000Z",
  recipient: "Generic Paid Search team — not a verified contact",
  conclusion: "INSUFFICIENT_EVIDENCE",
  summary: "An internal hypothesis only.",
  evidence: [
    {
      id: "e1",
      statement: "Fictional observation",
      url: "https://fictional.example/",
      quote: "Fictional excerpt",
      observedAt: "2026-10-20T09:00:00.000Z",
      limitation: "Synthetic only",
    },
  ],
  screenshot: null,
  angles: ["SELECTED", "REJECT"].map((decision, i) => ({
    id: `a${i}`,
    title: `Different angle ${i}`,
    evidenceIds: ["e1"],
    hypothesis: "Hypothesis",
    limitations: "Unobserved impact",
    decision,
    reason: "Evidence comparison",
  })),
  emails: [1, 2, 3, 4].map((i) => ({
    subject: `Fictional ${i}`,
    body: "Hi team,\nAn internal question.\nGil",
    evidenceIds: ["e1"],
    intent: "Internal review",
  })),
  productClaims: "NO_UNAPPROVED_CAPABILITY_OR_CUSTOMER_PROOF_CLAIMS",
  grounding: "NOT_RUN",
  independentQuality: "NOT_RUN",
  writerAssessment: "Not independent",
  blockers: ["No cleared contact"],
  outboundEligibility: "HOLD",
  approved: false,
  canSend: false,
  canEnroll: false,
});
it("supports name/domain-only requests including one-character company names", () => {
  for (const company of ["X", "New Company", "new-company.example"])
    expect(companyRequestSchema.parse({ company })).toEqual({ company });
});
it("accepts one bounded LinkedIn profile URL or pasted text, without treating either as verified", () => {
  const name = "Alice De Benetti";
  const linkedin = companyRequestSchema.parse({
    company: "swarovski.com",
    profile: { name, linkedinUrl: "https://www.linkedin.com/in/alice-example" },
  });
  expect(linkedin.profile).toEqual({
    name,
    linkedinUrl: "https://www.linkedin.com/in/alice-example",
  });
  const pasted = companyRequestSchema.parse({
    company: "swarovski.com",
    profile: {
      name,
      text: "Global One Search Lead. " + "User supplied profile detail. ".repeat(4),
    },
  });
  expect(pasted.profile?.text).toContain("User supplied");
  for (const profile of [
    { name, linkedinUrl: "http://www.linkedin.com/in/alice-example" },
    { name, linkedinUrl: "https://linkedin.com/company/swarovski" },
    { name, linkedinUrl: "https://linkedin.com/in/alice?tracking=1" },
    { name, linkedinUrl: "https://linkedin.com/in/alice", text: "also supplied" },
    { name, text: "too short" },
  ])
    expect(companyRequestSchema.safeParse({ company: "swarovski.com", profile }).success).toBe(
      false,
    );
});
it("permits four generic internal examples while outbound clearance remains HOLD", () => {
  const parsed = internalAnalysisSchema.parse(analysis());
  expect(parsed.emails).toHaveLength(4);
  expect(parsed.outboundEligibility).toBe("HOLD");
});
it("rejects contact substitution, invented independent approval and outbound flags", () => {
  for (const change of [
    { recipient: "A real CRM contact" },
    { approved: true },
    { canSend: true },
    { canEnroll: true },
    { outboundEligibility: "Eligible" },
    { independentQuality: "PASS" },
    { grounding: "ACCEPTED" },
  ])
    expect(internalAnalysisSchema.safeParse({ ...analysis(), ...change }).success).toBe(false);
});
it("rejects unknown citation IDs and duplicated evidence identifiers", () => {
  const review = analysis();
  review.emails[0].evidenceIds = ["invented"];
  expect(internalAnalysisSchema.safeParse(review).success).toBe(false);
  const other = analysis();
  other.evidence.push(other.evidence[0]);
  expect(internalAnalysisSchema.safeParse(other).success).toBe(false);
});
it("keeps unknown screenshot metadata unknown, and never infers US from VPN", () => {
  const unknown = { value: null, basis: "UNKNOWN" };
  const screenshot = {
    sha256: "a".repeat(64),
    query: unknown,
    market: unknown,
    device: unknown,
    capturedAt: unknown,
    missingContext: ["query", "market", "device", "capturedAt"],
    advertisers: [],
    brandPresence: "UNCLEAR",
    limitation: "Needs image/context review",
  };
  expect(
    internalAnalysisSchema.parse({ ...analysis(), screenshot }).screenshot?.market.value,
  ).toBeNull();
  expect(
    internalAnalysisSchema.safeParse({
      ...analysis(),
      screenshot: {
        ...screenshot,
        market: { value: "US", basis: "VPN_CONNECTED" },
      },
    }).success,
  ).toBe(false);
  expect(
    internalAnalysisSchema.safeParse({
      ...analysis(),
      screenshot: {
        ...screenshot,
        missingContext: [],
      },
    }).success,
  ).toBe(false);
});
it("binds the review to company identity and the exact uploaded image", () => {
  const document = {
    version: 1,
    id: "d1db3adc-baad-4fd0-93ba-231f33dc94a6",
    owner: "actor",
    company: "Different company",
    createdAt: "2026-10-20T09:00:00.000Z",
    image: null,
    review: analysis(),
  };
  expect(internalDocumentSchema.safeParse(document).success).toBe(false);
  const review = analysis();
  const unknown = { value: null, basis: "UNKNOWN" };
  expect(
    internalDocumentSchema.safeParse({
      ...document,
      company: review.company,
      review: {
        ...review,
        screenshot: {
          sha256: "a".repeat(64),
          query: unknown,
          market: unknown,
          device: unknown,
          capturedAt: unknown,
          missingContext: ["query", "market", "device", "capturedAt"],
          advertisers: [],
          brandPresence: "UNCLEAR",
          limitation: "Unknown",
        },
      },
    }).success,
  ).toBe(false);
});
