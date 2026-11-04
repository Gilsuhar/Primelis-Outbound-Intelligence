import type { ClientResult } from "./provision-runtime-role.mjs";
import type { ActivationResult } from "./activation-session.mjs";
export const credentialAttestation: string;
export function runtimeCredential(env: Record<string, string | undefined>): string;
export function activationPlan(env: Record<string, string | undefined>): { status: string; migrationCount: number };
export function activationDiagnostic(error: unknown, attempted: boolean, completed: boolean): Record<string, unknown>;
export function activateRuntimeLogin(env: Record<string, string | undefined>, execute: boolean, deps: {
  testing?: boolean;
  authorize(env: Record<string, string | undefined>): Promise<unknown>;
  probe(url: URL): Promise<unknown>;
  client(phase: string, sql?: string): Promise<ClientResult>;
  activate(password: string): Promise<ActivationResult>;
}): Promise<Record<string, unknown>>;
