export const repository: string;
export const repositoryId: string;
export const owner: string;
export const ownerId: string;
export const tagPrefix: string;
export const environment: string;
export const workflow: string;
export function validateGitHubContext(env: Record<string, string | undefined>): void;
export function verifyGitHubApproval(env: Record<string, string | undefined>, request?: (input: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>): Promise<void>;
