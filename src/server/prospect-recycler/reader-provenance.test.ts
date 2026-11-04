// @vitest-environment node
import { expect, it, vi } from "vitest";
import { HubSpotRecyclerReader } from "./hubspot";
import { OutreachRecyclerReader } from "./outreach";
import { toRecyclerInput } from "./pipeline";
import { emptySnapshot } from "./shared";
const now = "2026-11-03T09:00:00Z";
it("enforces the only authorized owner before reading any contact", () => {
  const read = vi.fn();
  expect(() => new HubSpotRecyclerReader({ read }, { ownerId: "42", asOf: now })).toThrow();
  expect(read).not.toHaveBeenCalled();
});
it("retains source timestamps and company observations without inventing USD or historical authority", async () => {
  const read = vi.fn(async (path: string) => {
    if (path.includes('/contacts/1?')) return { id: "1", properties: { hubspot_owner_id: "1087915602", firstname: "Synthetic", email: "test@acme.example", jobtitle: "Director of SEM", createdate: "2020-01-01T00:00:00Z", lastmodifieddate: now } };
    if (path.includes('associations/companies')) return { results: [{ toObjectId: "2" }] };
    if (path.includes('/companies/2?')) return { id: "2", properties: { name: "Synthetic Acme", domain: "acme.example", numberofemployees: "80", annualrevenue: "30,000,000" } };
    if (path.includes('associations/emails')) return { results: [] };
    throw Error('Unexpected fixture path');
  });
  const snapshot = await new HubSpotRecyclerReader({ read }, { ownerId: "1087915602", asOf: now }).collect("1");
  expect(snapshot.prospect.profile).toMatchObject({ title: "Director of SEM", createdAt: "2020-01-01T00:00:00.000Z", company: { employees: 80, annualRevenue: 30_000_000, currency: "UNKNOWN" } });
  expect(snapshot.historyTraversal).toBe("COMPLETE");
  expect(snapshot.history.authoritative).toBe(false);
  expect(snapshot.history.status).toBe("PARTIAL");
});
it("retains Outreach replies/opens as engagement, never as last outbound", async () => {
  const read = vi.fn(async (path: string) => {
    if (path === '/api/v2/prospects/7') return { data: { id: "7", type: "prospect", attributes: { firstName: "Synthetic", emails: ["test@acme.example"] }, relationships: { owner: { data: { id: "9" } } } } };
    if (path.includes('/mailings?')) return { data: [{ id: "8", type: "mailing", relationships: { prospect: { data: { id: "7" } } }, attributes: { deliveredAt: "2026-01-01T00:00:00Z", openedAt: "2026-11-02T00:00:00Z", repliedAt: now } }] };
    if (path.includes('/sequenceStates?')) return { data: [] };
    throw Error('Unexpected fixture path');
  });
  const snapshot = await new OutreachRecyclerReader({ read }, now).collect("7");
  expect(snapshot.engagement?.map(e => e.kind)).toEqual(["OPEN", "REPLY"]);
  expect(snapshot.communications).toHaveLength(1);
  expect(snapshot.communications[0].at).toBe("2026-01-01T00:00:00.000Z");
  expect(snapshot.prospect.profile?.ownerId).toBe("9");
});
it.each(["BOUNCE_CLASSIFICATION_UNKNOWN", "UNSUBSCRIBE_TIMESTAMP_INVALID", "COMPLAINT_TIMESTAMP_INVALID"])("keeps %s unresolved despite supplemental clearance", code => {
  const snapshot = emptySnapshot({ record: { system: "OUTREACH", id: "7" }, fullName: "Synthetic", emails: ["test@acme.example"], email: "test@acme.example", employerDomain: "acme.example" }, now);
  snapshot.issues.push({ code, resource: "mailings" });
  expect(toRecyclerInput({ snapshots: [snapshot], resolution: "VERIFIED", issues: [] }, now).identity.resolution).toBe("UNRESOLVED");
});
