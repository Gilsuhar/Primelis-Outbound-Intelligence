import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { fictionalCompanyEnv } from "@/server/agent-workforce/company-research/test-fixtures";
import { MockWorkforceModel } from "@/test/workforce-fixtures";
import { MemoryDailyStore } from "@/server/agent-workforce/daily/test-store";
const mock = vi.hoisted(() => ({
  structured: vi.fn(),
  discover: vi.fn(),
  files: new Map<string, string>(),
}));
vi.mock("node:fs/promises", () => {
  const api = {
    mkdir: vi.fn(),
    readdir: vi.fn(async () =>
      [...mock.files.keys()].filter((p) => p.endsWith(".json")).map((p) => p.split(/[\\/]/).pop()),
    ),
    writeFile: vi.fn(async (p: string, data: string) => {
      mock.files.set(p, data);
    }),
    readFile: vi.fn(async (p: string) => mock.files.get(p)),
    stat: vi.fn(async () => ({ size: 10000 })),
    rename: vi.fn(async (from: string, to: string) => {
      mock.files.set(to, mock.files.get(from)!);
      mock.files.delete(from);
    }),
  };
  return { ...api, default: api };
});
vi.mock("@/server/agent-workforce/openai", async (original) => ({
  ...(await original<typeof import("@/server/agent-workforce/openai")>()),
  OpenAiWorkforceModel: class {
    structured = mock.structured;
    discover = mock.discover;
  },
}));
vi.mock("@/server/agent-workforce/company-research/store", () => ({
  LocalCompanyBudgetStore: class extends MemoryDailyStore {},
}));
vi.mock("@/server/agent-workforce/public-sources", async (original) => ({
  ...(await original<typeof import("@/server/agent-workforce/public-sources")>()),
  readPublicSource: async (url: string) => ({
    url,
    title: "Fictional company source",
    text: "fictional.example sells outdoor equipment through its online store. This page is fictional offline evidence, not live research.",
  }),
}));
vi.mock("@/server/agent-workforce/http", () => ({
  workforceActor: async () => ({ actor: { id: "local-development-agent-workforce" } }),
  workforceResponse: (body: unknown, status = 200) => Response.json(body, { status }),
}));
import { GET, POST } from "@/app/api/sales-agent/company-research/internal/route";
import { InternalCompanyReview } from "./internal-review-client";
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mock.files.clear();
  vi.clearAllMocks();
});

it("one UI click automatically runs real route/store/orchestration through four drafts and independent review (fictional transport)", async () => {
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
  vi.stubEnv("LOCAL_INTERNAL_SALES_ENABLED", "true");
  const provider = new MockWorkforceModel();
  mock.discover.mockResolvedValue(["https://fictional.example/"]);
  mock.structured.mockImplementation(async (stage, schema, instruction, context, usage) => {
    if (stage === "SEQUENCE")
      return schema.parse({
        approach: "Fictional offline product-led approach.",
        limitations: ["No auction observations."],
        emails: Array.from({ length: 4 }, (_, i) => ({
          subject: `Fictional message ${i + 1}`,
          body: `Fictional offline draft ${i + 1}.`,
        })),
      });
    const output = await provider.structured(stage, z.any(), instruction, context, usage);
    if (stage === "QUALITY_REVIEW") {
      delete output.oiq;
      output.verdict = "HOLD";
      output.checks.factualAccuracy = false;
      output.unsupportedAssertions = ["Offline synthetic copy has unsupported product citations."];
    }
    return schema.parse(output);
  });
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const request = new Request(`http://localhost:3000${url}`, {
      ...init,
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
    });
    return init?.method === "POST" ? POST(request) : GET(request);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<InternalCompanyReview />);
  await screen.findByText(/Local AI configured/);
  fireEvent.change(screen.getByLabelText("Company name or domain"), {
    target: { value: "fictional.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Research" }));
  await screen.findByText(/Email 4:/);
  expect(mock.structured.mock.calls.map((call) => call[0])).toEqual([
    "ACCOUNT_RESEARCH",
    "EVIDENCE_VALIDATION",
    "SEQUENCE",
    "QUALITY_REVIEW",
  ]);
  expect(screen.getByText(/Offline synthetic copy has unsupported product citations/)).toBeTruthy();
  expect(screen.getByText(/Contact clearance: HOLD/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Send|Enroll|Approve/ })).toBeNull();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  const saved = [...mock.files.values()].map((value) => JSON.parse(value));
  expect(saved).toHaveLength(1);
  expect(saved[0].automatic.directDrafts.emails).toHaveLength(4);
  expect(saved[0].automatic.directReview.verdict).toBe("HOLD");
  expect(saved[0].automatic.run.sequence).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh internal reviews" }));
  // Initial reviews + preparation-status read, one POST, and the explicit refresh.
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(
    fetcher.mock.calls.filter(([url]) => url === "/api/sales-agent/dashboard/prepare"),
  ).toHaveLength(1);
  expect(screen.getByText(/Email 4:/)).toBeTruthy();
  expect(mock.discover).toHaveBeenCalledTimes(1); // reload never reexecutes
  mock.structured.mockClear();
  mock.discover.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Research" }));
  await screen.findByText(/Only writing and independent review are new/);
  expect(mock.discover).not.toHaveBeenCalled();
  expect(mock.structured.mock.calls.map((call) => call[0])).toEqual(["SEQUENCE", "QUALITY_REVIEW"]);
  expect(screen.getByText(/Email 4:/)).toBeTruthy();
  expect([...mock.files.values()]).toHaveLength(2);
  const newDocs = [...mock.files.values()].map((value) => JSON.parse(value));
  expect(newDocs.find((doc) => doc.id === saved[0].id)).toEqual(saved[0]);
  expect(newDocs.find((doc) => doc.id !== saved[0].id).automatic.reusedResearch.documentId).toBe(
    saved[0].id,
  );
});
