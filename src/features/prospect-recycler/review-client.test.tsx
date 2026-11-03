import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecyclerReview } from "./review-client";
import { recyclerReviewDemo } from "../../server/prospect-recycler/review-demo";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Recycler review screen", () => {
  it("filters the synthetic review locally without hiding the complete evaluation counts", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<RecyclerReview initial={await recyclerReviewDemo()} liveAvailable={false} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search candidates" }), { target: { value: "Alex" } });
    expect(screen.getByText("Alex Review")).toBeTruthy();
    expect(screen.queryByText("Jordan Delivery")).toBeNull();
    expect(screen.getByText(/5 candidates reviewed/)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Review status" }), { target: { value: "EXCLUDED" } });
    expect(screen.queryByText("Alex Review")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("renders held and excluded candidates without making provider requests", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<RecyclerReview initial={await recyclerReviewDemo()} liveAvailable={false} />);
    expect(screen.getByRole("heading", { name: "Daily Top 50" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Needs Verification (4)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Excluded (1)" })).toBeTruthy();
    expect(screen.getByText("Jordan Delivery")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Read up to 5 live records" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Export eligible Top 50" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("loads only on explicit action and retains the previous list on failure", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, message: "Connection unavailable" }),
    }));
    vi.stubGlobal("fetch", fetcher);
    render(<RecyclerReview initial={await recyclerReviewDemo()} liveAvailable />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read up to 5 live records" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Connection unavailable"),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Jordan Delivery")).toBeTruthy();
    expect(screen.getByText(/Offline demonstration/)).toBeTruthy();
  });
});
