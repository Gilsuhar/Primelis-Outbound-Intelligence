import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaEvidenceStore } from "@/server/sales-agent/evidence-store";
import { PrismaWorkforceStore } from "../store";
import { PrismaIntegrationStore } from "@/server/integrations/store";
import { initialState } from "@/server/integrations/contracts";
import { getWorkforceDashboard } from "./service";

// Exercise the API's default dependency wiring without touching any database or CRM.
beforeEach(() => {
  vi.spyOn(PrismaEvidenceStore.prototype, "list").mockResolvedValue([]);
  vi.spyOn(PrismaEvidenceStore.prototype, "suppressionRecords").mockResolvedValue([]);
  vi.spyOn(PrismaWorkforceStore.prototype, "list").mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe("dashboard integration loading with default API dependencies", () => {
  it("loads both actor-scoped sync states instead of returning fixture-only initial statuses", async () => {
    const get = vi
      .spyOn(PrismaIntegrationStore.prototype, "get")
      .mockImplementation(async (_actor, provider) => ({
        state: initialState(provider),
        version: 0,
        secret: null,
      }));
    const data = await getWorkforceDashboard("preview-actor");
    for (const id of ["HUBSPOT", "OUTREACH"] as const) {
      expect(get).toHaveBeenCalledWith("preview-actor", id);
      expect(data.integrations.find((integration) => integration.id === id)).toMatchObject({
        status: "DISCONNECTED",
        sync: initialState(id),
      });
    }
  });

  it("reports storage failure as ERROR rather than silently returning NOT_IMPLEMENTED", async () => {
    vi.spyOn(PrismaIntegrationStore.prototype, "get").mockRejectedValue(
      new Error("Storage unavailable"),
    );
    const data = await getWorkforceDashboard("preview-actor");
    for (const id of ["HUBSPOT", "OUTREACH"]) {
      const integration = data.integrations.find((item) => item.id === id)!;
      expect(integration.status).toBe("ERROR");
      expect(integration.detail).toContain("Integration persistence unavailable");
      expect(integration.sync).toBeUndefined();
    }
  });
});
