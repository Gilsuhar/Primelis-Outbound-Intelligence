// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { NextRequest } from "next/server";
declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}
import { HubSpotApiClient, pushSequenceToHubSpot } from "./services/hubspot-push-service";
import { ReadTransport } from "./integrations/http";
import { OutreachTokens } from "./integrations/outreach";
import { OutreachAuthorization } from "./integrations/outreach-oauth";
import { OpenAiProvider } from "./services/ai-provider";
import { OpenAiWorkforceModel } from "./agent-workforce/openai";
import {
  ZeroBounceVerificationAdapter,
  GatewayVerificationAdapter,
} from "./verification/providers";
import { defaultGetLeadsProvider } from "./services/linkedin-enrichment-service";
import { observeBrandSerp } from "./agent-workforce/prospect-research/serp";
import { readPublicSource } from "./agent-workforce/public-sources";
import { drainSync } from "./integrations/worker";
import { drainProspectResearch } from "./agent-workforce/prospect-research/worker";
import { drainDraftStudio } from "./agent-workforce/draft-studio/worker";
import { requestLoginLink, sendPasswordRecovery } from "@/app/auth/actions";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";
import { updateSession } from "@/lib/supabase/middleware";

const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireCurrentUser: vi.fn(),
  requireRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getRequestOrigin: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => auth);
const network = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubGlobal("fetch", network);
  // Vitest uses the classic JSX transform; Next's build supplies the automatic JSX runtime.
  vi.stubGlobal("React", React);
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("actual execution boundaries reject Preview before I/O", () => {
  it.each(["createCompany", "createNote", "createTask"] as const)(
    "blocks HubSpot %s",
    async (method) => {
      const client = new HubSpotApiClient("synthetic-token");
      await expect(
        client[method]({
          companyName: "Synthetic",
          companyId: "synthetic",
          subject: "Synthetic",
          body: "Synthetic",
        }),
      ).rejects.toThrow("PREVIEW_OPERATION_DENIED");
    },
  );
  it("blocks the high-level HubSpot service before any injected client/persistence", async () => {
    const persistence = { getSuppressionRecords: vi.fn() };
    await expect(pushSequenceToHubSpot({}, { persistence })).rejects.toThrow(
      "PREVIEW_OPERATION_DENIED",
    );
    expect(persistence.getSuppressionRecords).not.toHaveBeenCalled();
  });
  it.each(["/api/v2/prospects", "/api/v2/sequenceStates", "/api/v2/mailings"])(
    "denies Outreach reads/writes/enrollment resource %s before token loading",
    async (path) => {
      const token = vi.fn();
      const transport = new ReadTransport("https://api.outreach.io", token, { fetcher: network });
      await expect(transport.read(path)).rejects.toThrow("PREVIEW_OPERATION_DENIED");
      await expect(transport.read(path, { action: "synthetic-write" })).rejects.toThrow(
        "PREVIEW_OPERATION_DENIED",
      );
      expect(token).not.toHaveBeenCalled();
    },
  );
  it("denies refresh before loading configuration, decrypting, locking or persisting", async () => {
    const config = vi.fn();
    const store = { get: vi.fn(), change: vi.fn() };
    const tokens = new OutreachTokens("synthetic", store as never, config, network);
    await expect(tokens.access()).rejects.toThrow("PREVIEW_OPERATION_DENIED:outreach-refresh");
    await expect(tokens.access(false)).rejects.toThrow("PREVIEW_OPERATION_DENIED");
    expect(config).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();
    expect(store.change).not.toHaveBeenCalled();
  });
  it("denies Outreach authorization initiation and exchange before grant handling", async () => {
    const flow = new OutreachAuthorization();
    expect(() => flow.begin(undefined as never, "synthetic")).toThrow("PREVIEW_OPERATION_DENIED");
    await expect(flow.finish(undefined as never)).rejects.toThrow("PREVIEW_OPERATION_DENIED");
  });
  it.each([requestLoginLink, sendPasswordRecovery])(
    "blocks authentication email sending",
    async (action) => {
      await expect(action({ ok: false, message: "" }, new FormData())).rejects.toThrow(
        "PREVIEW_OPERATION_DENIED:email-send",
      );
      expect(auth.createSupabaseServerClient).not.toHaveBeenCalled();
    },
  );
  it("blocks legacy OpenAI even with an injected key and Production configuration", async () => {
    const model = new OpenAiProvider({
      NODE_ENV: "test",
      VERCEL_ENV: "production",
      OPENAI_API_KEY: "synthetic",
    });
    await expect(model.generateDraft(undefined as never)).rejects.toThrow(
      "PREVIEW_OPERATION_DENIED",
    );
  });
  it("blocks workforce discovery before paid reservations and fetch", async () => {
    const model = new OpenAiWorkforceModel(
      { NODE_ENV: "test", AI_PROVIDER: "openai", OPENAI_API_KEY: "synthetic" },
      network,
    );
    await expect(model.discover("synthetic", {} as never)).rejects.toThrow(
      "PREVIEW_OPERATION_DENIED",
    );
  });
  it("blocks independent verification adapters", async () => {
    await expect(
      new ZeroBounceVerificationAdapter("synthetic", network).verify(
        "EMAIL",
        {} as never,
        new Date(),
      ),
    ).rejects.toThrow("PREVIEW_OPERATION_DENIED");
    await expect(
      new GatewayVerificationAdapter(
        "synthetic",
        "https://synthetic.example",
        "synthetic",
        network,
      ).verify("EMAIL", {} as never),
    ).rejects.toThrow("PREVIEW_OPERATION_DENIED");
  });
  it("blocks enrichment, paid search and public research before requests or DNS", async () => {
    await expect(defaultGetLeadsProvider(undefined as never)).rejects.toThrow(
      "PREVIEW_OPERATION_DENIED",
    );
    await expect(observeBrandSerp({} as never, new Date(), {}, network)).rejects.toThrow(
      "PREVIEW_OPERATION_DENIED",
    );
    await expect(readPublicSource("https://synthetic.example")).rejects.toThrow(
      "PREVIEW_OPERATION_DENIED",
    );
  });
  it.each([
    () => drainSync("synthetic", "OUTREACH"),
    () => drainProspectResearch("synthetic"),
    () => drainDraftStudio("synthetic"),
  ])("blocks direct worker invocation", async (run) => {
    await expect(run()).rejects.toThrow("PREVIEW_OPERATION_DENIED:worker");
  });
  it("blocks business actions independently of Next middleware", async () => {
    await expect(withAuthenticatedCreator({})).rejects.toThrow("PREVIEW_OPERATION_DENIED");
    expect(auth.requireCurrentUser).not.toHaveBeenCalled();
  });
  it("does not admit the middleware worker-bearer exception in Preview", async () => {
    const result = await updateSession(
      new NextRequest("https://synthetic.vercel.app/api/sales-agent/daily/worker", {
        method: "POST",
      }),
    );
    expect(result.status).toBe(403);
  });
  it("keeps the authenticated synthetic Recycler page available with live collection disabled", async () => {
    auth.requireCurrentUser.mockResolvedValueOnce({ id: "synthetic-reviewer", role: "SALES_USER" });
    const page = (await import("@/app/sales-agent/recycler/page")).default;
    const view = await page();
    expect(auth.requireCurrentUser).toHaveBeenCalledOnce();
    expect(view.props.liveAvailable).toBe(false);
    expect(view.props.initial).toBeDefined();
  });
  it("does not render the Recycler page when its existing authentication gate rejects", async () => {
    auth.requireCurrentUser.mockRejectedValueOnce(new Error("AUTH_REQUIRED"));
    const page = (await import("@/app/sales-agent/recycler/page")).default;
    await expect(page()).rejects.toThrow("AUTH_REQUIRED");
  });
});

// Discover every resource route so a new unguarded endpoint fails this regression.
const routes = import.meta.glob("../app/api/**/route.ts");
describe("all exported resource API handlers", () => {
  it.each(Object.entries(routes))(
    "rejects direct invocation of %s before auth/network",
    async (_path, load) => {
      const handlers = (await load()) as Record<
        string,
        (request: NextRequest, context?: unknown) => Promise<Response> | Response
      >;
      let count = 0;
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
        if (!handlers[method]) continue;
        count++;
        const response = await handlers[method](
          new NextRequest("https://synthetic.vercel.app/api/synthetic", { method }),
          { params: Promise.resolve({ runId: "synthetic" }) },
        );
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: "PREVIEW_OPERATION_DENIED" });
      }
      expect(count).toBeGreaterThan(0);
      expect(auth.getCurrentUser).not.toHaveBeenCalled();
    },
  );
});
