import { describe, it, expect } from "vitest";
import { initialDailyState } from "@/features/agent-workforce/daily/contracts";
import { dailyConfig } from "./state";
import { jerusalemParts, scheduledKey, nextScheduledAt } from "./schedule";
const config = { ...dailyConfig({ NODE_ENV: "test" }), enabled: true };
describe("Asia/Jerusalem calendar scheduling", () => {
  it("uses Jerusalem calendar dates instead of UTC", () =>
    expect(jerusalemParts(new Date("2026-10-18T22:30:00Z"))).toEqual({
      date: "2026-10-19",
      time: "01:30",
    }));
  it("does not fire before the configured time or when disabled", () => {
    expect(scheduledKey(new Date("2026-10-19T05:59:00Z"), config, initialDailyState())).toBeNull();
    expect(
      scheduledKey(
        new Date("2026-10-19T07:00:00Z"),
        { ...config, enabled: false },
        initialDailyState(),
      ),
    ).toBeNull();
  });
  it("recovers a missed scheduled time later that same calendar day", () =>
    expect(scheduledKey(new Date("2026-10-19T16:00:00Z"), config, initialDailyState())).toBe(
      "daily-2026-10-19",
    ));
  it("fires after a nonexistent spring-forward time", () => {
    expect(nextScheduledAt(new Date("2026-03-26T23:59:00Z"), "02:30")).toBe(
      "2026-03-27T00:00:00.000Z",
    );
    expect(
      scheduledKey(
        new Date("2026-03-27T00:00:00Z"),
        { ...config, time: "02:30" },
        initialDailyState(),
      ),
    ).toBe("daily-2026-03-27");
  });
  it("uses one date key across both fall-back hours", () => {
    const a = scheduledKey(
      new Date("2026-10-24T22:30:00Z"),
      { ...config, time: "01:15" },
      initialDailyState(),
    );
    const b = scheduledKey(
      new Date("2026-10-24T23:30:00Z"),
      { ...config, time: "01:15" },
      initialDailyState(),
    );
    expect(a).toBe("daily-2026-10-25");
    expect(b).toBe(a);
  });
  it("moves 09:00 UTC delivery across DST without changing local time", () => {
    expect(nextScheduledAt(new Date("2026-10-24T07:00:00Z"), "09:00")).toBe(
      "2026-10-25T07:00:00.000Z",
    );
  });
  it("rejects malformed configuration rather than silently enabling work", () =>
    expect(() => dailyConfig({ NODE_ENV: "test", WORKFORCE_DAILY_TIME: "25:90" })).toThrow());
});
it("recovers the most recent missed day after a multi-day worker outage without replaying every day", () => {
  const state = initialDailyState();
  state.lastWorkerAt = "2026-10-15T06:00:00Z";
  expect(scheduledKey(new Date("2026-10-19T04:00:00Z"), config, state)).toBe("daily-2026-10-18");
});
it("does not schedule a duplicate in the repeated fall-back hour", () => {
  const state = initialDailyState();
  state.runs = [{ key: "daily-2026-10-25" } as never];
  expect(
    scheduledKey(new Date("2026-10-24T23:30:00Z"), { ...config, time: "01:15" }, state),
  ).toBeNull();
  expect(nextScheduledAt(new Date("2026-10-24T22:30:00Z"), "01:15", "2026-10-25")).toBe(
    "2026-10-25T23:15:00.000Z",
  );
});
