import { configuredDatabaseUrl } from "./preview-isolation";
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
export const prisma = new Proxy({} as MinimalPrismaClient, {
  get(_target, key) {
    const url = configuredDatabaseUrl();
    client ??=
      process.env.VERCEL_ENV !== "preview" && globalForPrisma.prisma
        ? globalForPrisma.prisma
        : new prismaClientModule.PrismaClient(url ? { datasources: { db: { url } } } : undefined);
    if (process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "preview")
      globalForPrisma.prisma = client;
    const value = Reflect.get(client, key);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
