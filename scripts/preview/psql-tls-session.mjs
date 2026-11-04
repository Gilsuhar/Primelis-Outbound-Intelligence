import { spawn } from "node:child_process";
import { isIP } from "node:net";

const marker = "PREVIEW_CLIENT_TLS_CHECK_END";
const failure = () => new Error("PREVIEW_ROLE_CLIENT_TLS_EVIDENCE");

// PostgreSQL 17 \conninfo reads PQsslInUse/PQsslAttribute from this libpq connection.
// Raw output includes connection identity and must never be logged or returned.
export function validateClientTlsReport(report, settings) {
  if (settings.PGHOST !== "aws-1-us-west-2.pooler.supabase.com" || settings.PGPORT !== "5432" ||
      settings.PGDATABASE !== "postgres" || settings.PGUSER !== "postgres.txfxfrlhtvzwgluhnbpw" ||
      settings.PGSSLMODE !== "verify-full" || settings.PGSSLROOTCERT !== "/run/preview/ca.crt" ||
      settings.PGSSLMINPROTOCOLVERSION !== "TLSv1.2" || settings.PGGSSENCMODE !== "disable") throw failure();
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
    const stop = () => {
      if (done) return;
      done = true; clearTimeout(timer);
      child?.stdin.destroy(); child?.kill("SIGKILL");
      reject(failure()); // Caller always removes the named container, including on timeout.
    };
    try {
      child = start("/usr/bin/docker", args, { env: { PATH: "/usr/bin:/bin" }, shell: false, stdio: ["pipe", "pipe", "pipe"] });
      timer = setTimeout(stop, 180000);
      child.on("error", stop); child.stdin.on("error", stop);
      child.stdout.on("data", bytes => {
        if (done) return;
        if (released) { stdout += bytes.toString(); if (stdout.length > 2 * 1024 * 1024) stop(); return; }
        evidence += bytes.toString();
        if (evidence.length > 16384) { stop(); return; }
        const end = evidence.indexOf(`\n${marker}\n`);
        if (end < 0) return;
        try {
          if (end + marker.length + 2 !== evidence.length) throw failure();
          validateClientTlsReport(evidence.slice(0, end), settings);
          evidence = ""; released = true;
          child.stdin.end(sql);
        } catch { stop(); }
      });
      child.stderr.on("data", bytes => { stderr += bytes.toString(); if (stderr.length > 2 * 1024 * 1024) stop(); });
      child.on("close", (status, signal) => {
        if (done) return;
        if (!released) { stop(); return; }
        done = true; clearTimeout(timer);
        resolve({ status, signal, stdout, stderr, clientTls: "VERIFIED" });
      });
      child.stdin.write(`\\conninfo\n\\echo ${marker}\n`);
    } catch { stop(); }
  });
}
