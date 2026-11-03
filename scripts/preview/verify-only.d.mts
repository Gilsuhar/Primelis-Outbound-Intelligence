export function verifyPreview(env: Record<string,string | undefined>, execute: boolean, dependencies: {
  authorize(env: Record<string,string | undefined>): Promise<unknown>;
  probe(url: URL): Promise<unknown>;
  connect(url: string): Promise<import("./read-only-context.mjs").ReadOnlyClient>;
  diff(url: string): Promise<void>;
}): Promise<{status: string; migrationCount: number; tableCount?: number}>;
