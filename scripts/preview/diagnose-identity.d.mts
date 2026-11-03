export function diagnoseIdentity(env: Record<string,string | undefined>, dependencies: {
  authorize(env: Record<string,string | undefined>): Promise<unknown>;
  probe(url: URL): Promise<unknown>;
  connect(url: string): Promise<{$queryRawUnsafe(sql: string): Promise<unknown[]>; $disconnect(): Promise<void>}>;
}): Promise<string[]>;
export function diagnosticConditions(error: unknown): string[];
