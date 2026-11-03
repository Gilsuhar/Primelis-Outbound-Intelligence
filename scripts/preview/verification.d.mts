export function sha256(value: string | Buffer): string;
export function reviewedFiles(names: string[], read?: (path: string) => Buffer): { hashes: Record<string, string>; tables: string[] };
export function verifyInitializedSchema(db: { $queryRawUnsafe(sql: string): Promise<unknown[]> }, plan: { migrations: string[] }, files: ReturnType<typeof reviewedFiles>): Promise<{ migrationCount: number; tableCount: number; checksums: string; rls: string; apiAccess: string }>;
