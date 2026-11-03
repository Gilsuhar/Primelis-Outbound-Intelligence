export const provisioningChecks: readonly (readonly [string, string])[];
export const provisioningAuditQuery: string;
export function failedProvisioningChecks(rows: unknown): string[];
