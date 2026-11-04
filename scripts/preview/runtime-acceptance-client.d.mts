import type { verifyRuntimePrisma } from "./verify-runtime-prisma.mjs";
export function applicationRuntimeBindings(env: Record<string, string | undefined>): NodeJS.ProcessEnv;
export function runRuntimeClient(env: Record<string, string | undefined>, deps: {
  url(bindings: NodeJS.ProcessEnv): string | undefined;
  version: string;
  connect(url: string | undefined): Parameters<typeof verifyRuntimePrisma>[0] & { $disconnect(): Promise<void> };
}): ReturnType<typeof verifyRuntimePrisma>;
