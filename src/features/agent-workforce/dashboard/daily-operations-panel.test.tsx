import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DailyOperationsPanel } from "./daily-operations-panel";
import type { DailyReport } from "../daily/contracts";
const report: DailyReport = {
  config: {
    enabled: false,
    time: "09:00",
    timezone: "Asia/Jerusalem",
    dailyBudgetUsd: 5,
    monthlyBudgetUsd: 100,
    maxContacts: 25,
    maxConcurrentCalls: 1,
    maxRetries: 2,
  },
  scheduler: { state: "DISABLED", lastWorkerAt: null, nextRunAt: null },
  runs: [],
  lastSuccessfulRunAt: null,
  budget: {
    day: "2026-10-19",
    month: "2026-10",
    dailyEstimatedUsd: 0,
    monthlyEstimatedUsd: 0,
    usage: null,
    activeCalls: 0,
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("daily operational controls", () => {
  it("shows actual empty state and never invents a scheduled run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, report })),
    );
    render(<DailyOperationsPanel />);
    await screen.findByText(/No daily runs recorded/);
    expect(screen.getByText(/Not confirmed/)).toBeTruthy();
    expect(screen.queryByText("Connected")).toBeNull();
  });
  it("keeps manual actions disabled when persisted operations are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false }, { status: 503 })),
    );
    render(<DailyOperationsPanel />);
    await screen.findByRole("status");
    expect((screen.getByRole("button", { name: "Run now" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByText(/0 processed/)).toBeNull();
  });
  it("submits an idempotent manual request without credentials or approval flags", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json(init?.method === "POST" ? { ok: true } : { ok: true, report }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<DailyOperationsPanel />);
    await screen.findByText(/No daily runs recorded/);
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
    );
    const command = fetcher.mock.calls.find(([, init]) => init?.method === "POST")![1]!;
    const body = JSON.parse(command.body as string);
    expect(Object.keys(body).sort()).toEqual(["action", "requestKey"]);
    expect(body.action).toBe("RUN");
  });
});
