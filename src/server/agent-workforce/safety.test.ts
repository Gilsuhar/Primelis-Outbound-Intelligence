import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectedContact,
  collectionNow,
  verifiedObservations,
} from "@/test/sales-agent-collection-fixtures";
const state = vi.hoisted(() => ({ records: [] as unknown[], snapshots: [] as unknown[] }));
vi.mock("@/server/sales-agent/evidence-store", () => ({
  PrismaEvidenceStore: class {
    async suppressionRecords() {
      return state.records;
    }
    async list(actor: string) {
      return actor === "owner" ? state.snapshots : [];
    }
  },
}));
import { checkWorkforceEligibility } from "./safety";
const intake = {
  companyName: collectedContact.companyName!,
  companyDomain: collectedContact.companyDomain!,
  prospectName: collectedContact.fullName,
  prospectTitle: "Head of Paid Search",
};
beforeEach(() => {
  state.records = [];
  state.snapshots = [];
});
function saved() {
  return {
    version: 1,
    contact: collectedContact,
    observations: structuredClone(verifiedObservations),
    blockers: [],
    providers: [],
    collectedAt: collectionNow.toISOString(),
  };
}
describe("existing qualification and suppression protections", () => {
  it("does not reuse evidence across HubSpot IDs or a changed verified role", async () => {
    state.snapshots = [saved()];
    expect(
      (
        await checkWorkforceEligibility(
          "owner",
          { ...intake, hubspotRecordId: "other" },
          collectionNow,
        )
      ).status,
    ).toBe("HOLD");
    expect(
      (await checkWorkforceEligibility("owner", { ...intake, prospectTitle: "CMO" }, collectionNow))
        .status,
    ).toBe("HOLD");
  });

  it("leaves unknown history and manual identity HOLD without claiming outreach clearance", async () => {
    const result = await checkWorkforceEligibility("owner", intake, collectionNow);
    expect(result.status).toBe("HOLD");
    expect(result.reasons.join(" ")).toMatch(/history|eligibility/i);
  });
  it("blocks local company suppression before model execution", async () => {
    state.records = [
      {
        id: "blocked",
        companyName: intake.companyName,
        domain: intake.companyDomain,
        status: "DO_NOT_CONTACT",
      },
    ];
    expect(await checkWorkforceEligibility("owner", intake, collectionNow)).toMatchObject({
      status: "REJECTED",
      blockDrafting: true,
    });
  });
  it("uses only the current user's exact matching person/company evidence", async () => {
    state.snapshots = [saved()];
    expect((await checkWorkforceEligibility("owner", intake, collectionNow)).status).toBe("READY");
    expect((await checkWorkforceEligibility("other-user", intake, collectionNow)).status).toBe(
      "HOLD",
    );
    expect(
      (
        await checkWorkforceEligibility(
          "owner",
          { ...intake, prospectName: "Another Person" },
          collectionNow,
        )
      ).status,
    ).toBe("HOLD");
  });
  it("blocks a prospect contacted within four calendar months", async () => {
    const snapshot = saved();
    snapshot.observations.find((f) => f.field === "lastOutboundAt")!.value = "2026-10-10T08:00:00Z";
    state.snapshots = [snapshot];
    expect(await checkWorkforceEligibility("owner", intake, collectionNow)).toMatchObject({
      status: "HOLD",
      blockDrafting: true,
    });
  });
  it("normalizes www/domain variants before suppression and saved-evidence matching", async () => {
    state.records = [
      {
        id: "blocked",
        companyName: "Other label",
        domain: "www.example.com",
        status: "DO_NOT_CONTACT",
      },
    ];
    expect(
      await checkWorkforceEligibility(
        "owner",
        { ...intake, companyDomain: "www.example.com" },
        collectionNow,
      ),
    ).toMatchObject({ status: "REJECTED", blockDrafting: true });
  });
});
