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
  $transaction<T>(callback: (tx: MinimalPrismaClient) => Promise<T>): Promise<T>;
  sourceDocument: PrismaModelDelegate;
  caseStudy: PrismaModelDelegate;
  generatedDraft: PrismaModelDelegate;
  user: PrismaModelDelegate;
};

const require = createRequire(import.meta.url);
const prismaClientModule = require("@prisma/client") as {
  PrismaClient: new () => MinimalPrismaClient;
};

const globalForPrisma = globalThis as unknown as {
  prisma?: MinimalPrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new prismaClientModule.PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
