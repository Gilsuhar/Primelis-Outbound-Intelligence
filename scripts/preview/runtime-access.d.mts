export const runtimeAccessQuery: string;
export function runtimeAccessFailures(rows: unknown): string[];
export function inspectRuntimeAccess(reader: { $queryRawUnsafe(sql: string): Promise<unknown> }): Promise<string[]>;
