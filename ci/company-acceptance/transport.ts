import type { MinimalPrismaClient } from "../../src/lib/prisma";
import { requireCiDatabaseUrl, fail, type Approval } from "./policy";

type ConnectedClient = MinimalPrismaClient & {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
};
// Only the factory can attest a client. A URL, boolean or separate TLS probe cannot.
const verified = new WeakMap<object, string>();

export async function connectCiDatabase(value: string | undefined, approval: Approval) {
  const url = requireCiDatabaseUrl(value, approval);
  const { PrismaClient } = (await import("@prisma/client")) as unknown as {
    PrismaClient: new (options: unknown) => ConnectedClient;
  };
  // Prisma 5's require + strict enforces TLS and certificate/hostname verification
  // on this connection and every reconnect. Never pass a caller-created client.
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    await db.$connect();
    verified.set(db, JSON.stringify(approval.database));
    return db;
  } catch {
    await db.$disconnect().catch(() => undefined);
    return fail("CI_DATABASE_TLS_CONNECTION_DENIED");
  }
}

export function requireVerifiedCiTransport(db: MinimalPrismaClient, approval: Approval) {
  if (verified.get(db) !== JSON.stringify(approval.database))
    fail("CI_DATABASE_TRANSPORT_UNVERIFIED");
}
