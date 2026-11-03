export function verifyPreview(env: Record<string,string | undefined>, execute: boolean, dependencies: {
  authorize(env: Record<string,string | undefined>): Promise<unknown>;
  probe(url: URL): Promise<unknown>;
  connect(url: string): Promise<{$queryRawUnsafe(sql: string): Promise<unknown[]>; $disconnect(): Promise<void>}>;
  diff(url: string): Promise<void>;
}): Promise<{status: string; migrationCount: number; tableCount?: number}>;
