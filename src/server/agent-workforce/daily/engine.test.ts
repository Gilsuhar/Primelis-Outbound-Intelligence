import { describe, expect, it, vi, afterEach } from "vitest";
import { DailyEngine, type DailyHandlers } from "./engine";
import { dailyConfig } from "./state";
import { reserveProvider } from "./budget";
import { MemoryDailyStore } from "./test-store";
import type { DailyContact } from "@/features/agent-workforce/daily/contracts";
const config = dailyConfig({ NODE_ENV: "test" });
const fictional = (id = "fictional-hubspot-1"): DailyContact => ({
  id,
  status: "WAITING",
  stage: "VERIFY_EMAIL",
  attempts: 0,
  nextAttemptAt: null,
  decision: "HOLD",
  reasons: ["Fictional isolated test; not a CRM record"],
  researchCompleted: false,
  draftPrepared: false,
});
function setup(overrides: Partial<DailyHandlers> = {}) {
  const store = new MemoryDailyStore();
  let now = new Date("2026-10-19T06:30:00Z");
  const handlers: DailyHandlers = {
    sync: vi.fn(async () => ({ done: true, discovered: 1 })),
    intake: vi.fn(async () => ({ done: false, contacts: [fictional()] })),
    contact: vi.fn(async (_actor, _run, contact) => ({
      done: true,
      contact: {
        ...contact,
        status: "COMPLETED",
        stage: "REVIEW",
        decision: "ELIGIBLE",
        reasons: [],
        researchCompleted: true,
        draftPrepared: true,
      },
    })),
    ...overrides,
  };
  const engine = new DailyEngine(store, { ...config, enabled: true }, handlers, () => now);
  return {
    engine,
    store,
    handlers,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}
afterEach(() => vi.unstubAllEnvs());
describe("durable daily controller — fictional fixtures", () => {
  it("executes both read-only syncs before verification/research/drafts and records review counts", async () => {
    const { engine, handlers } = setup();
    await engine.start("actor", "manual-001", "MANUAL");
    for (let i = 0; i < 4; i++) await engine.tick("actor");
    const report = await engine.report("actor"),
      run = report.runs[0];
    expect(handlers.sync).toHaveBeenNthCalledWith(
      1,
      "actor",
      expect.objectContaining({ stage: "HUBSPOT" }),
      "HUBSPOT",
    );
    expect(handlers.sync).toHaveBeenNthCalledWith(
      2,
      "actor",
      expect.objectContaining({ stage: "OUTREACH" }),
      "OUTREACH",
    );
    expect(run.status).toBe("COMPLETED");
    expect(run.contacts[0].draftPrepared).toBe(true);
    expect(report.lastSuccessfulRunAt).toBeTruthy();
  });
  it("completes a real empty import without invented contacts", async () => {
    const { engine } = setup({
      intake: async () => ({ done: true, contacts: [] }),
      sync: async () => ({ done: true, discovered: 0 }),
    });
    await engine.start("actor", "empty-001", "MANUAL");
    for (let i = 0; i < 3; i++) await engine.tick("actor");
    const run = (await engine.report("actor")).runs[0];
    expect(run.status).toBe("COMPLETED");
    expect(run.contacts).toEqual([]);
    expect(run.discovered).toBe(0);
  });
  it("deduplicates start requests and overlapping schedules across controller instances", async () => {
    const { engine, store, handlers } = setup();
    const [a, b] = await Promise.all([
      engine.start("actor", "daily-2026-10-19", "SCHEDULED"),
      engine.start("actor", "other-key-001", "MANUAL"),
    ]);
    expect(a.id).toBe(b.id);
    const peer = new DailyEngine(store, engine.config, handlers);
    await Promise.all([engine.tick("actor"), peer.tick("actor")]);
    expect(handlers.sync).toHaveBeenCalledTimes(1);
  });
  it("retains partial sync checkpoints and never reaches qualification on failed import", async () => {
    const { engine, handlers, advance } = setup({
      sync: async () => ({
        done: false,
        failed: true,
        reason: "RATE_LIMITED",
        retryAt: "2026-10-19T06:35:00Z",
        syncJobId: "existing-cursor",
      }),
    });
    await engine.start("actor", "partial-001", "MANUAL");
    await engine.tick("actor");
    await engine.tick("actor");
    expect(handlers.intake).not.toHaveBeenCalled();
    expect((await engine.report("actor")).runs[0].syncJobId).toBe("existing-cursor");
    expect((await engine.report("actor")).runs[0].attempts).toBe(1);
    advance(300000);
    await engine.tick("actor");
    expect((await engine.report("actor")).runs[0].attempts).toBe(2);
  });
  it("backs off and dead-letters missing credentials without claiming completion", async () => {
    const { engine, advance } = setup({
      sync: async () => {
        throw new Error("CONFIGURATION");
      },
    });
    await engine.start("actor", "missing-001", "MANUAL");
    await engine.tick("actor");
    expect((await engine.report("actor")).runs[0].nextAttemptAt).toBe("2026-10-19T06:31:00.000Z");
    advance(60000);
    await engine.tick("actor");
    advance(120000);
    await engine.tick("actor");
    expect((await engine.report("actor")).runs[0]).toMatchObject({
      status: "FAILED",
      stage: "HUBSPOT",
      reason: "CONFIGURATION",
    });
  });
  it("recovers a crash at the persisted cursor and fences late workers", async () => {
    const { engine, store, handlers, advance } = setup();
    const run = await engine.start("actor", "crash-001", "MANUAL");
    await store.change("actor", (state) => {
      state.runs[0].lease = { token: "dead-worker", until: "2026-10-19T06:32:00Z" };
      state.runs[0].syncJobId = "cursor-kept";
    });
    expect(await engine.tick("actor")).toBeNull();
    advance(180000);
    await engine.tick("actor");
    expect(handlers.sync).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ id: run.id, syncJobId: "cursor-kept" }),
      "HUBSPOT",
    );
    expect((await engine.report("actor")).runs[0].errors[0].code).toBe("WORKER_INTERRUPTED");
  });
  it("pauses on a swallowed budget error and retains the contact checkpoint", async () => {
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    const { engine } = setup({
      contact: async () => {
        try {
          await reserveProvider("SERP", 99);
        } catch {}
        return { done: true };
      },
    });
    await engine.start("actor", "budget-001", "MANUAL");
    for (let i = 0; i < 4; i++) await engine.tick("actor");
    expect((await engine.report("actor")).runs[0]).toMatchObject({
      status: "PAUSED",
      reason: "DAILY_BUDGET",
    });
    expect((await engine.report("actor")).runs[0].contacts[0].stage).toBe("VERIFY_EMAIL");
  });
  it("unknown history remains HOLD despite completed research", async () => {
    const { engine } = setup({
      contact: async (_a, _r, c) => ({
        done: true,
        contact: {
          ...c,
          status: "BLOCKED",
          stage: "DRAFT",
          researchCompleted: true,
          reasons: ["Outreach complaints UNKNOWN"],
        },
      }),
    });
    await engine.start("actor", "hold-001", "MANUAL");
    for (let i = 0; i < 4; i++) await engine.tick("actor");
    const run = (await engine.report("actor")).runs[0];
    expect(run.status).toBe("PARTIAL");
    expect(run.contacts[0]).toMatchObject({
      decision: "HOLD",
      researchCompleted: true,
      draftPrepared: false,
    });
  });
  it("moves failed contacts to failed queue after bounded retries and continues unrelated contacts", async () => {
    const { engine, advance } = setup({
      intake: async () => ({ done: false, contacts: [fictional("bad"), fictional("good")] }),
      contact: async (_a, _r, c) => {
        if (c.id === "bad") throw new Error("PROVIDER_FAILED");
        return { done: true, contact: { ...c, status: "COMPLETED" } };
      },
    });
    await engine.start("actor", "failed-001", "MANUAL");
    for (let i = 0; i < 3; i++) await engine.tick("actor");
    await engine.tick("actor");
    advance(60000);
    await engine.tick("actor");
    advance(120000);
    await engine.tick("actor");
    await engine.tick("actor");
    const run = (await engine.report("actor")).runs[0];
    expect(run.contacts.map((c) => c.status)).toEqual(["FAILED", "COMPLETED"]);
    expect(run.status).toBe("PARTIAL");
  });
  it("cancels safely and cannot start or retry while a cancelled lease is draining", async () => {
    const { engine, store } = setup();
    const run = await engine.start("actor", "cancel-001", "MANUAL");
    await store.change("actor", (s) => {
      s.runs[0].lease = { token: "inflight", until: "2026-10-19T06:32:00Z" };
    });
    await engine.control("actor", run.id, "CANCEL");
    expect(await engine.tick("actor")).toBeNull();
    await expect(engine.control("actor", run.id, "RETRY")).rejects.toThrow("VERSION_CONFLICT");
    expect((await engine.start("actor", "new-run-001", "MANUAL")).id).toBe(run.id);
  });
  it("retry retains successful contacts and resumes only unresolved checkpoints", async () => {
    const { engine, store } = setup();
    const run = await engine.start("actor", "retry-001", "MANUAL");
    await store.change("actor", (s) => {
      Object.assign(s.runs[0], {
        stage: "REPORT",
        status: "PARTIAL",
        contacts: [
          { ...fictional("done"), status: "COMPLETED" },
          { ...fictional("failed"), status: "FAILED" },
        ],
      });
    });
    await engine.control("actor", run.id, "RETRY");
    await engine.tick("actor");
    expect((await engine.report("actor")).runs[0].contacts.map((c) => c.status)).toEqual([
      "COMPLETED",
      "COMPLETED",
    ]);
  });
  it("scheduler is unconfirmed without observed authenticated ticks", async () => {
    const { engine } = setup();
    expect((await engine.report("actor")).scheduler).toMatchObject({
      state: "AWAITING_WORKER",
      nextRunAt: null,
    });
    await engine.tick("actor", true);
    expect((await engine.report("actor")).scheduler.state).toBe("WORKER_OBSERVED");
  });
  it("operator state is isolated", async () => {
    const { engine } = setup();
    await engine.start("actor-a", "private-001", "MANUAL");
    expect((await engine.report("actor-b")).runs).toEqual([]);
  });
});
it("cannot retry an older job while a cancelled newer worker lease is draining", async () => {
  const { engine, store } = setup();
  const old = await engine.start("actor", "older-job-001", "MANUAL");
  await engine.control("actor", old.id, "CANCEL");
  const recent = await engine.start("actor", "newer-job-002", "MANUAL");
  await store.change("actor", (s) => {
    s.runs.find((r) => r.id === recent.id)!.lease = {
      token: "inflight",
      until: "2026-10-19T06:32:00Z",
    };
  });
  await engine.control("actor", recent.id, "CANCEL");
  await expect(engine.control("actor", old.id, "RETRY")).rejects.toThrow("VERSION_CONFLICT");
});
it("exhausted Outreach synchronization remains a reported partial failure while editorial processing continues", async () => {
  const sync = vi.fn(async (_actor: string, _run: unknown, provider: string) =>
    provider === "OUTREACH"
      ? { done: false, failed: true, reason: "AUTHENTICATION_FAILED" }
      : { done: true, discovered: 1 },
  );
  const { engine, advance, handlers } = setup({
    sync,
    contact: async (_a, _r, c) => ({
      done: true,
      contact: {
        ...c,
        status: "COMPLETED",
        stage: "REVIEW",
        decision: "HOLD",
        draftPrepared: true,
      },
    }),
  });
  await engine.start("actor", "missing-outreach-01", "MANUAL");
  for (let i = 0; i < 12; i++) {
    await engine.tick("actor");
    advance(3600000);
  }
  const report = await engine.report("actor");
  expect(report.runs[0].status).toBe("PARTIAL");
  expect(report.runs[0].errors.some((e) => e.stage === "OUTREACH")).toBe(true);
  expect(report.runs[0].contacts[0]).toMatchObject({ decision: "HOLD", draftPrepared: true });
  expect(report.lastSuccessfulRunAt).toBeNull();
  expect(handlers.intake).toHaveBeenCalled();
});
