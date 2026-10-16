import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewEvidenceSnapshot } from "@/server/services/sales-agent-collection-service";
import { normalizeCollectedEvidence } from "@/features/sales-agent/evidence";
import {
  sameVerificationIdentity,
  verificationIdentity,
  type VerificationResult,
} from "@/features/sales-agent/verification/contracts";
import {
  collectedContact,
  collectionNow,
  verifiedObservations,
  MemoryEvidenceStore,
  observation,
} from "@/test/sales-agent-collection-fixtures";
import type { EvidenceSnapshot } from "@/server/sales-agent/evidence-store";
import { retryVerification, verificationObservations } from "./service";
import {
  GatewayVerificationAdapter,
  VerificationProviderError,
  ZeroBounceVerificationAdapter,
  type VerificationAdapter,
} from "./providers";
const email = (): VerificationResult => ({
  kind: "EMAIL",
  identity: verificationIdentity(collectedContact),
  status: "VERIFIED",
  businessEmail: true,
  proof: {
    providerId: "fictional-independent",
    sourceRecordId: "fictional-check-1",
    sourceUrl: "https://verification.example/checks/1",
    checkedAt: collectionNow.toISOString(),
    independent: true,
    evidence: ["Fictional independently validated mailbox; not a live record"],
  },
});
const employment = (): Extract<VerificationResult, { kind: "EMPLOYMENT" }> => ({
  kind: "EMPLOYMENT",
  identity: verificationIdentity(collectedContact),
  status: "VERIFIED",
  employerDomain: "example.com",
  current: true,
  role: "Head of Paid Search",
  seniority: "HEAD",
  searchResponsibility: "PROVEN",
  responsibilityScope: "PAID_SEARCH",
  responsibilityEvidence: [
    "Fictional current professional profile explicitly states paid-search ownership",
  ],
  proof: email().proof,
});
const snapshot = (): EvidenceSnapshot => ({
  version: 1,
  contact: structuredClone(collectedContact),
  observations: structuredClone(verifiedObservations),
  provenanceAtCollection: [],
  blockers: [],
  providers: [],
  collectedAt: collectionNow.toISOString(),
});
const review = (s = snapshot(), now = collectionNow) => reviewEvidenceSnapshot(s, now);
afterEach(() => vi.unstubAllEnvs());
describe("deterministic historical gate authority", () => {
  it("produces ELIGIBLE only with every gate CLEAR and never human approval", () => {
    const row = review();
    expect(row.qualification.status).toBe("ELIGIBLE");
    expect(row.qualification.gates.every((gate) => gate.state === "CLEAR")).toBe(true);
    expect(row.qualification.approved).toBe(false);
    expect(row.plan.decision.status).toBe("READY");
  });
  it.each([
    "unsubscribed",
    "hardBounced",
    "complained",
    "activeSequence",
    "lastOutboundAt",
    "conflictingActiveOpportunity",
    "outreachHistoryComplete",
  ])("does not clear %s without authoritative scope/coverage evidence", (field) => {
    const s = snapshot();
    delete s.observations.find((item) => item.field === field)!.authority;
    const row = review(s),
      gate = row.qualification.gates.find((g) => g.id === field)!;
    expect(gate.state).toBe("UNKNOWN");
    expect(gate.resolution).toBe("UNRESOLVED_PROVIDER");
    expect(row.plan.decision.status).toBe("HOLD");
  });
  it.each(["PARTIAL", "UNRESOLVED_PROVIDER"] as const)("never calls %s coverage CLEAR", (state) => {
    const s = snapshot();
    s.observations.forEach((item) => {
      if (item.authority) item.authority.state = state;
    });
    expect(review(s).qualification.status).toBe("HOLD");
    expect(review(s).qualification.gates.find((g) => g.id === "complained")?.state).toBe("UNKNOWN");
  });
  it.each([
    "identityMatched",
    "permissionsVerified",
    "allUserHistory",
    "retentionComplete",
  ] as const)("requires authoritative %s evidence", (flag) => {
    const s = snapshot();
    s.observations.find((item) => item.field === "complained")!.authority![flag] = false;
    expect(review(s).qualification.gates.find((g) => g.id === "complained")?.state).toBe("UNKNOWN");
  });
  it("keeps explicit positive suppression BLOCKED even when stale", () => {
    const s = snapshot();
    s.observations.push(
      observation("complained", true, "OUTREACH", {
        verifiedAt: "2026-01-01T00:00:00Z",
        observedAt: "2026-01-01T00:00:00Z",
      }),
    );
    expect(review(s).qualification.gates.find((g) => g.id === "complained")?.state).toBe("BLOCKED");
    expect(review(s).qualification.status).toBe("REJECTED");
  });
  it("blocks a known recent outbound regardless of incomplete full history", () => {
    const s = snapshot();
    s.observations = s.observations.filter((item) => item.field !== "lastOutboundAt");
    s.observations.push(
      observation("lastOutboundAt", "2026-09-30T00:00:00Z", "HUBSPOT", { authority: undefined }),
    );
    expect(review(s).qualification.gates.find((g) => g.id === "lastOutboundAt")?.state).toBe(
      "BLOCKED",
    );
  });
  it("retains the four-calendar-month anniversary instead of a 120-day shortcut", () => {
    const s = snapshot();
    s.observations.find((item) => item.field === "lastOutboundAt")!.value = "2026-06-16T12:00:00Z";
    expect(review(s).qualification.gates.find((g) => g.id === "lastOutboundAt")?.state).toBe(
      "BLOCKED",
    );
    s.observations.find((item) => item.field === "lastOutboundAt")!.value = "2026-06-15T12:00:00Z";
    expect(review(s).qualification.gates.find((g) => g.id === "lastOutboundAt")?.state).toBe(
      "CLEAR",
    );
  });
  it("treats stale authority, missing complaints and new diagnostic failure as UNKNOWN", () => {
    const s = snapshot();
    s.observations.find((item) => item.field === "activeSequence")!.authority!.through =
      "2026-10-13T00:00:00Z";
    s.observations = s.observations.filter((item) => item.field !== "complained");
    const row = reviewEvidenceSnapshot(s, collectionNow, ["OUTREACH: mailings.read"]);
    expect(row.qualification.missingPermissions).toEqual(["OUTREACH: mailings.read"]);
    expect(row.qualification.gates.find((g) => g.id === "activeSequence")?.state).toBe("UNKNOWN");
    expect(row.qualification.gates.find((g) => g.id === "complained")?.state).toBe("UNKNOWN");
  });
  it("holds conflicting source facts and blocks active sequences and opportunities", () => {
    const s = snapshot();
    s.observations.push(observation("employeeCount", 10));
    s.observations.push(observation("activeSequence", true, "OUTREACH"));
    const row = review(s);
    expect(row.qualification.gates.find((g) => g.id === "employeeCount")?.resolution).toBe(
      "CONFLICT",
    );
    expect(row.qualification.gates.find((g) => g.id === "activeSequence")?.state).toBe("BLOCKED");
    expect(row.plan.decision.status).toBe("HOLD");
  });
});
describe("independent evidence and identity invalidation", () => {
  it.each(["INVALID", "CATCH_ALL", "UNKNOWN", "STALE"] as const)(
    "never approves an email with provider status %s",
    (status) => {
      const result = email();
      if (result.kind !== "EMAIL") throw new Error();
      result.status = status;
      const s = snapshot();
      s.observations = [
        ...s.observations.filter((item) => item.field !== "emailVerification"),
        ...verificationObservations(result, s.contact, collectionNow),
      ];
      expect(review(s).qualification.status).toBe("HOLD");
    },
  );
  it("invalidates email edits, source changes and employer/person changes", () => {
    const proof = verificationObservations(email(), collectedContact, collectionNow);
    for (const changed of [
      { email: "changed@example.com" },
      { emailModifiedAt: "2026-10-15T12:01:00Z" },
      { emailSource: "SURFE" },
      { fullName: "Different fictional person" },
      { companyDomain: "different.example" },
    ]) {
      const contact = { ...collectedContact, ...changed };
      expect(
        normalizeCollectedEvidence(contact, proof, collectionNow).input.emailVerification,
      ).toBeUndefined();
    }
    expect(
      sameVerificationIdentity(collectedContact, { ...collectedContact, emailSource: "ZOOMINFO" }),
    ).toBe(false);
  });
  it("rejects stale, future, CRM-only and Boring claims", () => {
    for (const values of [
      { checkedAt: "2026-01-01T00:00:00Z" },
      { checkedAt: "2027-01-01T00:00:00Z" },
      { independent: false },
      { providerId: "Boring green" },
      { providerId: "HUBSPOT" },
    ]) {
      const result = email();
      Object.assign(result.proof, values);
      expect(verificationObservations(result, collectedContact, collectionNow)).toEqual([]);
    }
  });
  it("requires timestamped independent employment with explicit current employer/role/Search evidence", () => {
    const result = employment(),
      observations = verificationObservations(result, collectedContact, collectionNow);
    expect(observations.map((item) => item.field)).toEqual([
      "currentEmploymentVerified",
      "role",
      "paidSearchResponsibility",
    ]);
    for (const changed of [
      { current: false },
      { employerDomain: "wrong.example" },
      { seniority: "UNKNOWN" },
      { responsibilityEvidence: [] },
    ])
      expect(
        verificationObservations(
          { ...result, ...changed } as typeof result,
          collectedContact,
          collectionNow,
        ),
      ).toEqual([]);
  });
  it("rejects independently corroborated Paid Social-only profiles", () => {
    const result = {
      ...employment(),
      role: "Head of Paid Social",
      responsibilityScope: "PAID_SOCIAL_ONLY" as const,
      searchResponsibility: "ABSENT" as const,
    };
    const s = snapshot();
    s.observations = [
      ...s.observations.filter(
        (item) =>
          !["role", "paidSearchResponsibility", "currentEmploymentVerified"].includes(item.field),
      ),
      ...verificationObservations(result, s.contact, collectionNow),
    ];
    expect(review(s).qualification.status).toBe("REJECTED");
  });
  it("does not confuse CRM-provided employment claims with independent corroboration", () => {
    const s = snapshot();
    const proof = s.observations.find((item) => item.field === "currentEmploymentVerified")!;
    proof.provider = "HUBSPOT";
    proof.independent = false;
    expect(
      review(s).qualification.gates.find((g) => g.id === "currentEmploymentVerified")?.state,
    ).toBe("UNKNOWN");
    expect(review(s).plan.decision.status).toBe("HOLD");
  });
});
describe("real HTTP provider adapters with mocked responses", () => {
  it("uses the ZeroBounce validation API without exposing the key in evidence", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        address: collectedContact.email,
        status: "valid",
        sub_status: "",
        free_email: false,
      }),
    );
    const result = await new ZeroBounceVerificationAdapter("fixture-secret", fetcher).verify(
      "EMAIL",
      collectedContact,
      collectionNow,
    );
    expect(result?.status).toBe("VERIFIED");
    expect(String(fetcher.mock.calls[0][0])).toContain("https://api.zerobounce.net/v2/validate?");
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
    expect(
      await new ZeroBounceVerificationAdapter("fixture", fetcher).verify(
        "EMPLOYMENT",
        collectedContact,
        collectionNow,
      ),
    ).toBeNull();
  });
  it.each(["catch-all", "invalid", "unknown", "abuse"])(
    "normalizes ZeroBounce %s conservatively",
    async (status) => {
      const result = await new ZeroBounceVerificationAdapter(
        "fixture",
        vi.fn(async () =>
          Response.json({ address: collectedContact.email, status, free_email: false }),
        ),
      ).verify("EMAIL", collectedContact, collectionNow);
      expect(result?.status).not.toBe("VERIFIED");
    },
  );
  it("does not call a free/personal-domain or role mailbox independently verified business email", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        address: collectedContact.email,
        status: "valid",
        sub_status: "role_based",
        free_email: false,
      }),
    );
    expect(
      (
        await new ZeroBounceVerificationAdapter("fixture", fetcher).verify(
          "EMAIL",
          collectedContact,
          collectionNow,
        )
      )?.status,
    ).toBe("UNKNOWN");
  });
  it("validates the gateway identity, configured provider and structured proof", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(employment()));
    const gateway = new GatewayVerificationAdapter(
      "fictional-independent",
      "https://verification.example/v1",
      "fixture-token",
      fetcher,
    );
    expect(await gateway.verify("EMPLOYMENT", collectedContact)).toEqual(employment());
    expect(fetcher.mock.calls[0][0]).toBe("https://verification.example/v1/employment");
    const mismatch = employment();
    mismatch.identity.hubspotRecordId = "different";
    fetcher.mockResolvedValueOnce(Response.json(mismatch));
    await expect(gateway.verify("EMPLOYMENT", collectedContact)).rejects.toThrow(
      "INVALID_RESPONSE",
    );
  });
  it("rejects localhost, credential URLs, malformed responses and redirects", async () => {
    const fetcher = vi.fn();
    for (const url of [
      "http://verification.example",
      "https://localhost",
      "https://user:password@verification.example",
      "https://127.0.0.1",
      "https://verification.example?token=secret",
    ])
      await expect(
        new GatewayVerificationAdapter("fixture", url, "fixture", fetcher).verify(
          "EMAIL",
          collectedContact,
        ),
      ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports permissions, incomplete responses and long rate limits without retrying blindly", async () => {
    for (const status of [401, 403, 429]) {
      const fetcher = vi.fn(async () =>
        Response.json({ secret: "not returned" }, { status, headers: { "Retry-After": "120" } }),
      );
      await expect(
        new ZeroBounceVerificationAdapter("fixture", fetcher).verify(
          "EMAIL",
          collectedContact,
          collectionNow,
        ),
      ).rejects.toThrow(status === 429 ? "RATE_LIMITED" : "PERMISSION_MISSING");
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    await expect(
      new ZeroBounceVerificationAdapter(
        "fixture",
        vi.fn(async () => Response.json({ status: "valid" })),
      ).verify("EMAIL", collectedContact, collectionNow),
    ).rejects.toThrow("INVALID_RESPONSE");
  });
});
describe("persistent, bounded verification requests", () => {
  async function setup() {
    const store = new MemoryEvidenceStore();
    await store.save("actor", [snapshot()]);
    const adapter: VerificationAdapter = {
      id: "fictional-independent",
      verify: vi.fn(async (kind) => (kind === "EMAIL" ? email() : employment())),
    };
    return { store, adapter };
  }
  it("persists evidence once and reuses a duplicate or fresh verified request", async () => {
    const { store, adapter } = await setup(),
      deps = { store, adapter, now: () => collectionNow };
    await retryVerification("actor", "42", "EMAIL", "request-0001", deps);
    await retryVerification("actor", "42", "EMAIL", "request-0001", deps);
    await retryVerification("actor", "42", "EMAIL", "request-0002", deps);
    expect(adapter.verify).toHaveBeenCalledTimes(1);
    const saved = (await store.list("actor"))[0];
    expect(saved.verification?.EMAIL?.state).toBe("COMPLETED");
    expect(saved.verification?.EMAIL?.result?.proof.sourceRecordId).toBe("fictional-check-1");
  });
  it("does not fabricate a result when the provider is unconfigured", async () => {
    const { store } = await setup();
    const adapter: VerificationAdapter = { id: "UNCONFIGURED", verify: async () => null };
    await retryVerification("actor", "42", "EMAIL", "request-none", {
      store,
      adapter,
      now: () => collectionNow,
    });
    const saved = (await store.list("actor"))[0];
    expect(saved.verification?.EMAIL?.state).toBe("UNRESOLVED_PROVIDER");
    expect(saved.verification?.EMAIL?.result).toBeUndefined();
  });
  it("captures missing permissions safely and bounds repeated retries", async () => {
    const { store } = await setup();
    let clock = collectionNow;
    const adapter: VerificationAdapter = {
      id: "fictional-independent",
      verify: vi.fn(async () => {
        throw new VerificationProviderError("PERMISSION_MISSING");
      }),
    };
    for (let i = 0; i < 6; i++) {
      await retryVerification("actor", "42", "EMAIL", `retry-${i}`, {
        store,
        adapter,
        now: () => clock,
      });
      clock = new Date(clock.getTime() + 61000);
    }
    expect(adapter.verify).toHaveBeenCalledTimes(3);
    expect((await store.list("actor"))[0].verification?.EMAIL?.message).toBe("PERMISSION_MISSING");
    expect(
      review((await store.list("actor"))[0]).qualification.missingPermissions.join(),
    ).toContain("fictional-independent");
  });
  it("does not attach results after an email edit or leak records across actors", async () => {
    const { store } = await setup();
    const adapter: VerificationAdapter = {
      id: "fictional-independent",
      verify: async () => {
        await store.edit("actor", "42", (raw) => {
          const saved = raw as EvidenceSnapshot;
          saved.contact.email = "changed@example.com";
          return saved;
        });
        return email();
      },
    };
    await expect(
      retryVerification("actor", "42", "EMAIL", "race-0001", {
        store,
        adapter,
        now: () => collectionNow,
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(
      retryVerification("other", "42", "EMAIL", "race-0002", {
        store,
        adapter,
        now: () => collectionNow,
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
});

describe("verification failures and concurrency", () => {
  it("does not let an unavailable new verification hide behind older successful evidence", async () => {
    const store = new MemoryEvidenceStore();
    await store.save("actor", [snapshot()]);
    await retryVerification("actor", "42", "EMAIL", "unavailable-0001", {
      store,
      adapter: { id: "UNCONFIGURED", verify: async () => null },
      now: () => collectionNow,
    });
    const saved = (await store.list("actor"))[0];
    expect(
      review(saved).qualification.gates.find((gate) => gate.id === "emailVerification"),
    ).toMatchObject({ state: "UNKNOWN", resolution: "UNRESOLVED_PROVIDER" });
    expect(review(saved).plan.decision.status).toBe("HOLD");
  });
  it("bounds concurrent verification to one provider call under the snapshot claim", async () => {
    const store = new MemoryEvidenceStore();
    await store.save("actor", [snapshot()]);
    let finish!: (result: VerificationResult) => void;
    const adapter: VerificationAdapter = {
      id: "fictional-independent",
      verify: vi.fn(
        async () =>
          new Promise<VerificationResult>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const pending = retryVerification("actor", "42", "EMAIL", "concurrent-0001", {
      store,
      adapter,
      now: () => collectionNow,
    });
    await vi.waitFor(() => expect(adapter.verify).toHaveBeenCalledTimes(1));
    expect(
      (
        await retryVerification("actor", "42", "EMAIL", "concurrent-0002", {
          store,
          adapter,
          now: () => collectionNow,
        })
      ).started,
    ).toBe(false);
    finish(email());
    await pending;
    expect(adapter.verify).toHaveBeenCalledTimes(1);
  });
  it("retries short transient failures but never converts network errors into provider success", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}, { status: 503, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(
        Response.json({
          address: collectedContact.email,
          status: "valid",
          sub_status: "",
          free_email: false,
        }),
      );
    expect(
      (
        await new ZeroBounceVerificationAdapter("fixture", fetcher).verify(
          "EMAIL",
          collectedContact,
          collectionNow,
        )
      )?.status,
    ).toBe("VERIFIED");
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(
      new ZeroBounceVerificationAdapter(
        "fixture",
        vi.fn(async () => {
          throw new Error("fixture-secret must never be forwarded");
        }),
      ).verify("EMAIL", collectedContact, collectionNow),
    ).rejects.toThrow("UNAVAILABLE");
  });
});

describe("untrusted adapter response isolation", () => {
  it("discards another contact's result rather than persisting it inside a failed attempt", async () => {
    const store = new MemoryEvidenceStore();
    await store.save("actor", [snapshot()]);
    const foreign = email();
    foreign.identity.hubspotRecordId = "foreign-record";
    foreign.identity.fullName = "Foreign fictional person";
    foreign.proof.sourceRecordId = "foreign-proof";
    await retryVerification("actor", "42", "EMAIL", "foreign-response-0001", {
      store,
      adapter: { id: "fictional-independent", verify: async () => foreign },
      now: () => collectionNow,
    });
    const saved = (await store.list("actor"))[0];
    expect(saved.verification?.EMAIL?.state).toBe("FAILED");
    expect(saved.verification?.EMAIL?.result).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain("foreign-record");
    expect(JSON.stringify(saved)).not.toContain("foreign-proof");
    expect(review(saved).qualification.status).toBe("HOLD");
  });
});
