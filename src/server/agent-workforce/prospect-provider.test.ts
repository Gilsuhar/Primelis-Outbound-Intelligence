import { describe, expect, it, vi } from "vitest";
import { authorizedProspectSource } from "./prospect-provider";
import { workforceIntake, testNow } from "@/test/workforce-fixtures";
const intake = { ...workforceIntake, linkedinUrl: "https://www.linkedin.com/in/test-only" };
const record = {
  success: true,
  full_name: intake.prospectName,
  job_title: intake.prospectTitle,
  company_name: intake.companyName,
  company_domain: intake.companyDomain,
  email: "private@example.com",
};
describe("existing authorized profile provider reuse", () => {
  it("retains only matched professional facts and never sends email fields to research", async () => {
    const provider = vi.fn().mockResolvedValue(record);
    const source = await authorizedProspectSource(intake, testNow, provider);
    expect(provider).toHaveBeenCalledWith(intake.linkedinUrl);
    expect(source?.sourceType).toBe("AUTHORIZED_PROVIDER");
    expect(source?.excerpt).toContain(
      `${intake.prospectName} is ${intake.prospectTitle} at ${intake.companyName}`,
    );
    expect(JSON.stringify(source)).not.toContain("private@example.com");
  });
  it.each([
    { full_name: "Wrong Person" },
    { company_domain: "other.example" },
    { company_name: "Other Company" },
    { job_title: "Former employee" },
  ])("rejects incorrect identity/employer/remit: %j", async (change) => {
    expect(
      await authorizedProspectSource(intake, testNow, async () => ({ ...record, ...change })),
    ).toBeNull();
  });
});
