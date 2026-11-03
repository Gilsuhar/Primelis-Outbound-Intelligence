import { describe, expect, it } from "vitest";
import { qualityFixture } from "@/test/workforce-quality-fixtures";
import { testNow } from "@/test/workforce-fixtures";
import { reusableCompanyResearch } from "./company-reuse";
function setup() {
  const donor = qualityFixture("ECOMMERCE").run,
    target = structuredClone(donor);
  target.id = "different-synthetic-contact";
  target.intake.prospectName = "Another Fictional Person";
  return { donor, target };
}
describe("reviewed company evidence reuse, not contact or eligibility reuse", () => {
  it("copies only exact public company quotations without renewing their timestamps or expiry", () => {
    const { donor, target } = setup();
    donor.research.sources[0].excerpt += "\nMaya Chen has unrelated private contact context.";
    const reused = reusableCompanyResearch(donor, target, testNow)!;
    expect(reused.facts).toHaveLength(1);
    expect(reused.facts[0].subject).toBe("ACCOUNT");
    expect(JSON.stringify(reused)).not.toContain(donor.intake.prospectName);
    expect(reused.sources[0].observedAt).toBe(donor.research.sources[0].observedAt);
    expect(reused.expiresAt).toBe(donor.prospectResearch!.expiresAt);
    expect(reused).not.toHaveProperty("strategy");
    expect(reused).not.toHaveProperty("eligibility");
    expect(reused).not.toHaveProperty("sequence");
  });
  it.each([
    "domain",
    "company",
    "market",
    "unreviewed",
    "expired",
    "old-source",
    "future-source",
    "bad-quote",
    "personal-title",
    "personal-url",
    "personal-fact",
    "provider-source",
  ])("refuses %s reuse", (condition) => {
    const { donor, target } = setup();
    if (condition === "domain") target.intake.companyDomain = "other.example.com";
    if (condition === "company") target.intake.companyName = "Different Fictional Company";
    if (condition === "market") target.intake.targetMarket = "Germany";
    if (condition === "unreviewed") donor.prospectResearch!.stages.REVIEW.status = "WAITING";
    if (condition === "expired") donor.prospectResearch!.expiresAt = "2026-10-14T00:00:00Z";
    if (condition === "old-source") donor.research.sources[0].observedAt = "2026-10-14T17:00:00Z";
    if (condition === "future-source")
      donor.research.sources[0].observedAt = "2026-10-16T18:00:00Z";
    if (condition === "bad-quote")
      donor.research.facts[0].quotes[0].text = "Invented content absent from the retrieved page";
    if (condition === "personal-url")
      donor.research.sources[0].url = "https://cedartrail.example.com/team/Maya%20Chen";
    if (condition === "personal-title")
      donor.research.sources[0].title = "Interview with Maya Chen";
    if (condition === "personal-fact")
      donor.research.facts[0].limitations = ["Maya Chen's personal account"];
    if (condition === "provider-source")
      donor.research.sources[0].sourceType = "AUTHORIZED_PROVIDER";
    expect(reusableCompanyResearch(donor, target, testNow)).toBeNull();
  });
});
