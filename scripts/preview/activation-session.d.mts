import type { spawn } from "node:child_process";
export const activationMarkers: Readonly<{ tls: string; preflight: string; commit: string; done: string }>;
export const activationConditions: readonly string[];
export function activationScript(): string;
export type ActivationEvidence = { schema: string; privileges: string; backendTls: string };
export type ActivationResult = { before: ActivationEvidence; ready: ActivationEvidence; committed: true; clientTls: "VERIFIED" };
export function runActivationSession(args: string[], settings: Record<string, string>, password: string, start?: typeof spawn): Promise<ActivationResult>;
