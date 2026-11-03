export function verificationReport(error: unknown): { code: string; stage: string; category: string; failedConditions?: string[] };
export function verificationError(error: unknown, stage: string): Error & { stage: string; category: string; failedConditions?: string[] };
