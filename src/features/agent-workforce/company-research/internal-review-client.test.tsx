import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InternalCompanyReview } from "./internal-review-client";
import { executeInternalResearch } from "@/server/agent-workforce/company-research/internal-execution";
const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  reader: vi.fn(),
  access: vi.fn(),
  actor: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ ...mocks, default: mocks }));
vi.mock("@/server/agent-workforce/company-research/config", () => ({
  requireLocalCompanyAccess: mocks.access,
}));
vi.mock("@/server/agent-workforce/http", () => ({
  workforceActor: mocks.actor,
  workforceResponse: (body: unknown, status = 200) => Response.json(body, { status }),
}));
vi.mock("@/server/agent-workforce/public-sources", async (original) => ({
  ...(await original<typeof import("@/server/agent-workforce/public-sources")>()),
  readPublicSource: mocks.reader,
}));
import { GET, POST } from "@/app/api/sales-agent/company-research/internal/route";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it("offline button-to-result: executes the real route/store/controller and renders its receipt without operator intervention", async () => {
  mocks.readdir.mockResolvedValue([]);
  mocks.actor.mockResolvedValue({ actor: { id: "test-actor" } });
  mocks.reader.mockResolvedValue({
    url: "https://fictional.example/",
    title: "Explicitly fictional page",
    text: "Fictional inventory software company. ".repeat(8),
  });
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    const request = new Request(`http://localhost:3000${url}`, {
      ...options,
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
    });
    return options?.method === "POST" ? POST(request) : GET(request);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<InternalCompanyReview />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByLabelText("Company name or domain"), {
    target: { value: "fictional.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Research" }));
  await screen.findByText(/Explicitly fictional page/);
  expect(mocks.reader).toHaveBeenCalledTimes(1);
  expect(mocks.writeFile).toHaveBeenCalledTimes(1);
  const persisted = JSON.parse(mocks.writeFile.mock.calls[0][1]);
  expect(persisted.review).toBeNull();
  expect(persisted.execution.sources[0].url).toBe("https://fictional.example/");
  expect(screen.getByText(/TEXT_EXTRACTED/)).toBeTruthy();
  expect(screen.getByText(/NO_AUTHORIZED_INFERENCE/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Send|Enroll|Approve/ })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("submits Research once and displays returned blockers without a manual review or paid-route fallback", async () => {
  const execution = await executeInternalResearch("New company", false, vi.fn());
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, documents: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { items: [] } }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        document: {
          version: 1,
          id: "d1db3adc-baad-4fd0-93ba-231f33dc94a6",
          owner: "actor",
          company: "New company",
          createdAt: "2026-10-20T08:00:00.000Z",
          image: null,
          review: null,
          execution,
        },
      }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<InternalCompanyReview />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByLabelText("Company name or domain"), {
    target: { value: "New company" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Research" }));
  await screen.findByText(/Automatic execution — BLOCKED before drafting/);
  expect(screen.getByText(/PUBLIC_DOMAIN_REQUIRED/)).toBeTruthy();
  expect(screen.getByText(/NO_AUTHORIZED_INFERENCE/)).toBeTruthy();
  expect(screen.queryByText(/Awaiting agent research/)).toBeNull();
  expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("/api/sales-agent/"))).toBe(
    true,
  );
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ company: "New company" });
  expect(screen.getByText(/Contact clearance: HOLD/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Send|Enroll|Approve/ })).toBeNull();
});

it("submits a pasted profile as optional unverified input without contact or CRM identifiers", async () => {
  const profile =
    "Global One Search Lead. " + "User-supplied role and responsibility details. ".repeat(3);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, documents: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { items: [] } }) })
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, message: "Offline simulation stopped before execution." }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<InternalCompanyReview />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByLabelText("Company name or domain"), {
    target: { value: "swarovski.com" },
  });
  fireEvent.change(screen.getByLabelText("Person's name"), {
    target: { value: "Alice De Benetti" },
  });
  fireEvent.change(screen.getByLabelText("Or paste professional profile text"), {
    target: { value: profile },
  });
  fireEvent.click(screen.getByRole("button", { name: "Research" }));
  await screen.findByText("Offline simulation stopped before execution.");
  const request = JSON.parse(fetcher.mock.calls[2][1].body as string);
  expect(request).toEqual({
    company: "swarovski.com",
    profile: { name: "Alice De Benetti", text: profile },
  });
  expect(JSON.stringify(request)).not.toContain("email");
  expect(JSON.stringify(request)).not.toContain("contactId");
});
