export function scanText(text: string): Array<{ rule: string; line: number }>;
export function scanHistory(revision?: string): { commitCount: number; objectCount: number; findings: Array<{ oid: string; path: string; type: string; rule: string; line: number }> };
