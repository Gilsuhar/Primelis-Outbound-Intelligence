// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { localOutreachEvidence } from "./outreach-evidence";
import { localDevelopmentUser } from "@/lib/auth/local-development";
import { collectedContact } from "@/test/sales-agent-collection-fixtures";
const state = vi.hoisted(() => ({ vault: vi.fn(), access: vi.fn(), collect: vi.fn() }));
vi.mock("@/server/integrations/local-outreach-vault", async (original) => ({
  ...(await original<typeof import("@/server/integrations/local-outreach-vault")>()),
  localOutreachVault: state.vault,
}));
vi.mock("@/server/integrations/outreach", () => ({
  OutreachTokens: class {
    access = state.access;
  },
  OutreachConnector: class {
    constructor(
      private token: () => Promise<string>,
      options: { attempts: number },
    ) {
      expect(options.attempts).toBe(1);
    }
    async collect(...args: unknown[]) {
      await this.token();
      return state.collect(...args);
    }
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  for (const name of [
    "VERCEL",
    "VERCEL_ENV",
    "NEXT_PUBLIC_VERCEL_ENV",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "COMPANY_PILOT_ENABLED",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("LOCAL_DEV_LOGIN", "true");
  vi.stubEnv("LOCAL_DEV_SESSION_TOKEN", "fictional-session-for-tests-only-12345");
  vi.stubEnv("DATABASE_URL", "postgresql://local@localhost:5432/agent_workforce_test");
  vi.stubEnv("LOCAL_DEV_HTTPS", "true");
  vi.stubEnv("LOCAL_OUTREACH_OAUTH_ENABLED", "true");
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", localDevelopmentUser.id);
  state.access.mockResolvedValue("fictional-access");
  state.collect.mockResolvedValue({ observations: [], blockers: ["History unknown"] });
});
afterEach(() => vi.unstubAllEnvs());
it("reuses the reader without refresh and retains unresolved history", async () => {
  const result = await localOutreachEvidence(localDevelopmentUser.id).collect(
    collectedContact,
    new Date(),
  );
  expect(state.access).toHaveBeenCalledOnce();
  expect(state.access).toHaveBeenCalledWith(false);
  expect(state.collect).toHaveBeenCalledWith(collectedContact, collectedContact.observations);
  expect(result.blockers).toEqual(["History unknown"]);
});
it("rejects actor, owner, nonlocal and disabled TLS before credential access", async () => {
  expect(() => localOutreachEvidence("outsider")).toThrow();
  await expect(
    localOutreachEvidence(localDevelopmentUser.id).collect(
      { ...collectedContact, ownerId: "other" },
      new Date(),
    ),
  ).rejects.toThrow();
  vi.stubEnv("LOCAL_DEV_HTTPS", "false");
  expect(() => localOutreachEvidence(localDevelopmentUser.id)).toThrow();
  expect(state.access).not.toHaveBeenCalled();
  expect(state.vault).not.toHaveBeenCalled();
});
it("fails closed with no retry or secret-bearing error on unavailable access", async () => {
  state.access.mockRejectedValue(new Error("fictional-sensitive-provider-response"));
  const result = await localOutreachEvidence(localDevelopmentUser.id).collect(
    collectedContact,
    new Date(),
  );
  expect(result.observations).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("fictional-sensitive");
  expect(result.blockers[0]).toContain("HOLD");
  expect(state.access).toHaveBeenCalledOnce();
});
