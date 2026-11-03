import { emptySnapshot } from "./shared";
import { loadRecyclerReview } from "./review";
import { EMAIL_SCOPE, type Reader, type Snapshot } from "./types";

/** Fictional review fixtures only. No fabricated verification or authority receipts. */
export async function recyclerReviewDemo(asOf = "2026-10-25T09:00:00.000Z") {
  const make = (
    system: "HUBSPOT" | "OUTREACH",
    id: string,
    name: string,
    address: string,
  ): Snapshot =>
    emptySnapshot(
      {
        record: { system, id },
        fullName: name,
        emails: [address],
        email: address,
        employerDomain: "example.com",
      },
      asOf,
    );
  const hub = [
    make("HUBSPOT", "demo-h1", "Alex Review", "alex@example.com"),
    make("HUBSPOT", "demo-h2", "Sam Conflict", "sam@example.com"),
    make("HUBSPOT", "demo-h3", "Casey Optout", "casey@example.com"),
  ];
  const outreach = [
    make("OUTREACH", "demo-o1", "Jordan Delivery", "jordan@example.com"),
    make("OUTREACH", "demo-o2", "Sam Conflict", "sam@example.com"),
  ];
  hub[2].suppression.unsubscribed = true;
  outreach[0].communications.push({
    id: "demo-delivery",
    record: outreach[0].prospect.record,
    at: "2026-05-20T09:00:00.000Z",
    scopeId: EMAIL_SCOPE.id,
    channel: "EMAIL",
    direction: "OUTBOUND",
    outcome: "DELIVERED",
    relevance: "RELEVANT",
  });
  outreach[0].historyTraversal = "COMPLETE";
  outreach[0].history.status = "PARTIAL";
  outreach[0].issues.push({ code: "HISTORY_AUTHORITY_UNPROVEN", resource: "history" });
  const reader = (system: "HUBSPOT" | "OUTREACH", items: Snapshot[]): Reader => ({
    system,
    discover: async (limit) => ({
      items: items.slice(0, limit).map((s) => s.prospect),
      status: "COMPLETE",
      pages: 1,
      issues: [],
    }),
    collect: async (id) => structuredClone(items.find((s) => s.prospect.record.id === id)!),
  });
  return loadRecyclerReview({
    readers: { HUBSPOT: reader("HUBSPOT", hub), OUTREACH: reader("OUTREACH", outreach) },
    asOf,
    mode: "DEMO",
    limit: 5,
  });
}
