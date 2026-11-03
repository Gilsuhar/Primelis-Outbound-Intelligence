export function setupPlan(env: Record<string, string | undefined>, migrations?: string[], operation?: "initialize" | "verify" | "verify-readonly" | "audit-admin"): { projectRef: string; endpoint: string; migrations: string[] };
export function initializePreview(env: Record<string, string | undefined>, execute: boolean, dependencies: {
  connect(url: string | undefined): Promise<{ $queryRawUnsafe(sql: string): Promise<unknown[]>; $disconnect(): Promise<void> }>;
  migrate(url: string | undefined): Promise<void>;
  probe(url: URL): Promise<unknown>;
  authorize(env: Record<string, string | undefined>): Promise<unknown>;
  diff(url: string | undefined): Promise<void>;
}): Promise<{ status: string; migrationCount: number; tableCount?: number }>;
