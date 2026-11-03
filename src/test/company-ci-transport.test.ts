// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { MinimalPrismaClient } from "../lib/prisma";
import { fictionalApproval as approval } from "../../ci/company-acceptance/test-support";
import {
  connectCiDatabase,
  requireVerifiedCiTransport,
} from "../../ci/company-acceptance/transport";
import { verifyDatabase } from "../../ci/company-acceptance/database";
const driver = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), options: vi.fn() }));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      driver.options(options);
    }
    $connect = driver.connect;
    $disconnect = driver.disconnect;
  },
}));
const url = `postgresql://ci_acceptance_app:fictional-only@${approval.database.host}/${approval.database.name}?sslmode=require&sslaccept=strict&connection_limit=1&connect_timeout=15`;
beforeEach(() => {
  vi.clearAllMocks();
  driver.connect.mockResolvedValue(undefined);
  driver.disconnect.mockResolvedValue(undefined);
});
it("attests only the same successfully connected strict Prisma client", async () => {
  const db = await connectCiDatabase(url, approval);
  expect(driver.options).toHaveBeenCalledWith({ datasources: { db: { url } }, log: [] });
  expect(driver.connect).toHaveBeenCalledOnce();
  expect(() => requireVerifiedCiTransport(db, approval)).not.toThrow();
  expect(() => requireVerifiedCiTransport({ ...db }, approval)).toThrow(
    "CI_DATABASE_TRANSPORT_UNVERIFIED",
  );
  expect(() =>
    requireVerifiedCiTransport(db, {
      ...approval,
      database: { ...approval.database, policySha256: "0".repeat(64) },
    }),
  ).toThrow();
});
it.each([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "PLAINTEXT_REFUSED",
])("fails closed and sanitizes driver failure %s", async (code) => {
  driver.connect.mockRejectedValue(new Error(code + " fictional sensitive detail"));
  await expect(connectCiDatabase(url, approval)).rejects.toThrow(
    /^CI_DATABASE_TLS_CONNECTION_DENIED$/,
  );
  expect(driver.disconnect).toHaveBeenCalledOnce();
});
it.each([
  url.replace("sslmode=require", "sslmode=disable"),
  url.replace("sslmode=require", "sslmode=prefer"),
  url.replace("sslaccept=strict", "sslaccept=accept_invalid_certs"),
  url.replace(approval.database.host, "unrelated.neon.tech"),
  url.replace("/ci_acceptance_pilot?", "/neondb?"),
  url + "&sslrootcert=unreviewed.pem",
])("rejects unsafe configuration before constructing a driver", async (value) => {
  await expect(connectCiDatabase(value, approval)).rejects.toThrow("CI_DATABASE_IDENTITY_DENIED");
  expect(driver.options).not.toHaveBeenCalled();
});
it("refuses a caller-supplied client before any database query", async () => {
  const query = vi.fn();
  await expect(
    verifyDatabase(
      { $queryRaw: query } as unknown as MinimalPrismaClient,
      approval,
      "a".repeat(64),
    ),
  ).rejects.toThrow("CI_DATABASE_TRANSPORT_UNVERIFIED");
  expect(query).not.toHaveBeenCalled();
});
