export const clientImage: string;
export const clientVersion: string;
export function runtimeRolePlan(env: Record<string, string | undefined>): { status: string; migrationCount: number };
export function connectionFiles(url: string): { passfile: string; env: Record<string, string> };
export function dockerArguments(directory: string, name: string, settings: Record<string, string>, version?: boolean): string[];
export type ClientResult = { status: number | null; stdout: string; stderr?: string; error?: unknown; signal?: unknown; clientTls?: string };
export function checkedResult(child: ClientResult, phase: string): { status: string; schema: string; backendTls: string };
export function provisionRuntimeRole(env: Record<string, string | undefined>, execute: boolean, dependencies: {
  testing?: boolean;
  authorize(env: Record<string, string | undefined>): Promise<unknown>;
  probe(url: URL): Promise<unknown>;
  client(phase: string, sql?: string): Promise<ClientResult>;
}): Promise<Record<string, unknown>>;
