import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { fileURLToPath } from "node:url";

// Public root from Supabase's dashboard download URL, never from the DB handshake.
export const caPath = fileURLToPath(new URL("./supabase-prod-ca-2021.crt", import.meta.url));
const fingerprint = "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";
export function verifiedCa(read = readFileSync, now = Date.now()) {
  try {
    const pem = read(caPath);
    if ((pem.toString().match(/-----BEGIN CERTIFICATE-----/g) ?? []).length !== 1) throw new Error();
    const certificate = new X509Certificate(pem);
    if (!certificate.ca || certificate.fingerprint256 !== fingerprint ||
        !certificate.verify(certificate.publicKey) || now < Date.parse(certificate.validFrom) ||
        now >= Date.parse(certificate.validTo)) throw new Error();
    return pem;
  } catch { throw new Error("PREVIEW_SETUP_CA_REJECTED"); }
}

/** Only after setupPlan validates the original URL. Never changes the stored secret. */
export function prismaTlsUrl(value) {
  verifiedCa();
  const url = new URL(value);
  if (url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict" ||
      [...url.searchParams.keys()].sort().join(",") !== "sslaccept,sslmode")
    throw new Error("PREVIEW_SETUP_CONFIGURATION_REJECTED");
  url.searchParams.set("sslcert", caPath);
  return url.toString();
}
