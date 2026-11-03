import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { caPath, verifiedCa } from "./tls-trust.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));

/** Applied only to an already validated, pinned-CA URL; no caller-selected startup options. */
export function readOnlyUrl(value) {
  verifiedCa();
  const url = new URL(value);
  if (url.searchParams.get("sslcert") !== caPath || url.searchParams.get("sslmode") !== "require" ||
      url.searchParams.get("sslaccept") !== "strict" ||
      [...url.searchParams.keys()].sort().join(",") !== "sslaccept,sslcert,sslmode")
    throw new Error("PREVIEW_SETUP_CONFIGURATION_REJECTED");
  url.searchParams.set("options", "-c default_transaction_read_only=on");
  return url.toString();
}

export function classifyDiff(result) {
  const failure = (code, category) => { throw Object.assign(new Error(`PREVIEW_SETUP_${code}`), { stage: "SCHEMA_DIFF", category }); };
  if (result.error?.code === "ETIMEDOUT") failure("DIFF_TIMEOUT", "TIMEOUT");
  if (result.error || result.signal || !Number.isInteger(result.status)) failure("DIFF_PROCESS_FAILED", "PROCESS_ERROR");
  if (result.status === 0) return;
  if (result.status === 2) failure("SCHEMA_DRIFT", "SCHEMA_DRIFT");
  // Never return stderr, stdout, URL, credentials, paths or raw exception messages.
  const code = /(?:^|\n)\s*Error:\s*(P\d{4})\b/.exec(String(result.stderr ?? ""))?.[1];
  const known = { P1000: "AUTHENTICATION", P1001: "CONNECTIVITY", P1002: "TIMEOUT", P1010: "PERMISSION",
    P1011: "TLS", P1012: "CONFIGURATION", P1013: "CONFIGURATION", P1017: "CONNECTIVITY" };
  failure("DIFF_COMMAND_FAILED", Object.hasOwn(known, code) ? known[code] : "COMMAND_ERROR");
}

/** Read-only DB -> reviewed model comparison, never migrations/shadow DB/script execution. */
export async function runSchemaDiff(url, run = spawnSync, env = process.env) {
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
    ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP"].includes(key)));
  const databaseUrl = readOnlyUrl(url);
  let result;
  try {
    result = run(process.execPath, [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "diff",
      "--from-schema-datasource", resolve(root, "prisma/schema.prisma"),
      "--to-schema-datamodel", resolve(root, "prisma/schema.prisma"), "--exit-code"], {
      cwd: root, env: { ...childEnv, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, CHECKPOINT_DISABLE: "1" },
      shell: false, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024,
    });
  } catch { result = { status: null, error: {} }; }
  classifyDiff(result);
}
