// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { outreachLocalConfigSchema } from "./local-outreach-vault";
import { localDevelopmentUser } from "@/lib/auth/local-development";
import {
  OAuthStageError,
  oauthDiagnostic,
  recordOAuthFailure,
  readOAuthFailure,
  tokenHttpError,
} from "./outreach-oauth-diagnostics";
const fs = vi.hoisted(() => ({
  lstatSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));
vi.mock("node:fs", () => fs);
beforeEach(() => {
  vi.stubEnv("LOCAL_OUTREACH_OAUTH_ENABLED", "true");
  fs.lstatSync.mockReturnValue({
    isDirectory: () => true,
    isFile: () => true,
    isSymbolicLink: () => false,
    size: 200,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it.each([
  new Error("client_id=private-client client_secret=private-secret code=private-code"),
  new Error("https://private-user:private-password@example.invalid?access_token=private-token"),
  {
    message: "private-secret",
    stack: "Authorization: Bearer private-token",
    cause: "private-refresh",
  },
])("never persists arbitrary errors, headers, URLs, stacks or credential values", (error) => {
  const diagnostic = recordOAuthFailure("TOKEN_STORAGE", error);
  expect(diagnostic).toMatchObject({ stage: "TOKEN_STORAGE", code: "OPERATION_FAILED" });
  expect(
    JSON.stringify([fs.writeFileSync.mock.calls, vi.mocked(console.error).mock.calls]),
  ).not.toContain("private-");
});
it("maps schema errors without serializing values or issue details", () => {
  const parsed = z.literal("allowed").safeParse("private-client-secret");
  if (parsed.success) throw new Error("fixture");
  expect(oauthDiagnostic("CREDENTIAL_VALIDATION", parsed.error)).toEqual({
    stage: "CREDENTIAL_VALIDATION",
    code: "INVALID_CREDENTIAL_CONFIGURATION",
  });
});
it.each([
  ["private invalid id", "fictional-secret", "INVALID_CLIENT_ID_FORMAT"],
  ["fictional-client", "short", "INVALID_CLIENT_SECRET_FORMAT"],
  ["private invalid id", "short", "INVALID_CLIENT_ID_AND_SECRET_FORMAT"],
] as const)(
  "persists only allowlisted field failure codes: %s / masked",
  (clientId, clientSecret, code) => {
    const parsed = outreachLocalConfigSchema.safeParse({
      version: 1,
      actor: localDevelopmentUser.id,
      clientId,
      clientSecret,
      encryptionKey: Buffer.alloc(32, 4).toString("base64"),
    });
    if (parsed.success) throw new Error("Expected fictional invalid configuration");
    const diagnostic = recordOAuthFailure("CREDENTIAL_VALIDATION", parsed.error);
    expect(diagnostic).toEqual({ stage: "CREDENTIAL_VALIDATION", code });
    const outputs = JSON.stringify([
      fs.writeFileSync.mock.calls,
      vi.mocked(console.error).mock.calls,
    ]);
    expect(outputs).not.toContain(clientId);
    expect(outputs).not.toContain(clientSecret);
    expect(outputs).not.toMatch(/issues|received|encryptionKey/);
    if (process.platform === "win32") {
      fs.readFileSync.mockReturnValue(fs.writeFileSync.mock.calls[0][1]);
      expect(readOAuthFailure()).toMatchObject(diagnostic);
    }
  },
);
it("retains stage attribution across Next route bundles while discarding unknown fields", () => {
  const crossBundle = Object.assign(new Error("private-token"), {
    name: "OutreachOAuthStageError",
    stage: "TOKEN_STORAGE",
    code: "OPERATION_FAILED",
    httpStatus: 500,
    privateField: "private-secret",
  });
  expect(oauthDiagnostic("STATE_VALIDATION", crossBundle)).toEqual({
    stage: "TOKEN_STORAGE",
    code: "OPERATION_FAILED",
    httpStatus: 500,
  });
  expect(JSON.stringify(oauthDiagnostic("STATE_VALIDATION", crossBundle))).not.toContain(
    "private-",
  );
});
it.skipIf(process.platform !== "win32")(
  "stores only a bounded timestamp/stage/code/status record and reads that schema",
  () => {
    recordOAuthFailure("PRECONDITION", new OAuthStageError("TOKEN_EXCHANGE", "invalid_grant", 400));
    const contents = fs.writeFileSync.mock.calls[0][1];
    expect(contents.length).toBeLessThan(300);
    expect(Object.keys(JSON.parse(contents)).sort()).toEqual(["at", "code", "httpStatus", "stage"]);
    fs.readFileSync.mockReturnValue(contents);
    expect(readOAuthFailure()).toEqual({
      stage: "TOKEN_EXCHANGE",
      code: "invalid_grant",
      httpStatus: 400,
    });
    fs.readFileSync.mockReturnValue(
      JSON.stringify({ ...JSON.parse(contents), secret: "private-secret" }),
    );
    expect(readOAuthFailure()).toBeNull();
  },
);
it("diagnostic storage failure cannot replace the original safe error", () => {
  fs.lstatSync.mockImplementation(() => {
    throw new Error("private-path");
  });
  expect(recordOAuthFailure("CREDENTIAL_READ", new Error("LOCAL_VAULT_UNAVAILABLE"))).toMatchObject(
    { code: "LOCAL_VAULT_UNAVAILABLE" },
  );
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-path");
});
it.each([
  { error: "private-secret", error_description: "private-token" },
  { error: { access_token: "private-token" } },
  { error: "invalid_client", error_description: "x".repeat(9000) },
])("limits provider error bodies and accepts only standard identifiers", async (body) => {
  const error = await tokenHttpError(Response.json(body, { status: 400 }));
  expect(error).toMatchObject({
    stage: "TOKEN_EXCHANGE",
    code: "TOKEN_HTTP_ERROR",
    httpStatus: 400,
  });
  expect(JSON.stringify(error)).not.toContain("private-");
});
