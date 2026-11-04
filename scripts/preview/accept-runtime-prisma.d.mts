import type { ClientResult } from "./provision-runtime-role.mjs";
export function runtimeChildEnvironment(env: Record<string, string | undefined>): Record<string, string>;
export function acceptancePlan(env: Record<string, string | undefined>): { status: string; migrationCount: number };
export function runtimeResult(child: ClientResult): Record<string, unknown>;
export function acceptRuntimePrisma(env: Record<string, string | undefined>, execute: boolean, deps: {
  testing?: boolean;
  authorize(env: Record<string, string | undefined>): Promise<unknown>;
  probe(url: URL): Promise<unknown>;
  client(phase: string, sql?: string): Promise<ClientResult>;
  runtime(env: Record<string, string>): Promise<ClientResult> | ClientResult;
}): Promise<Record<string, unknown>>;
