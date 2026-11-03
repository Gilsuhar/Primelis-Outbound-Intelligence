import "server-only";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  localDevelopmentConfig,
  localDevelopmentHost,
  localDevelopmentUser,
} from "@/lib/auth/local-development";
import { observedProspectSchema } from "@/features/sales-agent/observed-prospect-review";

/** Caller authenticates normally first. Fixed ignored file; no upload or database mutation. */
export async function loadLocalProspectReview(userId: string, host: string | null) {
  if (
    userId !== localDevelopmentUser.id ||
    !localDevelopmentHost(host) ||
    !localDevelopmentConfig()
  )
    return null;
  try {
    const path = join(process.cwd(), "outputs", "product-demonstration", "prospect-review.json");
    if ((await stat(path)).size > 32_768) return null;
    const raw = await readFile(path, "utf8");
    if (Buffer.byteLength(raw) > 32_768) return null;
    const result = observedProspectSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    // Do not log raw private evidence or parsing diagnostics.
    return null;
  }
}
