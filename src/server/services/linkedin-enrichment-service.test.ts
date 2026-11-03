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
      expect(result.data.rawProspectContext).toContain("Current: Head of Performance Marketing at Acme Co.");
      expect(result.data.rawProspectContext).not.toMatch(/Title:|Note:|preview-level data/i);
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
      expect(result.data.rawProspectContext).toContain("Current: Head of Performance Marketing at Acme Co.");
      expect(result.data.rawProspectContext).toContain("paid search and demand gen");
      expect(result.data.rawProspectContext).not.toMatch(/Public profile snippet|from LinkedIn link preview|Note:/i);
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
      expect(result.data.rawProspectContext).not.toMatch(/Public profile snippet|preview-level data|Note:/i);
    }
  });

  it("keeps LinkedIn login-preview boilerplate out of generated context", async () => {
    const result = await enrichLinkedInProspect(
      { linkedinUrl: "https://www.linkedin.com/in/jane-doe" },
      async () => null,
      async () => ({
        title: "Login | LinkedIn",
        description: "Login to LinkedIn to keep in touch with people you know.",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider).toBe("PUBLIC_PREVIEW");
      expect(result.data.rawProspectContext).not.toMatch(/Login to LinkedIn|keep in touch|Public profile snippet/i);
    }
  });

  it("parses LinkedIn dash-separated preview titles into clean current context", async () => {
    const result = await enrichLinkedInProspect(
      { linkedinUrl: "https://www.linkedin.com/in/dana-levi" },
      async () => null,
      async () => ({
        title: "Dana Levi - Head of Performance Marketing - Northwind Retail | LinkedIn",
        description: undefined,
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rawProspectContext).toContain("Name: Dana Levi");
      expect(result.data.rawProspectContext).toContain("Current: Head of Performance Marketing at Northwind Retail.");
      expect(result.data.rawProspectContext).not.toMatch(/Dana Levi - Head of Performance Marketing -/i);
    }
  });

  it("filters sign-up preview boilerplate", async () => {
    const result = await enrichLinkedInProspect(
      { linkedinUrl: "https://www.linkedin.com/in/dana-levi" },
      async () => null,
      async () => ({
        title: "Sign Up | LinkedIn",
        description: "500 million+ members | Manage your professional identity.",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rawProspectContext).not.toMatch(/Sign Up|500 million|professional identity/i);
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
