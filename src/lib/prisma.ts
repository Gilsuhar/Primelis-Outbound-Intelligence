import { runtimeDatabaseUrl } from "./preview-runtime-tls";
import { isPreviewRestricted } from "./preview-policy.mjs";
import { createRequire } from "node:module";

type PrismaModelDelegate = {
  findMany(args?: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<Record<string, unknown> | null>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  update(args: unknown): Promise<Record<string, unknown>>;
};

export type MinimalPrismaClient = {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $transaction<T>(
    callback: (tx: MinimalPrismaClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T>;
  sourceDocument: PrismaModelDelegate;
  caseStudy: PrismaModelDelegate;
  generatedDraft: PrismaModelDelegate;
  user: PrismaModelDelegate;
};

const require = createRequire(import.meta.url);
const prismaClientModule = require("@prisma/client") as {
  PrismaClient: new (options?: { datasources: { db: { url: string } } }) => MinimalPrismaClient;
};

const globalForPrisma = globalThis as unknown as {
  prisma?: MinimalPrismaClient;
};

// Lazy creation keeps build-time imports offline. The guard runs before any database operation.
let client: MinimalPrismaClient | undefined;
let clientUrl: string | undefined;
let clientRestricted: boolean | undefined;
export const prisma = new Proxy({} as MinimalPrismaClient, {
  get(_target, key) {
    const url = runtimeDatabaseUrl();
    const restricted = isPreviewRestricted();
    // Never reuse a previously constructed client across configuration/security boundaries.
    if (clientUrl !== url || clientRestricted !== restricted) client = undefined;
    clientUrl = url;
    clientRestricted = restricted;
    client ??=
      !restricted && globalForPrisma.prisma
        ? globalForPrisma.prisma
        : new prismaClientModule.PrismaClient(url ? { datasources: { db: { url } } } : undefined);
    if (process.env.NODE_ENV !== "production" && !restricted)
      globalForPrisma.prisma = client;
    const value = Reflect.get(client, key);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
