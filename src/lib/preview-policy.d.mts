export type PreviewOperation =
  | "hubspot-write"
  | "outreach-write"
  | "outreach-refresh"
  | "outreach-authorization"
  | "email-send"
  | "external-provider"
  | "ai-execution"
  | "worker"
  | "business-action"
  | "database-migration"
  | "database-write";
export function isPreviewRestricted(env?: Record<string, string | undefined>): boolean;
export function assertPreviewOperation(
  operation: PreviewOperation,
  env?: Record<string, string | undefined>,
): void;
export function previewApiDenied(env?: Record<string, string | undefined>): Response | null;
export function approvedPreviewIdentity(env?: Record<string, string | undefined>): string;
