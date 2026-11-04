import { spawn } from "node:child_process";
import { validateClientTlsReport, clientFailureCategory, clientGuardCode } from "./psql-tls-session.mjs";
import { bindingResult } from "./bind-profile.mjs";
import { activationAuditSql } from "./runtime-provisioning-sql.mjs";

export const activationMarkers = Object.freeze({ tls: "PREVIEW_ACTIVATION_TLS_END", preflight: "PREVIEW_ACTIVATION_PREFLIGHT_END",
  commit: "PREVIEW_ACTIVATION_COMMIT_GATE", done: "PREVIEW_ACTIVATION_COMMITTED" });
export const activationConditions = Object.freeze(["IDENTITY", "READ_ONLY", "ACTIVATION_TRANSACTION", "HISTORY", "TABLES", "RLS_API",
  "AUTH_IDENTITY", "EMPTY_DATA", "BINDING_PROFILE", "POLICIES", "BINDING_TRIGGERS", "ATTRIBUTES", "MEMBERSHIPS",
  "PROFILE_COLUMNS", "EFFECTIVE_ACCESS", "SCHEMA_BASELINE", "ACTIVATION_AUTHORITY"]);

// Fixed file input, not stdin: stdin is exclusively gate responses/password prompts.
// No TTY is allocated. PostgreSQL simple_prompt uses stdin/stderr when /dev/tty is absent.
export function activationScript() {
  return `\\conninfo
\\echo ${activationMarkers.tls}
\\prompt '' tls_release
\\if :tls_release
${activationAuditSql("preflight")}
\\echo ${activationMarkers.preflight}
\\prompt '' preflight_release
\\if :preflight_release
${activationAuditSql("before-password")}
SET LOCAL password_encryption='scram-sha-256';
\\password recycler_preview_app
ALTER ROLE recycler_preview_app LOGIN;
${activationAuditSql("before-commit")}
\\echo ${activationMarkers.commit}
\\prompt '' commit_release
\\if :commit_release
COMMIT;
\\echo ${activationMarkers.done}
\\else
ROLLBACK;
\\endif
\\endif
\\endif
`;
}

export function runActivationSession(args, settings, password, start = spawn) {
  return new Promise((resolve, reject) => {
    let child, timer, phase = "tls", stdout = "", stderr = "", prompt = "", before, ready;
    let done = false, passwordSent = false, commitReleased = false, committed = false;
    const stop = category => {
      if (done) return;
      done = true; clearTimeout(timer); child?.stdin.destroy(); child?.kill("SIGKILL");
      const raised = clientGuardCode(stderr);
      const condition = activationConditions.find(c => raised === "PREVIEW_ROLE_" + c);
      reject(Object.assign(new Error("PREVIEW_ACTIVATION_CLIENT_FAILED"), {
        category, passwordSent, commitReleased, phase: "APPLY", sqlReleased: phase !== "tls", ...(condition ? { condition } : {}),
      }));
    };
    const input = value => { try { child.stdin.write(value); } catch { stop("PROCESS_INPUT"); } };
    const frame = marker => {
      const token = `\n${marker}\n`, end = stdout.indexOf(token);
      if (end < 0) return undefined;
      if (end + token.length !== stdout.length) throw new Error();
      const value = stdout.slice(0, end); stdout = ""; return value;
    };
    try {
      if (typeof password !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(password) ||
          Buffer.from(password, "base64url").length !== 32 || Buffer.from(password, "base64url").toString("base64url") !== password)
        { stop("CREDENTIAL_FORMAT"); return; }
      child = start("/usr/bin/docker", args, { env: { PATH: "/usr/bin:/bin" }, shell: false, stdio: ["pipe", "pipe", "pipe"] });
      timer = setTimeout(() => stop("PROCESS_TIMEOUT"), 180000);
      child.on("error", () => stop("PROCESS_EXECUTION")); child.stdin.on("error", () => stop("PROCESS_INPUT"));
      child.stdout.on("data", bytes => {
        if (done) return;
        stdout += bytes.toString(); if (stdout.length > 2 * 1024 * 1024) { stop("OUTPUT_LIMIT"); return; }
        try {
          if (phase === "tls") {
            const value = frame(activationMarkers.tls); if (value === undefined) return;
            validateClientTlsReport(value, settings); if (stderr.trim()) throw new Error();
            phase = "preflight"; input("true\n");
          } else if (phase === "preflight") {
            const value = frame(activationMarkers.preflight); if (value === undefined) return;
            before = bindingResult({ status: 0, clientTls: "VERIFIED", stdout: value }, "APPLY");
            if (stderr.trim()) throw new Error();
            phase = "password1"; input("true\n");
          } else if (phase === "commit") {
            const value = frame(activationMarkers.commit); if (value === undefined) return;
            ready = bindingResult({ status: 0, clientTls: "VERIFIED", stdout: value }, "VERIFY");
            if (ready.schema !== before.schema || ready.privileges !== before.privileges) { stop("UNEXPECTED_CHANGE"); return; }
            if (prompt.trim()) throw new Error();
            phase = "finish"; commitReleased = true; child.stdin.end("true\n");
          } else if (phase === "finish") {
            if (stdout !== activationMarkers.done + "\n") {
              if ((activationMarkers.done + "\n").startsWith(stdout)) return;
              throw new Error();
            }
            stdout = ""; committed = true; phase = "closed";
          } else throw new Error();
        } catch (error) { stop(error?.category ?? "SQL_OUTPUT_PARSING"); }
      });
      child.stderr.on("data", bytes => {
        if (done) return;
        const data = bytes.toString(); stderr += data;
        if (stderr.length > 2 * 1024 * 1024) { stop("OUTPUT_LIMIT"); return; }
        if (phase === "password1" || phase === "password2") {
          prompt = (prompt + data).replace(/^[\r\n]+/, "");
          const expected = phase === "password1" ? 'Enter new password for user "recycler_preview_app": ' : "Enter it again: ";
          if (expected.startsWith(prompt) && prompt !== expected) return;
          if (prompt !== expected) { stop(clientFailureCategory(data)); return; }
          prompt = ""; phase = phase === "password1" ? "password2" : "commit";
          passwordSent = true; input(password + "\n");
        } else if (phase !== "tls" && phase !== "preflight" && data.trim()) stop(clientFailureCategory(data));
      });
      child.on("close", (status, signal) => {
        if (done) return;
        if (signal || status !== 0 || !committed || stdout || prompt.trim()) {
          stop(signal ? "PROCESS_SIGNAL" : stderr.trim() ? clientFailureCategory(stderr) : "PROCESS_INCOMPLETE"); return;
        }
        done = true; clearTimeout(timer);
        resolve({ before, ready, committed: true, clientTls: "VERIFIED" });
      });
    } catch { stop("PROCESS_EXECUTION"); }
  });
}
