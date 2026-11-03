import type { ReadOnlyClient, Reader } from "./read-only-context.mjs";
export function withAdministrativeAudit<T>(db: ReadOnlyClient, work: (tx: Reader) => Promise<T>): Promise<T>;
export function auditPreview(env: Record<string, string | undefined>, execute: boolean, dependencies: {
  authorize(env: Record<string, string | undefined>): Promise<unknown>;
  probe(url: URL): Promise<unknown>;
  connect(url: string): Promise<ReadOnlyClient>;
  run: NonNullable<Parameters<typeof import("./schema-diff.mjs").runSchemaDiff>[1]>;
}): Promise<{status: string; migrationCount: number; tableCount?: number; diffProtection: string; schemaComparison?: string}>;
