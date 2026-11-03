export const verificationRole: "recycler_preview_verify";
export const privilegeQuery: string;
export const privilegeFields: readonly string[];
export type Reader = { $queryRawUnsafe(sql: string): Promise<unknown[]> };
export type ReadOnlyClient = { $transaction(work: (tx: Reader & { $executeRawUnsafe(sql: string): Promise<unknown> }) => Promise<unknown>, options: { maxWait: number; timeout: number; isolationLevel: "RepeatableRead" }): Promise<unknown>; $disconnect(): Promise<void> };
export function assertVerificationPrivileges(rows: unknown): void;
export function assertVerificationIdentity(rows: unknown): void;
export function verificationUrl(value: string): string;
export function withReadOnlyContext<T>(db: ReadOnlyClient, work: (tx: Reader) => Promise<T>): Promise<T>;
