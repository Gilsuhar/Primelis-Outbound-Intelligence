import type { ClientResult } from "./provision-runtime-role.mjs";
export const approvedAuthUserId: string;
export const approvedEmail: string;
export function reviewedBindingSql(sql?: string, manifest?: { authUserId: string; email: string; sqlSha256: string }): string;
export function profileBindingPlan(env: Record<string, string | undefined>): { status: string; migrationCount: number };
export function bindingParameters(): string;
export function bindingResult(child: ClientResult, phase: string): { status: string; schema: string; privileges: string; backendTls: string };
export function bindProfile(env: Record<string, string | undefined>, execute: boolean, dependencies: {
  testing?: boolean;
  authorize(env: Record<string, string | undefined>): Promise<unknown>;
  probe(url: URL): Promise<unknown>;
  client(phase: string, sql?: string): Promise<ClientResult>;
}): Promise<Record<string, unknown>>;
