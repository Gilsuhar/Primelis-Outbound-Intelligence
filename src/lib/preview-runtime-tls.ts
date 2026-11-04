import "server-only";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { resolve } from "node:path";
import { configuredDatabaseUrl } from "./preview-isolation";
import { isPreviewRestricted } from "./preview-policy.mjs";

/** Runtime trust uses the same reviewed public CA as the administrative audit.
 * No operator-supplied CA path, administrator fallback or certificate download. */
export function runtimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = configuredDatabaseUrl(env);
  if (!isPreviewRestricted(env)) return value;
  try {
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error();
    const caPath = resolve(process.cwd(), "scripts/preview/supabase-prod-ca-2021.crt");
    const pem = readFileSync(caPath);
    const cert = new X509Certificate(pem);
    if ((pem.toString().match(/-----BEGIN CERTIFICATE-----/g) ?? []).length !== 1 ||
        !cert.ca || !cert.verify(cert.publicKey) ||
        cert.fingerprint256 !== "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA" ||
        Date.now() < Date.parse(cert.validFrom) || Date.now() >= Date.parse(cert.validTo)) throw new Error();
    const url = new URL(value!);
    url.searchParams.set("sslcert", caPath);
    return url.toString();
  } catch {
    throw new Error("PREVIEW_DATABASE_TLS_REQUIRED");
  }
}
