export function diagnoseTls(mode: string, transport?: {
  connect(options: Record<string, unknown>): unknown;
  secure(options: Record<string, unknown>): unknown;
}): Promise<Record<string, string>>;
