/** Inert until explicitly called after fresh control-plane checks and phase approval. */
import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { checksum, fail, NEON_CI_TARGET } from "./policy";
import { PHASE02_EXECUTION_APPROVAL, requirePhase02Approval } from "./phase02-approval";

export const reviewedSqlHashes = {
  "target-guard.sql": "a3e5504be9b6b115c388c4c8cc0b4161011bca4380bb79ff59edcf443739b280",
  "00-create-database.sql": "e6428bcb06498f3d2e44d645c57d1f01f8c6595916f3e49cce59efb8b934cbdf",
  "01-schema-role.sql": "66a05f9beac7a3740332ecea1488a8040c005c04724351a897cf031daf1e2f9c",
  "02-identity-marker.sql": "09dcc334580a39e9c957128c07017172c1d6d4ae6e288b6d6cd7ab2fd2950127",
} as const;

export function requirePsqlTlsInfo(text: string, database: string) {
  const identity = `You are connected to database "${database}" as user "neondb_owner" on host "${NEON_CI_TARGET.host}"`;
  if (
    !["neondb", NEON_CI_TARGET.name].includes(database) ||
    !text.startsWith(identity) ||
    !/ at port "5432"\.\r?\n/.test(text) ||
    !/^SSL connection \(protocol: TLSv1\.[23], cipher: [A-Z0-9_-]+, compression: off(?:, ALPN: postgresql)?\)\r?$/m.test(
      text,
    )
  )
    fail("CI_INITIALIZATION_TLS_UNVERIFIED");
}

type Initialization = {
  phase: "00" | "01" | "02";
  psqlPath: string;
  caPath: string;
  password: string;
  verifiedOrganization: string;
  verifiedProject: string;
  verifiedBranch: string;
  executionApproval: string;
  // Exact final file bytes and independently reviewed digest, never the candidate.
  approvalRaw?: string;
  approvalSha256?: string;
};

export async function initializeReviewedPhase(input: Initialization) {
  if (
    !["00", "01", "02"].includes(input.phase) ||
    input.verifiedOrganization !== NEON_CI_TARGET.organizationId ||
    input.verifiedProject !== NEON_CI_TARGET.projectId ||
    input.verifiedBranch !== NEON_CI_TARGET.branchId ||
    input.executionApproval !==
      (input.phase === "02" ? PHASE02_EXECUTION_APPROVAL : "INITIALIZE_SNOWY_ART_PILOT") ||
    !input.password ||
    !isAbsolute(input.psqlPath) ||
    !isAbsolute(input.caPath) ||
    !statSync(input.psqlPath).isFile() ||
    !statSync(input.caPath).isFile()
  )
    fail("CI_INITIALIZATION_INPUT_DENIED");
  const approvalHash =
    input.phase === "02"
      ? requirePhase02Approval(input.approvalRaw ?? "", input.approvalSha256 ?? "")
      : undefined;
  const directory = resolve("ci/company-acceptance/sql");
  for (const [file, hash] of Object.entries(reviewedSqlHashes)) {
    // Hash the original bytes, including reviewed line endings; never repair drift.
    if (checksum(readFileSync(resolve(directory, file), "utf8")) !== hash)
      fail("CI_INITIALIZATION_SQL_CHANGED");
  }
  const file = {
    "00": "00-create-database.sql",
    "01": "01-schema-role.sql",
    "02": "02-identity-marker.sql",
  }[input.phase];
  const database = input.phase === "00" ? "neondb" : NEON_CI_TARGET.name;
  // No URI, service file, rc file, inherited PG options, or caller-supplied SQL.
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const key of ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP"])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    PGHOST: NEON_CI_TARGET.host,
    PGPORT: "5432",
    PGDATABASE: database,
    PGUSER: "neondb_owner",
    PGPASSWORD: input.password,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: input.caPath,
    PGGSSENCMODE: "disable",
    PGSSLMINPROTOCOLVERSION: "TLSv1.2",
    PGCONNECT_TIMEOUT: "15",
    PGAPPNAME: "agentworkforce-approved-initialization",
    LC_ALL: "C",
    LANG: "C",
  });
  const args = ["-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"];
  for (const [key, value] of Object.entries({
    verified_org: input.verifiedOrganization,
    verified_project: input.verifiedProject,
    verified_branch: input.verifiedBranch,
    // Shared SQL guard stays byte-identical. The phase-specific approval was
    // already checked above, before spawning or passing this internal handoff.
    execution_approval: "INITIALIZE_SNOWY_ART_PILOT",
  }))
    args.push("-v", `${key}=${value}`);
  if (approvalHash) args.push("-v", `approval_sha256=${approvalHash}`);

  return new Promise<{ phase: string; clientTls: "VERIFIED" }>((accept, reject) => {
    const child = spawn(input.psqlPath, args, {
      env,
      cwd: directory,
      windowsHide: true,
      stdio: "pipe",
    });
    const marker = "CI_TLS_BOUNDARY_" + randomUUID();
    let output = "",
      errors = "",
      sent = false,
      settled = false;
    const stop = (code: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(new Error(code));
    };
    const timer = setTimeout(() => stop("CI_INITIALIZATION_TIMEOUT"), 90000);
    child.on("error", () => stop("CI_INITIALIZATION_PROCESS_FAILED"));
    child.stdin.on("error", () => stop("CI_INITIALIZATION_PROCESS_FAILED"));
    child.stderr.on("data", (chunk: Buffer) => {
      errors += chunk.toString();
      if (errors.length > 65536) stop("CI_INITIALIZATION_OUTPUT_LIMIT");
    });
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 65536) return stop("CI_INITIALIZATION_OUTPUT_LIMIT");
      const normalized = output.replace(/\r\n/g, "\n");
      if (!sent && normalized.includes(marker + "\n")) {
        try {
          requirePsqlTlsInfo(normalized.slice(0, normalized.indexOf(marker)), database);
          if (input.phase === "02")
            requirePhase02Approval(input.approvalRaw ?? "", approvalHash ?? "");
          // Same live psql process/connection; no reconnect or separate probe.
          sent = true;
          child.stdin.end(
            `\\set ci_client_tls_verified PSQL_VERIFY_FULL_SAME_SESSION\n\\i ${file}\n`,
          );
        } catch (error) {
          stop(
            error instanceof Error && /^CI_PHASE02_[A-Z_]+$/.test(error.message)
              ? error.message
              : "CI_INITIALIZATION_TLS_UNVERIFIED",
          );
        }
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0 || !sent) {
        const sqlstate = errors.match(/ERROR:\s+([0-9A-Z]{5})(?:\s|$)/)?.[1];
        return stop(
          sqlstate ? `CI_INITIALIZATION_SQLSTATE_${sqlstate}` : "CI_INITIALIZATION_FAILED",
        );
      }
      settled = true;
      clearTimeout(timer);
      accept({ phase: input.phase, clientTls: "VERIFIED" });
    });
    child.stdin.write(`\\conninfo\n\\echo ${marker}\n`);
  });
}
