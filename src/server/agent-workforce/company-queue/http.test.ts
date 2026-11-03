// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { companyQueueRequest, publicQueue } from "./http";
import { pilotTestEnv, MemoryQueueStore } from "./test-support";
import { initialQueue } from "./contracts";
import { getCurrentUser } from "@/lib/auth/server";
import { PrismaQueueStore } from "./store";
import { workforceActor } from "../http";
import { updateSession } from "@/lib/supabase/middleware";
import { withAuthenticatedCreator, withAuthenticatedReviewActor } from "@/lib/auth/action-actor";
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: vi.fn(),
  requireCurrentUser: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("./store", () => ({ PrismaQueueStore: vi.fn() }));
const origin = pilotTestEnv.COMPANY_PILOT_ORIGIN!;
function request(method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/sales-agent/company-queue`, {
    method,
    headers: { host: new URL(origin).host, origin, ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const [k, v] of Object.entries(pilotTestEnv)) vi.stubEnv(k, v);
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "fixture-operator",
    email: "fixture@example.invalid",
    role: "SALES_USER",
  });
  vi.mocked(PrismaQueueStore).mockImplementation(
    () => new MemoryQueueStore() as unknown as PrismaQueueStore,
  );
});
afterEach(() => vi.unstubAllEnvs());
it("refuses unauthorized users before constructing storage", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await companyQueueRequest(request())).status).toBe(403);
  expect(PrismaQueueStore).not.toHaveBeenCalled();
});
it("Preview denies legacy queue reads and provider/mode/outbound input before storage", async () => {
  expect((await companyQueueRequest(request())).status).toBe(403);
  for (const body of [
    { action: "SEND" },
    { action: "ENROLL" },
    { action: "ENQUEUE_FIXTURE_COHORT", mode: "LIVE" },
    { companyDomain: "nike.com" },
  ])
    expect((await companyQueueRequest(request("POST", body))).status).toBe(403);
  expect(PrismaQueueStore).not.toHaveBeenCalled();
});
it("Preview denies workers even with valid bearer credentials and never leaks queue payloads", async () => {
  expect((await companyQueueRequest(request("POST", {}), true)).status).toBe(403);
  const response = await companyQueueRequest(
    request("POST", {}, { authorization: `Bearer ${pilotTestEnv.COMPANY_PILOT_WORKER_SECRET}` }),
    true,
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ ok: false, code: "PREVIEW_OPERATION_DENIED" });
  expect(PrismaQueueStore).not.toHaveBeenCalled();
  expect(getCurrentUser).not.toHaveBeenCalled();
});
it("middleware denies CRM/jobs/sending/enrollment and the old research route before authentication", async () => {
  for (const path of [
    "/api/sales-agent/daily/worker",
    "/api/sales-agent/integrations/worker",
    "/api/sales-agent/company-research",
    "/api/send",
    "/api/enroll",
  ]) {
    const response = await updateSession(new NextRequest(origin + path, { method: "POST" }));
    expect(response.status).toBe(403);
  }
  expect((await workforceActor(request(), true)).response?.status).toBe(403);
  await expect(withAuthenticatedCreator({})).rejects.toThrow("PREVIEW_OPERATION_DENIED");
  await expect(withAuthenticatedReviewActor({})).rejects.toThrow("PREVIEW_OPERATION_DENIED");
});
it("empty public status grants no approval", () =>
  expect(publicQueue(initialQueue())).toEqual({ version: 1, lastWorkerAt: null, jobs: [] }));
