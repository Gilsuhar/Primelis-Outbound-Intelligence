// @vitest-environment node
import { expect, it } from "vitest";
import { signalContactDecision } from "./contact";
import {
  setupSignalContactFixture as setup,
  signalContactInput as input,
} from "@/test/signal-contact-fixtures";
import { collectionNow } from "@/test/sales-agent-collection-fixtures";

it.each(["CMO", "Chief Marketing Officer"])(
  "preserves the independently verified %s exception without inventing Search ownership",
  async (title) => {
    const deps = await setup();
    const employment = deps.snapshot.verification!.EMPLOYMENT!.result!;
    if (employment.kind !== "EMPLOYMENT") throw new Error("FIXTURE_ERROR");
    Object.assign(employment, {
      role: title,
      seniority: "C_LEVEL",
      searchResponsibility: "UNKNOWN",
      responsibilityScope: "UNKNOWN",
      responsibilityEvidence: [],
    });
    deps.snapshot.observations.find((o) => o.field === "role")!.value = title;
    deps.snapshot.observations.find((o) => o.field === "paidSearchResponsibility")!.value =
      "UNKNOWN";
    await deps.evidence.save("owner", [deps.snapshot]);
    const result = await signalContactDecision(
      "owner",
      { ...input, prospectTitle: title },
      collectionNow,
      deps,
    );
    expect(result.ready).toBe(true);
    expect(result.contact?.reason).toContain("campaign ownership is not inferred");
    employment.current = false;
    await deps.evidence.save("owner", [deps.snapshot]);
    expect(
      (
        await signalContactDecision(
          "owner",
          { ...input, prospectTitle: title },
          collectionNow,
          deps,
        )
      ).ready,
    ).toBe(false);
  },
);

it.each(["VP Growth", "Head of Performance Marketing", "Head of Paid Social", "Fractional CMO"])(
  "never extends the CMO exception to %s",
  async (title) => {
    const deps = await setup();
    const employment = deps.snapshot.verification!.EMPLOYMENT!.result!;
    if (employment.kind !== "EMPLOYMENT") throw new Error("FIXTURE_ERROR");
    Object.assign(employment, {
      role: title,
      searchResponsibility: "UNKNOWN",
      responsibilityScope: "UNKNOWN",
      responsibilityEvidence: [],
    });
    deps.snapshot.observations.find((o) => o.field === "role")!.value = title;
    deps.snapshot.observations.find((o) => o.field === "paidSearchResponsibility")!.value =
      "UNKNOWN";
    await deps.evidence.save("owner", [deps.snapshot]);
    expect(
      (
        await signalContactDecision(
          "owner",
          { ...input, prospectTitle: title },
          collectionNow,
          deps,
        )
      ).ready,
    ).toBe(false);
  },
);
it("requires every authoritative contact gate plus explicit independent Paid Search responsibility", async () => {
  const deps = await setup();
  expect(await signalContactDecision("owner", input, collectionNow, deps)).toMatchObject({
    ready: true,
    blockers: [],
    contact: { title: "Head of Paid Search" },
  });
  expect(
    JSON.stringify(await signalContactDecision("owner", input, collectionNow, deps)),
  ).not.toContain("prospect@example.com");
  expect((await signalContactDecision("another-owner", input, collectionNow, deps)).ready).toBe(
    false,
  );
});
it.each([
  "title-only",
  "surfe",
  "catch-all",
  "expired",
  "missing-proof",
  "pending-verification",
  "changed-email",
  "partial-history",
  "recent-outbound",
  "sequence",
  "suppression",
  "integration-disconnected",
])("HOLD for %s, even with otherwise eligible observations", async (caseName) => {
  const deps = await setup(),
    s = deps.snapshot,
    e = s.verification!.EMPLOYMENT!.result!,
    email = s.verification!.EMAIL!.result!;
  if (caseName === "title-only" && e.kind === "EMPLOYMENT") e.responsibilityEvidence = [];
  if (caseName === "surfe") e.proof.providerId = "SURFE";
  if (caseName === "catch-all" && email.kind === "EMAIL") email.status = "CATCH_ALL";
  if (caseName === "expired") e.proof.checkedAt = "2025-01-01T00:00:00Z";
  if (caseName === "missing-proof") s.verification = {};
  if (caseName === "pending-verification") s.verification!.EMPLOYMENT!.state = "RUNNING";
  if (caseName === "changed-email") s.contact.email = "changed@example.com";
  if (caseName === "partial-history")
    s.observations.find((o) => o.field === "outreachHistoryComplete")!.value = false;
  if (caseName === "recent-outbound")
    s.observations.find((o) => o.field === "lastOutboundAt")!.value = "2026-06-16T12:00:00Z";
  if (caseName === "sequence")
    s.observations.find((o) => o.field === "activeSequence")!.value = true;
  if (caseName === "suppression")
    deps.evidence.suppressionRecords = async () => [
      {
        id: "fixture",
        companyName: "Fixture Company",
        domain: "example.com",
        status: "DO_NOT_CONTACT",
      },
    ];
  if (caseName === "integration-disconnected") deps.integrations.rows.clear();
  await deps.evidence.save("owner", [s]);
  expect((await signalContactDecision("owner", input, collectionNow, deps)).ready).toBe(false);
});
it("preserves the exact four-calendar-month boundary, not a 120-day substitute", async () => {
  const deps = await setup();
  const outbound = deps.snapshot.observations.find((o) => o.field === "lastOutboundAt")!;
  outbound.value = "2026-06-15T12:00:00Z";
  await deps.evidence.save("owner", [deps.snapshot]);
  expect((await signalContactDecision("owner", input, collectionNow, deps)).ready).toBe(true);
  outbound.value = "2026-06-15T12:00:01Z";
  await deps.evidence.save("owner", [deps.snapshot]);
  expect((await signalContactDecision("owner", input, collectionNow, deps)).ready).toBe(false);
});
