// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/sales-agent/evidence-store", () => {
  let snapshots: import("@/server/sales-agent/evidence-store").EvidenceSnapshot[] = [];
  return {
    PrismaEvidenceStore: class {
      async save(
        _actor: string,
        next: import("@/server/sales-agent/evidence-store").EvidenceSnapshot[],
      ) {
        snapshots = next;
      }
      async list() {
        return snapshots;
      }
      async suppressionRecords() {
        return [];
      }
    },
  };
});
import { getCurrentUser } from "@/lib/auth/server";
import { GET, POST } from "./route";
import { collectionNow } from "@/test/sales-agent-collection-fixtures";

const request = (body: unknown, origin?: string) =>
  new Request("https://app.example.com/api/sales-agent/evidence", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
  });

describe("authenticated evidence collection/review API", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(collectionNow);
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "sales-user",
      email: "sales@example.com",
      role: "SALES_USER",
    });
    vi.stubEnv("HUBSPOT_PRIVATE_APP_TOKEN", "fixture-token");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("authenticates before any provider request or evidence access", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(request({}))).status).toBe(401);
    expect((await GET()).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("runs the real HubSpot adapter, normalization, storage and planner on fixture HTTP responses", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const path = String(url);
      if (path.endsWith("/search"))
        return Response.json({
          results: [{ id: "42", properties: { hubspot_owner_id: "1087915602" } }],
        });
      return Response.json({
        id: "42",
        properties: {
          hubspot_owner_id: "1087915602",
          firstname: "Fixture",
          jobtitle: "Director of PPC",
        },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request({}));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.rows[0].plan.decision.status).toBe("HOLD");
    expect(body.data.rows[0].plan.decision.reasons).toContain("Outreach history incomplete");
    const saved = await GET();
    expect(saved.status).toBe(200);
    expect((await saved.json()).data.rows[0].contact.hubspotRecordId).toBe("42");
    expect(
      fetcher.mock.calls.every(
        ([url, init]) => init?.method === (String(url).endsWith("/search") ? "POST" : "GET"),
      ),
    ).toBe(true);
  });
  it.each([{ ownerId: "other" }, { actorId: "admin" }, { evidence: [] }, { after: "../admin" }])(
    "rejects unauthorized owner/actor/evidence overrides: %j",
    async (body) => {
      expect((await POST(request(body))).status).toBe(400);
    },
  );
  it("rejects cross-origin collection requests", async () => {
    expect((await POST(request({}, "https://foreign.example.com"))).status).toBe(403);
  });
  it("reports missing integration configuration without inserting fixtures", async () => {
    vi.stubEnv("HUBSPOT_PRIVATE_APP_TOKEN", "");
    const response = await POST(request({}));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("NOT_CONFIGURED");
  });
  it("returns safe errors for authentication failures", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("secret auth failure"));
    const response = await POST(request({}));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret auth failure");
  });
});
