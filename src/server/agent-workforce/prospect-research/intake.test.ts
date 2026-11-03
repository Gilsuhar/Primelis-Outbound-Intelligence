import { describe, expect, it, vi } from "vitest";
import { enqueueResearchBatch } from "./intake";
import { initialState } from "@/server/integrations/contracts";
import type { IntegrationStore, StoredIntegration } from "@/server/integrations/store";
import type { ProspectResearchEngine } from "./engine";
function setup() {
  const row: StoredIntegration = {
    state: {
      ...initialState("HUBSPOT"),
      status: "CONNECTED",
      watermark: "2026-10-16T00:00:00Z",
      researchIntake: { cursor: "25", checkedAt: "2026-10-16T00:00:00Z", error: null },
    },
    version: 1,
    secret: null,
  };
  const change: IntegrationStore["change"] = async (_actor, _provider, callback) =>
    (await callback(row)).value;
  const integrations = {
    get: async () => row,
    change,
    claim: async () => true,
    release: async () => {},
  } satisfies IntegrationStore;
  const enqueue = vi.fn(async () => ({ records: [], next: "50" }));
  const engine = { enqueue } as unknown as ProspectResearchEngine;
  return { row, integrations, engine, enqueue };
}
describe("durable research batch cursor separate from CRM checkpoint", () => {
  it("resumes the next stable-ID page without changing CRM watermark or status", async () => {
    const ctx = setup();
    await enqueueResearchBatch("actor", ctx);
    expect(ctx.enqueue).toHaveBeenCalledWith("actor", { after: "25", limit: 25 });
    expect(ctx.row.state.researchIntake?.cursor).toBe("50");
    expect(ctx.row.state.status).toBe("CONNECTED");
    expect(ctx.row.state.watermark).toBe("2026-10-16T00:00:00Z");
  });
  it("retains the last cursor on failure and records an explicit safe diagnostic", async () => {
    const ctx = setup();
    ctx.enqueue.mockRejectedValueOnce(new Error("secret fixture"));
    await expect(enqueueResearchBatch("actor", ctx)).rejects.toThrow("RESEARCH_INTAKE_UNAVAILABLE");
    expect(ctx.row.state.researchIntake?.cursor).toBe("25");
    expect(ctx.row.state.researchIntake?.error).not.toContain("secret fixture");
    expect(ctx.row.state.status).toBe("CONNECTED");
  });
  it("wraps completed pagination for incremental identity/freshness checks", async () => {
    const ctx = setup();
    ctx.enqueue.mockResolvedValueOnce({ records: [], next: null } as unknown as {
      records: never[];
      next: string;
    });
    await enqueueResearchBatch("actor", ctx);
    expect(ctx.row.state.researchIntake?.cursor).toBeNull();
  });
});
