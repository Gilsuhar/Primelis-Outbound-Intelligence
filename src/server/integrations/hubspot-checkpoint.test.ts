// @vitest-environment node
import { expect, it, vi } from "vitest";
import { HubSpotConnector } from "./hubspot";
const since = "2026-01-01T00:00:00Z", until = "2026-11-03T09:00:00Z";
const record = (id: string, owner = "1087915602") => ({ id, properties: { hubspot_owner_id: owner } });
function setup(results: ReturnType<typeof record>[]) {
  const fetcher = vi.fn(async () => Response.json({ results }));
  return { fetcher, reader: new HubSpotConnector({ token: "synthetic", portalId: "123" }, { fetcher }) };
}
it.each([[record("50"), record("49")], [record("50"), record("50", "other")]])("rejects a page that could corrupt the incremental checkpoint", async (...records) => {
  const { reader } = setup(records);
  await expect(reader.discover(since, until)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("retains same-ID deduplication and uses the final ordered ID on a full page", async () => {
  const { reader } = setup(Array.from({ length: 100 }, (_, i) => record(String(i + 1))));
  expect((await reader.discover(since, until)).next).toBe("100");
  expect((await setup([record("50"), record("50")]).reader.discover(since, until)).ids).toEqual(["50"]);
});
it.each([["invalid", until, undefined], [until, since, undefined], [since, until, "not-an-id"]])("rejects invalid windows before any provider request", async (start, end, cursor) => {
  const { reader, fetcher } = setup([]);
  await expect(reader.discover(start!, end!, cursor)).rejects.toMatchObject({ code: "CONFIGURATION" });
  expect(fetcher).not.toHaveBeenCalled();
});
