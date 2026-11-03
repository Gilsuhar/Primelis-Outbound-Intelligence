import { describe, expect, it, vi } from "vitest";
import { createDemoFixtures, DEMO_LABEL, DEMO_TIME } from "./demo-fixtures";
import { buildSalesAgentDrafts, reviewDraftResearch, draftResearchSchema } from "./draft-engine";
import { reviewEvidenceSnapshot } from "@/server/services/sales-agent-collection-service";
const now = new Date(DEMO_TIME);
const qualified = () => createDemoFixtures()[0].snapshot;
const review = (snapshot = qualified(), clock = now) => reviewEvidenceSnapshot(snapshot, clock);

describe("isolated fictional qualification and actual four-email drafting", () => {
  it.each([
    [0, "READY"],
    [1, "REJECTED"],
    [2, "HOLD"],
    [3, "HOLD"],
    [4, "REJECTED"],
  ] as const)("fixture %i preserves qualification %s", (index, status) => {
    const snapshot = createDemoFixtures()[index].snapshot;
    const row = review(snapshot);
    expect(row.plan.decision.status).toBe(status);
    expect(row.drafting.emails).toHaveLength(status === "READY" ? 4 : 0);
    expect(snapshot.contact.hubspotRecordId).toMatch(/^test-fixture-/);
    expect(snapshot.contact.companyDomain).toMatch(/\.example$/);
    expect(
      snapshot.observations.every((item) => item.supportingEvidence.includes(DEMO_LABEL)),
    ).toBe(true);
    expect(row.drafting).toMatchObject({
      canSend: false,
      canEnroll: false,
      approved: false,
      humanApprovalRequired: true,
    });
    expect(row.plan.tasks.some((task) => task.stage === "OUTREACH_ENROLLMENT")).toBe(false);
  });
  it("creates four distinct concise angles in one thread with traceable facts and approved proof", () => {
    const snapshot = qualified();
    const { emails, status } = review(snapshot).drafting;
    expect(status).toBe("PENDING_HUMAN_REVIEW");
    expect(new Set(emails.map((email) => email.angle)).size).toBe(4);
    expect(emails.map((email) => email.day)).toEqual([1, 4, 9, 15]);
    expect(emails[0].threadMode).toBe("NEW_THREAD");
    for (const email of emails.slice(1)) {
      expect(email.threadMode).toBe("REPLY_TO_FIRST");
      expect(email.subject).toBe(`Re: ${emails[0].subject}`);
    }
    expect(emails[0].body).toContain(snapshot.research[0].text);
    expect(emails[1].body).toContain("United Kingdom, desktop, 2026-10-15");
    expect(emails[2].body).toContain(snapshot.research[3].text);
    for (const email of emails) {
      expect(`${email.body} ${email.cta}`.split(/\s+/).length).toBeLessThan(140);
      expect(email.cta.endsWith("?")).toBe(true);
      expect(email.body).not.toMatch(/\d+%|guarantee|save \d/i);
      for (const source of email.sources)
        expect(
          snapshot.research.some(
            (entry) => entry.id === source.id && entry.sourceUrl === source.url,
          ),
        ).toBe(true);
    }
  });
  it("keeps qualified prospects READY while holding unsupported email steps for research", () => {
    const snapshot = qualified();
    snapshot.research = [];
    const row = review(snapshot);
    expect(row.plan.decision.status).toBe("READY");
    expect(row.drafting.emails.map((email) => email.status)).toEqual([
      "REQUIRES_RESEARCH",
      "REQUIRES_RESEARCH",
      "REQUIRES_RESEARCH",
      "PENDING_HUMAN_REVIEW",
    ]);
    expect(row.drafting.emails[1].sources).toEqual([]);
    expect(row.drafting.emails[1].body).toContain("No competitor activity has been inferred");
  });
  it.each(["keyword", "market", "device", "screenshotUrl", "searchEngine"] as const)(
    "requires SERP metadata: %s",
    (field) => {
      const snapshot = qualified();
      delete snapshot.research[2][field];
      expect(review(snapshot).drafting.emails[1].status).toBe("REQUIRES_RESEARCH");
    },
  );
  it.each([
    { manuallyVerified: false },
    { verifiedAt: null },
    { observedAt: "2026-09-01T08:00:00Z" },
    { observedAt: "2026-10-16T08:00:00Z" },
    { verifiedAt: "2026-10-16T08:00:00Z" },
    { observedAt: "2026-02-30T08:00:00Z" },
    { companyDomain: "other.example" },
    { observedAt: "2026-10-15T13:00:00Z", verifiedAt: "2026-10-15T12:00:00Z" },
  ])("rejects unverified, stale, future, invalid or wrong-company research: %j", (change) => {
    const snapshot = qualified();
    Object.assign(snapshot.research[2], change);
    expect(review(snapshot).drafting.emails[1].status).toBe("REQUIRES_RESEARCH");
  });
  it("requires explicit approval of customer wording; preserves exactly approved metrics", () => {
    const snapshot = qualified();
    snapshot.research[3].approvedForOutbound = false;
    expect(review(snapshot).drafting.emails[2].status).toBe("REQUIRES_RESEARCH");
    snapshot.research[3].approvedForOutbound = true;
    snapshot.research[3].text =
      "Fictional approved test result: the fictional team reduced review time by 12%.";
    expect(review(snapshot).drafting.emails[2].body).toContain(snapshot.research[3].text);
    expect(review(snapshot).drafting.emails.filter((email) => /12%/.test(email.body))).toHaveLength(
      1,
    );
  });
  it("holds conflicting current facts, including unverified contradictory observations", () => {
    const snapshot = qualified();
    snapshot.research.push({
      ...snapshot.research[2],
      id: "contradiction",
      manuallyVerified: false,
      text: "A conflicting observation that requires a reviewer to resolve it.",
    });
    const row = review(snapshot);
    expect(row.drafting.findings[2].status).toBe("CONFLICT");
    expect(row.drafting.emails[1].sources).toEqual([]);
  });
  it("never uses or returns another contact's research, or a different contact's plan", () => {
    const first = qualified();
    const other = createDemoFixtures()[1].snapshot;
    const alien = {
      ...first.research[0],
      id: "private-other-contact",
      contactId: other.contact.hubspotRecordId,
      text: "Secret other-contact business fact never copied.",
    };
    first.research = [alien];
    const row = review(first);
    expect(JSON.stringify(row.drafting)).not.toContain(alien.text);
    expect(reviewDraftResearch(first.contact, [alien], now)[0].status).toBe("MISSING");
    expect(buildSalesAgentDrafts(other.contact, row.plan, first.research, now).status).toBe(
      "BLOCKED",
    );
  });
  it("rechecks expiry on refresh and never trusts research to override a safety restriction", () => {
    const snapshot = qualified();
    expect(review(snapshot, new Date("2026-11-16T12:00:00Z")).drafting.emails).toEqual([]);
    for (const index of [2, 3, 4]) {
      const blocked = createDemoFixtures()[index].snapshot;
      blocked.research = snapshot.research.map((entry) => ({
        ...entry,
        contactId: blocked.contact.hubspotRecordId,
        companyDomain: blocked.contact.companyDomain!,
      }));
      expect(review(blocked).drafting.status).toBe("BLOCKED");
    }
  });
  it("is pure and never calls sending, enrollment, network or storage", () => {
    const fetcher = vi.fn(() => {
      throw new Error("Unexpected network call");
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const snapshot = qualified();
      const before = JSON.stringify(snapshot);
      review(snapshot);
      review(snapshot);
      expect(JSON.stringify(snapshot)).toBe(before);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("rejects credential-bearing URLs and undeclared eligibility/provider fields", () => {
    const entry = qualified().research[0];
    expect(draftResearchSchema.safeParse({ ...entry, sourceUrl: "not-a-url" }).success).toBe(false);
    expect(
      draftResearchSchema.safeParse({ ...entry, sourceUrl: "https://user:password@example.com" })
        .success,
    ).toBe(false);
    expect(draftResearchSchema.safeParse({ ...entry, unsubscribed: false }).success).toBe(false);
  });
});
