export function probeTls(url: URL, transport?: {
  connect(options: Record<string, unknown>): unknown;
  secure(options: Record<string, unknown>): unknown;
}): Promise<{ tls: string }>;
