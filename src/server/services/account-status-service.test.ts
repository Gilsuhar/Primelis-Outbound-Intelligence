import { describe, expect, it } from "vitest";

import type { DoNotContactRecord } from "@/features/do-not-contact/types";

import {
  assertAccountCanGenerate,
  checkAccountStatus,
  type AccountStatusPersistence,
} from "./account-status-service";

function persistence({
  actorRole = "SALES_USER",
  suppressionRecords = [],
  recentDrafts = [],
  recentAssessments = [],
}: {
  actorRole?: string;
  suppressionRecords?: DoNotContactRecord[];
  recentDrafts?: Awaited<ReturnType<AccountStatusPersistence["getRecentDrafts"]>>;
  recentAssessments?: Awaited<ReturnType<AccountStatusPersistence["getRecentAssessments"]>>;
} = {}): AccountStatusPersistence {
  return {
    getActor: async (actorId) => ({ id: actorId, role: actorRole }),
    getSuppressionRecords: async () => suppressionRecords,
    getRecentDrafts: async () => recentDrafts,
    getRecentAssessments: async () => recentAssessments,
  };
}

describe("Account status service", () => {
  it("blocks existing customers before generation", async () => {
    const result = await checkAccountStatus(
      { companyName: "Apollo", companyDomain: "apollo.io" },
      {
        persistence: persistence({
          suppressionRecords: [
            {
              id: "apollo",
              companyName: "Zenleads Inc. DBA Apollo.io",
              domain: "apollo.io",
              status: "EXISTING_CUSTOMER",
              reason: "Existing Signal customer.",
            },
          ],
        }),
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("EXISTING_CLIENT");
      expect(result.data.severity).toBe("BLOCKED");
      expect(result.data.verified).toBe(true);
      expect(result.data.matchedOn).toBe("DOMAIN");
    }
  });

  it("requires an admin override for active opportunities", async () => {
    const suppressionRecords: DoNotContactRecord[] = [
      {
        id: "stripe",
        companyName: "Stripe",
        domain: "stripe.com",
        status: "ACTIVE_OPPORTUNITY",
        reason: "Open deal in HubSpot.",
      },
    ];

    const salesResult = await assertAccountCanGenerate(
      { companyName: "Stripe", companyDomain: "stripe.com" },
      { persistence: persistence({ suppressionRecords }) },
    );
    expect(salesResult).toMatchObject({
      ok: false,
      code: "ACCOUNT_STATUS_OVERRIDE_REQUIRED",
    });

    const adminResult = await assertAccountCanGenerate(
      {
        companyName: "Stripe",
        companyDomain: "stripe.com",
        overrideRequested: true,
      },
      { persistence: persistence({ actorRole: "KNOWLEDGE_ADMIN", suppressionRecords }) },
    );
    expect(adminResult.ok).toBe(true);
  });

  it("warns on recent generated drafts", async () => {
    const result = await checkAccountStatus(
      { companyName: "Nike", companyDomain: "nike.com" },
      {
        persistence: persistence({
          recentDrafts: [
            {
              id: "draft-1",
              workflow: "CREATE_OUTREACH",
              companyName: "Nike",
              companyDomain: "nike.com",
              createdAt: "2026-07-18T08:00:00.000Z",
            },
          ],
        }),
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("RECENT_OUTREACH");
      expect(result.data.severity).toBe("WARNING");
      expect(result.data.requiresOverride).toBe(true);
      expect(result.data.canOverride).toBe(true);
    }
  });

  it("allows sales users to override recent outreach warnings", async () => {
    const result = await assertAccountCanGenerate(
      {
        companyName: "Nike",
        companyDomain: "nike.com",
        overrideRequested: true,
      },
      {
        persistence: persistence({
          actorRole: "SALES_USER",
          recentDrafts: [
            {
              id: "draft-1",
              workflow: "CREATE_OUTREACH",
              companyName: "Nike",
              companyDomain: "nike.com",
              createdAt: "2026-07-18T08:00:00.000Z",
            },
          ],
        }),
      },
    );

    expect(result.ok).toBe(true);
  });

  it("returns prior qualification context as clear guidance", async () => {
    const result = await checkAccountStatus(
      { companyName: "Dynatrace", companyDomain: "dynatrace.com" },
      {
        persistence: persistence({
          recentAssessments: [
            {
              id: "assessment-1",
              companyName: "Dynatrace",
              domain: "dynatrace.com",
              qualificationResult: "Strong fit",
              recommendedNextAction: "Create outreach",
              createdAt: "2026-07-17T08:00:00.000Z",
            },
          ],
        }),
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe("Prior qualification found");
      expect(result.data.severity).toBe("CLEAR");
      expect(result.data.message).toContain("Strong fit");
    }
  });
});
