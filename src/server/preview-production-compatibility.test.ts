// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HubSpotApiClient } from "./services/hubspot-push-service";
import { ReadTransport } from "./integrations/http";
import { getSupabaseAuthConfig } from "@/lib/auth/env";
import { configuredDatabaseUrl } from "@/lib/preview-isolation";
import { OpenAiProvider } from "./services/ai-provider";
import { previewFixture } from "@/test/preview-fixture";
beforeEach(() => vi.stubEnv("VERCEL_ENV", "production"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("preserves Production HubSpot transport behavior using only a mocked request", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "synthetic-company" }));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await new HubSpotApiClient("synthetic-token").createCompany({ companyName: "Synthetic" }),
  ).toEqual({ id: "synthetic-company" });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1].method).toBe("POST");
});
it("retains the existing Outreach read-only resource allowlist outside Preview", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: [] }));
  const token = vi.fn().mockResolvedValue("synthetic-token");
  const reader = new ReadTransport("https://api.outreach.io", token, { fetcher });
  expect(await reader.read("/api/v2/prospects")).toEqual({ data: [] });
  expect(fetcher).toHaveBeenCalledOnce();
  fetcher.mockClear();
  token.mockClear();
  await expect(reader.read("/api/v2/sequenceStates", { action: "enroll" })).rejects.toThrow(
    "CONFIGURATION",
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(token).not.toHaveBeenCalled();
});
it("retains Production Auth and database selection without Preview approval metadata", () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.example",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-key",
    DATABASE_URL: "synthetic-production-binding",
  };
  expect(getSupabaseAuthConfig(env)).toEqual({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  expect(configuredDatabaseUrl(env)).toBe(env.DATABASE_URL);
});
it("also denies provider instances explicitly configured as Preview outside Preview runtime", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const model = new OpenAiProvider({ ...previewFixture(), OPENAI_API_KEY: "synthetic-key" });
  await expect(model.generateDraft(undefined as never)).rejects.toThrow("PREVIEW_OPERATION_DENIED");
  expect(fetcher).not.toHaveBeenCalled();
});
