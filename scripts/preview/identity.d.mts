export const identityQuery: string;
export function sanitizedConditions(value: unknown): string[];
export function failedIdentityConditions(rows: unknown): string[];
export function assertPreviewIdentity(rows: unknown): void;
