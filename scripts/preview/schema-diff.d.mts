export function readOnlyUrl(value: string): string;
export function classifyDiff(result: {status: number | null; signal?: unknown; error?: unknown; stderr?: unknown}): void;
export function runSchemaDiff(url: string, run?: (command: string, args: string[], options: {
  cwd: string; env: Record<string,string | undefined>; shell: boolean; stdio: string[];
  encoding: string; timeout: number; maxBuffer: number;
}) => {status: number | null; signal?: unknown; error?: unknown; stderr?: unknown}, env?: Record<string,string | undefined>): Promise<void>;
