import { z } from "zod";

const commit = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .nullable();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const buildSchema = z.object({
  schema: z.literal(1),
  gitCommit: commit,
  checkoutCommit: commit,
  sourceFingerprint: hash,
  sources: z.object({
    "src/app/api/sales-agent/dashboard/route.ts": hash,
    "src/server/agent-workforce/dashboard/service.ts": hash,
    "src/features/agent-workforce/dashboard/dashboard-client.tsx": hash,
    "src/features/agent-workforce/dashboard/integration-controls.tsx": hash,
  }),
});

/** Next config inlines this allowlisted, non-secret value into both bundles. */
export function getWorkforceBuildInfo() {
  try {
    const value = JSON.parse(process.env.NEXT_PUBLIC_WORKFORCE_BUILD_INFO ?? "null");
    const parsed = buildSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
