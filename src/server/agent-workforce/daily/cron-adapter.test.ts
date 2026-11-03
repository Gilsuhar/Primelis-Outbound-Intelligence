// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { dailyCronRehearsal } from "./cron-adapter";
import { DailyEngine } from "./engine";
import { MemoryDailyStore } from "./test-store";
import { dailyConfig } from "./state";
const secret = "synthetic-cron-rehearsal-only-value";
const config = (): NodeJS.ProcessEnv => ({ NODE_ENV: "test", WORKFORCE_CRON_REHEARSAL_ENABLED: "true", WORKFORCE_DAILY_ENABLED: "true", CRON_SECRET: secret, INTEGRATION_OPERATOR_USER_ID: "synthetic-operator" });
const request = (suffix = "", method = "GET", bearer = secret) => new Request("https://synthetic.invalid/api/sales-agent/daily/worker" + suffix, { method, headers: { authorization: `Bearer ${bearer}` } });
afterEach(() => vi.unstubAllEnvs());
it.each([
  { VERCEL_ENV: "preview" }, { VERCEL_ENV: "production" }, { VERCEL: "1" },
  { VERCEL_ENV: "unknown" }, { NODE_ENV: "production" },
  { WORKFORCE_CRON_REHEARSAL_ENABLED: "" }, { WORKFORCE_DAILY_ENABLED: "" },
  { CRON_SECRET: "" }, { CRON_SECRET: "short" }, { INTEGRATION_OPERATOR_USER_ID: "" },
])("denies unsafe/missing configuration before engine/network: %j", async patch => {
  const tick = vi.fn(), network = vi.spyOn(globalThis, "fetch");
  try {
    expect((await dailyCronRehearsal(tick, { ...config(), ...patch } as NodeJS.ProcessEnv)(request())).status).toBe(403);
    expect(tick).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});
it("cannot override the real cloud runtime through injected configuration", async () => {
  vi.stubEnv("VERCEL_ENV", "preview"); const tick = vi.fn();
  expect((await dailyCronRehearsal(tick, config())(request())).status).toBe(403);
  expect(tick).not.toHaveBeenCalled();
});
it.each([request("?actor=other"), request("", "POST"), request("", "GET", "bad")])("rejects malformed or unauthenticated delivery", async req => {
  const tick = vi.fn(); expect((await dailyCronRehearsal(tick, config())(req)).status).toBeGreaterThanOrEqual(400);
  expect(tick).not.toHaveBeenCalled();
});
it("sanitizes failures and never retries automatically", async () => {
  const tick = vi.fn().mockRejectedValue(new Error("sensitive synthetic diagnostic"));
  const response = await dailyCronRehearsal(tick, config())(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("sensitive");
  expect(tick).toHaveBeenCalledOnce();
});
it("uses existing atomic leases and day keys across duplicate concurrent scheduler deliveries", async () => {
  const store = new MemoryDailyStore();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const sync = vi.fn(async () => { entered(); await pending; return { done: true }; });
  const handlers = { sync, intake: vi.fn(), contact: vi.fn() };
  const clock = () => new Date("2026-11-03T09:00:00Z");
  const engine = new DailyEngine(store, dailyConfig(config()), handlers, clock);
  const peer = new DailyEngine(store, dailyConfig(config()), handlers, clock);
  const first = dailyCronRehearsal(engine.tick.bind(engine), config())(request());
  await started;
  const second = await dailyCronRehearsal(peer.tick.bind(peer), config())(request());
  expect(second.status).toBe(200); expect(sync).toHaveBeenCalledOnce();
  release(); expect((await first).status).toBe(200);
  const state = await store.get("synthetic-operator");
  expect(state.runs).toHaveLength(1);
  expect(state.runs[0].key).toBe("daily-2026-11-03");
  expect(state.runs[0].stage).toBe("OUTREACH");
  expect(state.runs[0].lease).toBeNull();
});
