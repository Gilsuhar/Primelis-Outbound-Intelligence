import { spawn } from "node:child_process";
import { isIP } from "node:net";

const marker = "PREVIEW_CLIENT_TLS_CHECK_END";
const failure = (category = "TLS_OUTPUT_PARSING", sqlReleased = false) =>
  Object.assign(new Error("PREVIEW_ROLE_CLIENT_TLS_EVIDENCE"), { category, sqlReleased });

// Classify private C-locale libpq/psql output; never return matched text or identifiers.
export function clientFailureCategory(stderr = "") {
  if (/server certificate.*does not match host name|hostname mismatch/i.test(stderr)) return "TLS_HOSTNAME";
  if (/certificate verify failed|certificate validation failed|self.signed certificate|unable to get.*issuer|root certificate file|certificate has expired/i.test(stderr)) return "TLS_CERTIFICATE";
  if (/could not translate host name|name or service not known|temporary failure in name resolution/i.test(stderr)) return "CONNECTION_DNS";
  if (/timeout expired|connection timed out/i.test(stderr)) return "CONNECTION_TIMEOUT";
  if (/connection refused|network is unreachable|no route to host/i.test(stderr)) return "CONNECTION_TCP";
  if (/password authentication failed|no password supplied/i.test(stderr)) return "CONNECTION_AUTHENTICATION";
  if (/SSL error|TLS handshake|server does not support SSL/i.test(stderr)) return "TLS_HANDSHAKE";
  const state = /\b(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/.exec(stderr)?.[1];
  return ({ "42809": "SQL_WRONG_OBJECT_TYPE", "42501": "SQL_PERMISSION", "25006": "SQL_READ_ONLY",
    "42601": "SQL_SYNTAX", "P0001": "SQL_GUARD_REJECTED", "08006": "CONNECTION_LOST" })[state] ?? "CLIENT_EXIT";
}

// Final log boundary: never serialize arbitrary Error properties or child output.
export function clientDiagnostic(error) {
  const allowed = new Set(["TLS_OUTPUT_PARSING", "TLS_CONFIGURATION", "TLS_EVIDENCE_MISSING", "TLS_HOSTNAME",
    "TLS_CERTIFICATE", "CONNECTION_DNS", "CONNECTION_TIMEOUT", "CONNECTION_TCP", "CONNECTION_AUTHENTICATION",
    "TLS_HANDSHAKE", "SQL_WRONG_OBJECT_TYPE", "SQL_PERMISSION", "SQL_READ_ONLY", "SQL_SYNTAX",
    "SQL_GUARD_REJECTED", "CONNECTION_LOST", "CLIENT_EXIT", "PROCESS_EXECUTION", "PROCESS_INPUT",
    "PROCESS_SIGNAL", "PROCESS_TIMEOUT", "OUTPUT_LIMIT", "SQL_OUTPUT_PARSING"]);
  return { category: allowed.has(error?.category) ? error.category : "UNCLASSIFIED",
    phase: ["APPLY", "VERIFY"].includes(error?.phase) ? error.phase : "BEFORE_SQL",
    sqlReleased: typeof error?.sqlReleased === "boolean" ? error.sqlReleased : "UNKNOWN" };
}

// PostgreSQL 17 \conninfo reads PQsslInUse/PQsslAttribute from this libpq connection.
// Raw output includes connection identity and must never be logged or returned.
export function validateClientTlsReport(report, settings) {
  if (settings.PGHOST !== "aws-1-us-west-2.pooler.supabase.com" || settings.PGPORT !== "5432" ||
      settings.PGDATABASE !== "postgres" || settings.PGUSER !== "postgres.txfxfrlhtvzwgluhnbpw" ||
      settings.PGSSLMODE !== "verify-full" || settings.PGSSLROOTCERT !== "/run/preview/ca.crt" ||
      settings.PGSSLMINPROTOCOLVERSION !== "TLSv1.2" || settings.PGGSSENCMODE !== "disable") throw failure("TLS_CONFIGURATION");
  const lines = report.trim().split(/\r?\n/);
  if (lines.length !== 2) throw failure();
  const connection = /^You are connected to database "([^"]+)" as user "([^"]+)" on host "([^"]+)"(?: \(address "([^"]+)"\))? at port "([^"]+)"\.$/.exec(lines[0]);
  if (!connection || connection[1] !== settings.PGDATABASE || connection[2] !== settings.PGUSER ||
      connection[3] !== settings.PGHOST || connection[5] !== settings.PGPORT ||
      (connection[4] && !isIP(connection[4]))) throw failure();
  if (!/^SSL connection \(protocol: TLSv1\.[23], cipher: (?!unknown\b)[A-Za-z0-9_-]+, compression: off, ALPN: (?:none|postgresql)\)$/.test(lines[1])) throw failure();
  return "VERIFIED";
}

// Feed ONLY local psql meta-commands until live client evidence passes. Then release
// fixed reviewed SQL on the very same connection; no reconnect or second psql process.
export function runTlsSession(args, settings, sql, start = spawn) {
  return new Promise((resolve, reject) => {
    let child, timer, evidence = "", stdout = "", stderr = "", released = false, done = false;
    const stop = (category = "TLS_OUTPUT_PARSING") => {
      if (done) return;
      done = true; clearTimeout(timer);
      child?.stdin.destroy(); child?.kill("SIGKILL");
      reject(failure(category, released)); // Caller always removes the named container, including on timeout.
    };
    try {
      child = start("/usr/bin/docker", args, { env: { PATH: "/usr/bin:/bin" }, shell: false, stdio: ["pipe", "pipe", "pipe"] });
      timer = setTimeout(() => stop("PROCESS_TIMEOUT"), 180000);
      child.on("error", () => stop("PROCESS_EXECUTION")); child.stdin.on("error", () => stop("PROCESS_INPUT"));
      child.stdout.on("data", bytes => {
        if (done) return;
        if (released) { stdout += bytes.toString(); if (stdout.length > 2 * 1024 * 1024) stop("OUTPUT_LIMIT"); return; }
        evidence += bytes.toString();
        if (evidence.length > 16384) { stop("OUTPUT_LIMIT"); return; }
        const end = evidence.indexOf(`\n${marker}\n`);
        if (end < 0) return;
        try {
          if (end + marker.length + 2 !== evidence.length) throw failure();
          validateClientTlsReport(evidence.slice(0, end), settings);
          evidence = ""; released = true;
          child.stdin.end(sql);
        } catch (error) { stop(error?.category ?? "PROCESS_INPUT"); }
      });
      child.stderr.on("data", bytes => { stderr += bytes.toString(); if (stderr.length > 2 * 1024 * 1024) stop("OUTPUT_LIMIT"); });
      child.on("close", (status, signal) => {
        if (done) return;
        if (!released) { stop(signal ? "PROCESS_SIGNAL" : stderr ? clientFailureCategory(stderr) : "TLS_EVIDENCE_MISSING"); return; }
        done = true; clearTimeout(timer);
        resolve({ status, signal, stdout, stderr, clientTls: "VERIFIED" });
      });
      child.stdin.write(`\\conninfo\n\\echo ${marker}\n`);
    } catch { stop("PROCESS_EXECUTION"); }
  });
}
