export function probeTls(url: URL, transport?: {
  connect(options: Record<string, unknown>): unknown;
  secure(options: Record<string, unknown>): unknown;
}): Promise<{ tls: string }>;
export function tlsFailureCategory(error: unknown): string;
