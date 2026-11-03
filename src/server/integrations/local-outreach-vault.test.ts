// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { localDevelopmentUser } from "@/lib/auth/local-development";
const mock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mock.spawn }));
import { localOutreachVault, outreachLocalConfigSchema } from "./local-outreach-vault";
const config = {
  version: 1 as const,
  actor: localDevelopmentUser.id,
  clientId: "fictional-client",
  clientSecret: "fictional-private-secret",
  encryptionKey: Buffer.alloc(32, 6).toString("base64"),
};
it.each([
  "7",
  "fictional:app.id+with/padding=",
  "fictional&scope=prospects.write#?",
  "x".repeat(256),
])("preserves fictional opaque client identifiers unchanged: %s", (clientId) => {
  expect(outreachLocalConfigSchema.parse({ ...config, clientId }).clientId).toBe(clientId);
  expect(mock.spawn).not.toHaveBeenCalled();
});
it.each([
  "",
  " ",
  " leading",
  "trailing ",
  "internal space",
  "tab\tvalue",
  "line\nvalue",
  "line\rvalue",
  "nul\0value",
  "delete\x7f",
  "hidden\u200bvalue",
  "unicode\u00e9",
  "x".repeat(257),
])("rejects empty, whitespace, controls, non-ASCII or oversized IDs: %j", (clientId) => {
  expect(outreachLocalConfigSchema.safeParse({ ...config, clientId }).success).toBe(false);
  expect(mock.spawn).not.toHaveBeenCalled();
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("LOCAL_DEV_LOGIN", "true");
  vi.stubEnv("LOCAL_DEV_SESSION_TOKEN", "fictional-vault-test-session-value");
  vi.stubEnv("LOCAL_DEV_HTTPS", "true");
  vi.stubEnv("LOCAL_OUTREACH_OAUTH_ENABLED", "true");
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", config.actor);
  vi.stubEnv("DATABASE_URL", "postgresql://local@localhost:5432/agent_workforce_test");
  for (const name of [
    "VERCEL",
    "VERCEL_ENV",
    "NEXT_PUBLIC_VERCEL_ENV",
    "COMPANY_PILOT_ENABLED",
    "NODE_TLS_REJECT_UNAUTHORIZED",
  ])
    vi.stubEnv(name, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function child(output: string, exitCode = 0) {
  const processMock = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    kill: vi.fn(),
  });
  processMock.stdin.end.mockImplementation(() =>
    queueMicrotask(() => {
      processMock.stderr.emit("data", Buffer.from("fictional-sensitive-error"));
      processMock.stdout.emit("data", Buffer.from(output));
      processMock.emit("close", exitCode);
    }),
  );
  mock.spawn.mockReturnValueOnce(processMock);
  return processMock;
}
it.skipIf(process.platform !== "win32")(
  "passes secrets only through private pipes, never command arguments",
  async () => {
    const processMock = child(JSON.stringify(config));
    expect(await localOutreachVault(config)).toEqual(config);
    expect(processMock.stdin.end).toHaveBeenCalledWith(JSON.stringify(config));
    const [executable, args, options] = mock.spawn.mock.calls[0];
    expect(executable).toMatch(/System32.*WindowsPowerShell.*powershell\.exe$/);
    expect(JSON.stringify(args)).not.toContain(config.clientSecret);
    expect(JSON.stringify(args)).not.toContain(config.encryptionKey);
    expect(options).toMatchObject({ windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  },
);
it.skipIf(process.platform !== "win32").each([
  ["fictional-private-secret", 1],
  ["malformed-secret-output", 0],
  ["x".repeat(32769), 0],
])("withholds child errors and malformed/oversized output", async (output, status) => {
  child(output, status);
  await expect(localOutreachVault()).rejects.toThrow(/^LOCAL_VAULT_(UNAVAILABLE|INVALID)$/);
});
it("refuses hosted execution before spawning any secret reader", async () => {
  vi.stubEnv("VERCEL", "1");
  await expect(localOutreachVault()).rejects.toThrow("LOCAL_OUTREACH_DISABLED");
  expect(mock.spawn).not.toHaveBeenCalled();
});
