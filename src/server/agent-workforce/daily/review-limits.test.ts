// @vitest-environment node
import { expect, it, vi } from "vitest";
import { DailyEngine, type DailyHandlers } from "./engine";
import { MemoryDailyStore } from "./test-store";
import { dailyConfig } from "./state";
import type { DailyContact } from "@/features/agent-workforce/daily/contracts";
const contact = (id: string): DailyContact => ({ id, status: "WAITING", stage: "RESEARCH", decision: "ELIGIBLE", reasons: [], attempts: 0, nextAttemptAt: null, researchCompleted: false, draftPrepared: false });
function setup(contacts: DailyContact[]) {
  const store = new MemoryDailyStore();
  const handlers: DailyHandlers = { sync: async () => ({ done: true }), intake: async () => ({ done: false, contacts }),
    contact: vi.fn(async (_actor, _run, c) => ({ done: true, contact: { ...c, status: "COMPLETED", stage: "REVIEW" } })) };
  const engine = new DailyEngine(store, dailyConfig({ NODE_ENV: "test", WORKFORCE_MAX_CONTACTS: "100" }), handlers, () => new Date("2026-11-03T09:00:00Z"));
  return { store, engine, handlers };
}
it("caps the review batch at 50 without changing eligibility to fill a quota", async () => {
  const { engine } = setup(Array.from({ length: 60 }, (_, i) => contact(`synthetic-${i}`)));
  await engine.start("synthetic", "batch-001", "MANUAL");
  for (let i=0; i<3; i++) await engine.tick("synthetic");
  const run = (await engine.report("synthetic")).runs[0];
  expect(run.contacts).toHaveLength(50); expect(run.deferred).toBe(10);
});
it("preserves an earlier review and does not process it twice under a new manual key", async () => {
  const { engine, handlers } = setup([contact("synthetic-1")]);
  await engine.start("synthetic", "batch-001", "MANUAL");
  for (let i=0; i<4; i++) await engine.tick("synthetic");
  const previous = structuredClone((await engine.report("synthetic")).runs[0]);
  await engine.start("synthetic", "batch-002", "MANUAL");
  for (let i=0; i<3; i++) await engine.tick("synthetic");
  const runs = (await engine.report("synthetic")).runs;
  expect(runs[1]).toEqual(previous); expect(runs[0].contacts).toEqual([]);
  expect(handlers.contact).toHaveBeenCalledTimes(1);
});
it("holds conflicting duplicate decisions without researching either copy", async () => {
  const { engine, handlers } = setup([contact("synthetic-1"), { ...contact("synthetic-1"), decision: "HOLD" }]);
  await engine.start("synthetic", "batch-001", "MANUAL");
  for (let i=0; i<4; i++) await engine.tick("synthetic");
  const run = (await engine.report("synthetic")).runs[0];
  expect(run.contacts).toHaveLength(1); expect(run.contacts[0].decision).toBe("HOLD");
  expect(handlers.contact).not.toHaveBeenCalled();
});
