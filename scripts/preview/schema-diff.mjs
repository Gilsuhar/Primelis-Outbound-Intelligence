import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { caPath, verifiedCa } from "./tls-trust.mjs";
import { verificationUrl, withReadOnlyContext } from "./read-only-context.mjs";
import { verificationError } from "./verification-errors.mjs";
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
export async function runSchemaDiff(url, run = spawnSync, env = process.env, connect = async value => {
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient({ datasources: { db: { url: value } }, log: [] });
}) {
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
    ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP"].includes(key)));
  const databaseUrl = verificationUrl(url);
  // This fresh connection independently checks the server's login defaults and effective ACLs.
  // It does NOT pretend to be the CLI connection. The CLI must use exactly the same restricted
  // login, whose server-side default applies at every login and whose ACLs deny table/schema writes.
  let db;
  let failure;
  try { db = await connect(databaseUrl); } catch (error) { throw verificationError(error, "SCHEMA_DIFF"); }
  try {
    return await withReadOnlyContext(db, async () => {
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
    });
  } catch (error) { failure = error; throw error; } finally {
    try { await db.$disconnect(); } catch {
      if (!failure) throw verificationError(new Error("PREVIEW_SETUP_DIFF_PROCESS_FAILED"), "SCHEMA_DIFF");
    }
  }
}
