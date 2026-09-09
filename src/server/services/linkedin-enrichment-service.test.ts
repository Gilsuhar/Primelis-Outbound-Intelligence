import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { enrichLinkedInProspect } from "./linkedin-enrichment-service";

const originalKey = process.env.GETLEADS_API_KEY;

describe("enrichLinkedInProspect", () => {
  beforeEach(() => {
    process.env.GETLEADS_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.GETLEADS_API_KEY = originalKey;
  });

  it("rejects a missing url", async () => {
    const result = await enrichLinkedInProspect({ linkedinUrl: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-linkedin url", async () => {
    const result = await enrichLinkedInProspect({ linkedinUrl: "https://example.com/in/foo" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_URL");
  });

  it("succeeds with a helpful fallback when neither source returns data", async () => {
    const result = await enrichLinkedInProspect(
      { linkedinUrl: "https://www.linkedin.com/in/jane-doe" },
      async () => null,
      async () => null,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider).toBe("NONE");
      expect(result.data.rawProspectContext).toContain("No enrichment data");
    }
  });

  it("builds context from GetLeads data alone", async () => {
    const result = await enrichLinkedInProspect(
      { linkedinUrl: "https://www.linkedin.com/in/jane-doe" },
      async () => ({
        success: true,
        linkedin_url: "https://www.linkedin.com/in/jane-doe",
        full_name: "Jane Doe",
        job_title: "Head of Performance Marketing",
        company_name: "Acme Co",
        company_website: "acme.com",
      }),
      async () => null,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider).toBe("GETLEADS");
      expect(result.data.rawProspectContext).toContain("Jane Doe");
      expect(result.data.rawProspectContext).toContain("Acme Co");
      expect(result.data.record?.company_name).toBe("Acme Co");
    }
  });

  it("builds context from the public preview alone when GetLeads has no match", async () => {
    const result = await enrichLinkedInProspect(
      { linkedinUrl: "https://www.linkedin.com/in/jane-doe" },
      async () => null,
      async () => ({
        title: "Jane Doe - Head of Performance Marketing at Acme Co",
        description: "Growth marketer focused on paid search and demand gen.",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider).toBe("PUBLIC_PREVIEW");
      expect(result.data.rawProspectContext).toContain("Public headline");
      expect(result.data.rawProspectContext).toContain("paid search and demand gen");
    }
  });

  it("merges both sources when available", async () => {
    const result = await enrichLinkedInProspect(
      { linkedinUrl: "https://www.linkedin.com/in/jane-doe" },
      async () => ({ success: true, full_name: "Jane Doe", company_name: "Acme Co" }),
      async () => ({ description: "Recently posted about brand SERP defense." }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider).toBe("GETLEADS_AND_PREVIEW");
      expect(result.data.rawProspectContext).toContain("Jane Doe");
      expect(result.data.rawProspectContext).toContain("brand SERP defense");
    }
  });

  it("does not fail the whole lookup when one provider throws", async () => {
    const result = await enrichLinkedInProspect(
      { linkedinUrl: "https://www.linkedin.com/in/jane-doe" },
      async () => {
        throw new Error("GetLeads timeout");
      },
      async () => ({ title: "Jane Doe" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider).toBe("PUBLIC_PREVIEW");
    }
  });
});
