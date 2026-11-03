// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { CompanyQueue, LEASE_MS, type QueueExecutor } from "./engine";
import { fixtureCompanies, fixtureExecutor, fixtureRuntime } from "./fixtures";
import { MemoryQueueStore } from "./test-support";
import { scheduleFixtureCohort } from "./schedule";
import { ResearchStages } from "./pipeline";
const actor = "fixture-operator",
  now = new Date("2026-10-19T10:00:00Z");
afterEach(() => vi.unstubAllGlobals());
async function drain(q: CompanyQueue) {
  for (let i = 0; i < 30; i++) await q.tick(actor);
}
it("completes three scheduled simulations without network, persists reports and never promotes unsupported claims", async () => {
  const fetcher = vi.fn(() => {
    throw new Error("NETWORK_FORBIDDEN");
  });
  vi.stubGlobal("fetch", fetcher);
  const store = new MemoryQueueStore(),
    q = new CompanyQueue(store, fixtureExecutor(), () => now);
  await Promise.all([scheduleFixtureCohort(q, actor, now), scheduleFixtureCohort(q, actor, now)]);
  await drain(q);
  await scheduleFixtureCohort(q, actor, now);
  const state = await store.read(actor);
  expect(state.jobs).toHaveLength(3);
  expect(state.jobs.map((j) => j.status)).toEqual(["COMPLETE", "COMPLETE", "COMPLETE"]);
  expect(state.jobs.map((j) => j.run.status)).toEqual([
    "REVIEW_REQUIRED",
    "INCOMPLETE",
    "REVIEW_REQUIRED",
  ]);
  const rejected = state.jobs[1];
  expect(rejected.run.research.facts).toEqual([]);
  expect(rejected.run.groundingAudit?.reasonCodes).toContain("REJECTED_FACTS");
  expect(rejected.run.groundingAudit?.reviewer?.concerns?.[0]).toMatchObject({
    severity: "BLOCKING",
    scope: "FACT",
    code: "CLAIM_NOT_ENTAILED",
  });
  expect(JSON.parse(rejected.judgement!).hardFailures).toContain("NO_ACCEPTED_FINDINGS");
  for (const j of state.jobs) {
    expect(j.run).toMatchObject({ approved: false, canSend: false, canEnroll: false, usage: [] });
    expect(JSON.parse(j.judgement!).mode).toBe("OFFLINE_SIMULATION");
    expect(j.checkpoints).toHaveLength(6);
  }
  expect(fetcher).not.toHaveBeenCalled();
  expect((await store.read("different-actor")).jobs).toEqual([]);
});
it("idempotent request replay survives engine replacement, conflicts fail and active-domain duplicates are refused", async () => {
  const store = new MemoryQueueStore(),
    q = new CompanyQueue(store, fixtureExecutor(), () => now);
  const { fixture, ...input } = fixtureCompanies[0];
  const first = await q.enqueue(actor, input, "test-key-original", fixture);
  expect(
    await new CompanyQueue(store, fixtureExecutor()).enqueue(
      actor,
      input,
      "test-key-original",
      fixture,
    ),
  ).toEqual(first);
  await expect(q.enqueue(actor, input, "test-key-another", fixture)).rejects.toThrow(
    "COMPANY_ALREADY_QUEUED",
  );
  await expect(
    q.enqueue(actor, { ...input, companyName: "Changed" }, "test-key-original", fixture),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
it("serializes concurrent claims and fences a stale worker after expiry and safe recovery", async () => {
  let at = now.getTime(),
    release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const store = new MemoryQueueStore(),
    base = fixtureExecutor();
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const slow: QueueExecutor = {
    mode: "SIMULATED",
    execute: async (j, n) => {
      entered();
      await gate;
      return base.execute(j, n);
    },
  };
  const q = new CompanyQueue(store, slow, () => new Date(at));
  await scheduleFixtureCohort(q, actor, now);
  const pending = q.tick(actor);
  await started;
  expect(await new CompanyQueue(store, base, () => new Date(at)).tick(actor)).toBeNull();
  at += LEASE_MS + 1;
  const recovered = await new CompanyQueue(store, base, () => new Date(at)).tick(actor);
  expect(recovered?.stage).toBe("RETRIEVE");
  expect(recovered?.recoveries).toBe(1);
  release();
  expect(await pending).toBeNull();
  expect((await store.read(actor)).jobs[0].checkpoints).toHaveLength(1);
});
it("holds uncertain live work after a crash, including cancellation, without another provider attempt", async () => {
  let at = now.getTime();
  const store = new MemoryQueueStore();
  const execute = vi.fn(async () => {
    throw new Error("private provider response");
  });
  const q = new CompanyQueue(store, { mode: "LIVE", execute }, () => new Date(at));
  const job = await q.enqueue(
    actor,
    { companyName: "Future company", companyDomain: "future.example" },
    "future-test-key",
  );
  await q.tick(actor);
  at += LEASE_MS * 2;
  await q.cancel(actor, job.id);
  await q.tick(actor);
  expect(execute).toHaveBeenCalledTimes(1);
  const state = await store.read(actor);
  expect(state.jobs[0]).toMatchObject({ status: "HOLD", reason: "UNCERTAIN_PROVIDER_OUTCOME" });
  expect(JSON.stringify(state)).not.toContain("private provider response");
});
it("cancellation fences in-progress simulated work and never executes later stages", async () => {
  const store = new MemoryQueueStore(),
    q = new CompanyQueue(store, fixtureExecutor(), () => now);
  const { fixture, ...input } = fixtureCompanies[0];
  const j = await q.enqueue(actor, input, "cancel-fixture-key", fixture);
  await q.tick(actor);
  await q.cancel(actor, j.id);
  await q.tick(actor);
  expect((await store.read(actor)).jobs[0]).toMatchObject({
    status: "CANCELLED",
    stage: "RETRIEVE",
  });
});
it.each(["malformed", "unavailable"])(
  "retains a sanitized %s review audit and withholds candidates",
  async (kind) => {
    const store = new MemoryQueueStore();
    const executor = new ResearchStages("SIMULATED", (j) => {
      const rt = fixtureRuntime(j),
        structured = rt.model.structured;
      rt.model.structured = async (...args) => {
        if (args[0] === "EVIDENCE_VALIDATION") {
          if (kind === "malformed") return args[1].parse({ private: "must-not-persist" });
          throw new Error("must-not-persist");
        }
        return structured(...args);
      };
      return rt;
    });
    const q = new CompanyQueue(store, executor, () => now),
      { fixture, ...input } = fixtureCompanies[0];
    await q.enqueue(actor, input, `review-${kind}-fixture`, fixture);
    await drain(q);
    const j = (await store.read(actor)).jobs[0];
    expect(j.status).toBe("COMPLETE");
    expect(j.run.status).toBe("INCOMPLETE");
    expect(j.run.groundingAudit?.status).toBe(kind.toUpperCase());
    expect(j.run.research.facts).toEqual([]);
    expect(JSON.stringify(j)).not.toContain("must-not-persist");
  },
);
it("never falls back to live for arbitrary fixture inputs or mismatched execution modes", async () => {
  const store = new MemoryQueueStore(),
    q = new CompanyQueue(store, fixtureExecutor(), () => now);
  const j = await q.enqueue(
    actor,
    { companyName: "Not authorized", companyDomain: "other.example" },
    "unknown-fixture-key",
    "SUPPORTED",
  );
  await q.tick(actor);
  expect((await store.read(actor)).jobs[0]).toMatchObject({ id: j.id, status: "FAILED" });
  await expect(q.enqueue(actor, fixtureCompanies[0], "bad-input-fixture")).rejects.toThrow();
});

it.each(["quote", "hash", "identity", "stale"])(
  "rejects %s evidence defects before independent review",
  async (defect) => {
    const store = new MemoryQueueStore(),
      q = new CompanyQueue(store, fixtureExecutor(), () => now);
    const { fixture, ...input } = fixtureCompanies[0];
    await q.enqueue(actor, input, `defect-${defect}-test`, fixture);
    for (let i = 0; i < 3; i++) await q.tick(actor);
    await store.change(actor, (state) => {
      const run = state.jobs[0].run;
      if (defect === "quote") run.research.facts[0].quotes[0].text = "fabricated quotation";
      if (defect === "hash") run.research.sources[0].excerpt += " altered";
      if (defect === "identity") run.research.facts[0].subject = "PROSPECT";
      if (defect === "stale") run.research.sources[0].observedAt = "2020-01-01T00:00:00Z";
    });
    await drain(q);
    const j = (await store.read(actor)).jobs[0];
    expect(j.run.status).toBe("INCOMPLETE");
    expect(j.run.research.facts).toEqual([]);
    expect(j.checkpoints.some((c) => c.stage === "REVIEW")).toBe(false);
    expect(JSON.parse(j.judgement!).outcome).toBe("HOLD");
  },
);
it("rechecks freshness at publication after a long interruption", async () => {
  let at = now;
  const store = new MemoryQueueStore(),
    q = new CompanyQueue(store, fixtureExecutor(), () => at);
  const { fixture, ...input } = fixtureCompanies[0];
  await q.enqueue(actor, input, "freshness-at-publication", fixture);
  for (let i = 0; i < 5; i++) await q.tick(actor);
  at = new Date("2028-01-01T00:00:00Z");
  await q.tick(actor);
  const j = (await store.read(actor)).jobs[0];
  expect(j.run.status).toBe("INCOMPLETE");
  expect(JSON.parse(j.judgement!).verifiedFacts).toEqual([]);
});
it("holds an expired LIVE request marker before invoking any executor", async () => {
  const store = new MemoryQueueStore(),
    execute = vi.fn();
  const q = new CompanyQueue(store, { mode: "LIVE", execute }, () => now);
  await q.enqueue(
    actor,
    { companyName: "Future company", companyDomain: "future.example" },
    "expired-live-marker",
  );
  await store.change(actor, (state) => {
    const j = state.jobs[0],
      token = "00000000-0000-4000-8000-000000000001";
    j.status = "RUNNING";
    j.lease = { token, until: "2026-10-19T09:00:00Z" };
    j.inFlight = { token, stage: "DISCOVER" };
  });
  await q.tick(actor);
  expect(execute).not.toHaveBeenCalled();
  expect((await store.read(actor)).jobs[0].status).toBe("HOLD");
});
it("bounds the pilot queue without dropping completed idempotency history", async () => {
  const store = new MemoryQueueStore(),
    q = new CompanyQueue(store, fixtureExecutor(), () => now);
  for (let i = 0; i < 30; i++)
    await q.enqueue(
      actor,
      { companyName: `Fixture ${i}`, companyDomain: `fixture${i}.example` },
      `capacity-fixture-${i}`,
      "SUPPORTED",
    );
  await expect(
    q.enqueue(
      actor,
      { companyName: "Overflow fixture", companyDomain: "overflow.example" },
      "overflow-fixture-key",
      "SUPPORTED",
    ),
  ).rejects.toThrow("QUEUE_CAPACITY");
  expect((await store.read(actor)).jobs).toHaveLength(30);
});

it("fences a future LIVE Signal semantic review before invocation and never retries an uncertain outcome", async () => {
  const store = new MemoryQueueStore();
  const execute = vi.fn<QueueExecutor["execute"]>(async () => {
    throw new Error("fictional interruption, no provider called");
  });
  const queue = new CompanyQueue(store, { mode: "LIVE", execute }, () => now);
  await queue.enqueue(
    actor,
    { companyName: "Fictional future", companyDomain: "future.example" },
    "semantic-interruption",
    undefined,
    "SIGNAL_OPPORTUNITY_V1",
  );
  await store.change(actor, (state) => {
    state.jobs[0].stage = "JUDGE";
  });
  await queue.tick(actor);
  expect(execute.mock.calls[0][0]).toMatchObject({ inFlight: { stage: "JUDGE" } });
  expect((await store.read(actor)).jobs[0]).toMatchObject({
    status: "HOLD",
    reason: "UNCERTAIN_PROVIDER_OUTCOME",
  });
  const restarted = new CompanyQueue(
    store,
    { mode: "LIVE", execute },
    () => new Date(+now + LEASE_MS + 1),
  );
  await restarted.tick(actor);
  expect(execute).toHaveBeenCalledTimes(1);
});
