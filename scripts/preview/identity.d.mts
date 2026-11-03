export const identityQuery: string;
export function sanitizedConditions(value: unknown): string[];
export function failedIdentityConditions(rows: unknown, expectedRole?: "postgres" | "recycler_preview_verify"): string[];
export function assertPreviewIdentity(rows: unknown): void;
