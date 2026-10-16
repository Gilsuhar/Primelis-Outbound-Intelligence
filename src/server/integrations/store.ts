import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import type { MinimalPrismaClient } from "@/lib/prisma";
import { initialState, type IntegrationProvider, type IntegrationState } from "./contracts";
import { IntegrationError } from "./http";
export type StoredIntegration = { state: IntegrationState; version: number; secret: string | null };
export interface IntegrationStore {
  get(actor: string, provider: IntegrationProvider): Promise<StoredIntegration>;
  change<T>(
    actor: string,
    provider: IntegrationProvider,
    update: (row: StoredIntegration) => Promise<{ row: StoredIntegration; value: T }>,
  ): Promise<T>;
  claim(actor: string, provider: IntegrationProvider, worker: string): Promise<boolean>;
  release(actor: string, provider: IntegrationProvider, worker: string): Promise<void>;
}
export function encryptToken(
  actor: string,
  token: string,
  key = process.env.INTEGRATION_ENCRYPTION_KEY,
): string {
  const decoded = key ? Buffer.from(key, "base64") : Buffer.alloc(0);
  if (decoded.length !== 32) throw new IntegrationError("CONFIGURATION");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", decoded, iv);
  cipher.setAAD(Buffer.from(`${actor}:OUTREACH:v1`));
  return (() => {
    const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
  })();
}
export function decryptToken(
  actor: string,
  encrypted: string,
  key = process.env.INTEGRATION_ENCRYPTION_KEY,
): string {
  try {
    const decoded = key ? Buffer.from(key, "base64") : Buffer.alloc(0);
    if (decoded.length !== 32) throw new Error();
    const [iv, tag, data] = encrypted.split(".").map((part) => Buffer.from(part, "base64"));
    const cipher = createDecipheriv("aes-256-gcm", decoded, iv);
    cipher.setAAD(Buffer.from(`${actor}:OUTREACH:v1`));
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
  } catch {
    throw new IntegrationError("CONFIGURATION");
  }
}
export class PrismaIntegrationStore implements IntegrationStore {
  constructor(private readonly client?: MinimalPrismaClient) {}
  private async db() {
    if (this.client) return this.client;
    if (!process.env.DATABASE_URL) throw new IntegrationError("CONFIGURATION");
    return (await import("@/lib/prisma")).prisma;
  }
  async get(actor: string, provider: IntegrationProvider): Promise<StoredIntegration> {
    const rows = await (
      await this.db()
    ).$queryRaw<
      { state: IntegrationState; version: number; secret: string | null }[]
    >`SELECT state, version, secret FROM "IntegrationState" WHERE "userId" = ${actor} AND provider = ${provider}`;
    return rows[0] ?? { state: initialState(provider), version: 0, secret: null };
  }
  async change<T>(
    actor: string,
    provider: IntegrationProvider,
    update: (row: StoredIntegration) => Promise<{ row: StoredIntegration; value: T }>,
  ): Promise<T> {
    return (await this.db()).$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`integration:${actor}:${provider}`}, 0))`;
        const previous = await new PrismaIntegrationStore(tx).get(actor, provider);
        const { row, value } = await update(previous);
        const state = JSON.stringify(row.state);
        await tx.$executeRaw`INSERT INTO "IntegrationState" ("userId", provider, state, secret, version, "updatedAt") VALUES (${actor}, ${provider}, ${state}::jsonb, ${row.secret}, 1, NOW()) ON CONFLICT ("userId", provider) DO UPDATE SET state = ${state}::jsonb, secret = ${row.secret}, version = "IntegrationState".version + 1, "updatedAt" = NOW()`;
        // Audit only diagnostics and counts: never tokens, email addresses or provider bodies.
        await tx.$executeRaw`INSERT INTO "IntegrationAuditEvent" (id, "userId", provider, event, "createdAt") VALUES (${randomUUID()}, ${actor}, ${provider}, ${JSON.stringify({ status: row.state.status, jobId: row.state.job?.id, jobStatus: row.state.job?.status, imported: row.state.job?.imported, updated: row.state.job?.updated, detail: row.state.detail })}::jsonb, NOW())`;
        return value;
      },
      { timeout: 45000, maxWait: 10000 },
    );
  }
  async claim(actor: string, provider: IntegrationProvider, worker: string) {
    return !!(await (
      await this.db()
    )
      .$executeRaw`UPDATE "IntegrationState" SET "leaseOwner" = ${worker}, "leaseUntil" = NOW() + INTERVAL '180 seconds' WHERE "userId" = ${actor} AND provider = ${provider} AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())`);
  }
  async release(actor: string, provider: IntegrationProvider, worker: string) {
    await (
      await this.db()
    )
      .$executeRaw`UPDATE "IntegrationState" SET "leaseOwner" = NULL, "leaseUntil" = NULL WHERE "userId" = ${actor} AND provider = ${provider} AND "leaseOwner" = ${worker}`;
  }
}
