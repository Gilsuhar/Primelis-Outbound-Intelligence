export const runtimeSessionQuery: string;
export const deniedRuntimeReads: readonly string[];
type Reader = {
  $queryRawUnsafe(query: string): Promise<unknown>;
  user: { findFirst(args: unknown): Promise<unknown>; findMany(args: unknown): Promise<unknown> };
};
export function verifyRuntimePrisma(client: {
  $transaction(callback: (tx: Reader) => Promise<void>, options: { timeout: number; maxWait: number }): Promise<void>;
}): Promise<{ status: string; visibleProfiles: number; allowedColumns: number; deniedReads: number; writePrivileges: string; readOnly: string }>;
