/** Local operator diagnostics only. Importing this module never opens a connection. */
import { randomUUID } from "node:crypto";

export const runtimeStages = [
  "CREDENTIAL_INPUT",
  "REPOSITORY_PREFLIGHT",
  "DATABASE_PREFLIGHT",
  "CREDENTIAL_PREPARATION",
  "GITHUB_SECRET_UPLOAD",
  "GITHUB_SECRET_VERIFICATION",
  "PRE_ACTIVATION_RECHECK",
  "ACTIVATION_TRANSPORT",
  "TRANSACTION_BEGIN",
  "SQL_EXECUTION",
  "TRANSACTION_COMMIT",
  "RESTRICTED_CONNECTIVITY",
  "RESTRICTED_IDENTITY_VERIFICATION",
  "RUNTIME_PERMISSION_CHECK",
  "POST_ACTIVATION_VERIFICATION",
  "RESTRICTED_DISCONNECT",
  "SAFETY_RELOCK",
] as const;
export type RuntimeStage = (typeof runtimeStages)[number];
type Reason =
  | "POSTGRES_ERROR"
  | "STAGE_FAILED"
  | "PROCESS_FAILED"
  | "OUTPUT_LIMIT"
  | "DIAGNOSTIC_PROTOCOL_FAILED"
  | "AUDIT_LIMIT";
type Entry = {
  stage: RuntimeStage;
  outcome: "PASSED" | "FAILED";
  reason?: Reason;
  sqlstate?: string;
};

// VERBOSITY=sqlstate only. Never retain arbitrary server messages, DETAIL,
// CONTEXT, parameters, URLs, error causes, stacks, or Prisma error metadata.
export function psqlErrorCode(stderr: string): string | undefined {
  const match = stderr.match(
    /(?:^|\n)(?:psql:[^\r\n]*?:\d+:\s*)?(?:ERROR|FATAL):[ \t]+([0-9A-Z]{5})[ \t]*(?:\r?\n|$)/,
  );
  return match && match[1] !== "00000" ? match[1] : undefined;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  // Read only the expected scalar fields, not nested raw database diagnostics.
  const value = error as { code?: unknown; message?: unknown };
  const code =
    typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code) &&
      !/^P[1-9]\d{3}$/.test(value.code) // Prisma P1001/P2010 etc. are not SQLSTATE.
      ? value.code
      : typeof value.message === "string"
        ? /^CI_RUNTIME_SQLSTATE_([0-9A-Z]{5})$/.exec(value.message)?.[1]
        : undefined;
  return code !== "00000" ? code : undefined;
}

class SanitizedRuntimeFailure extends Error {
  constructor(readonly stage: RuntimeStage, readonly reason: Reason, readonly sqlstate?: string) {
    super(`CI_RUNTIME_${stage}_${reason}${sqlstate ? `_${sqlstate}` : ""}`);
    this.name = "SanitizedRuntimeFailure";
  }
}

export class RuntimeDiagnostics {
  private entries: Entry[] = [];
  private firstFailure?: Entry;

  snapshot() {
    return {
      entries: this.entries.map((entry) => ({ ...entry })),
      ...(this.firstFailure ? { failure: { ...this.firstFailure } } : {}),
    };
  }

  private append(entry: Entry) {
    if (!runtimeStages.includes(entry.stage)) throw new Error("CI_RUNTIME_STAGE_DENIED");
    if (this.entries.length >= 32)
      throw new SanitizedRuntimeFailure(entry.stage, "AUDIT_LIMIT");
    this.entries.push(entry);
    if (entry.outcome === "FAILED" && !this.firstFailure) this.firstFailure = entry;
  }

  passed(stage: RuntimeStage) {
    this.append({ stage, outcome: "PASSED" });
  }

  fail(stage: RuntimeStage, error?: unknown, reason: Reason = "STAGE_FAILED"): never {
    const sqlstate = errorCode(error);
    const safeReason = sqlstate ? "POSTGRES_ERROR" : reason;
    this.append({ stage, outcome: "FAILED", reason: safeReason, ...(sqlstate ? { sqlstate } : {}) });
    throw new SanitizedRuntimeFailure(stage, safeReason, sqlstate);
  }

  sync<T>(stage: RuntimeStage, operation: () => T): T {
    try {
      const result = operation();
      this.passed(stage);
      return result;
    } catch (error) {
      return this.fail(stage, error);
    }
  }

  async run<T>(stage: RuntimeStage, operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation();
      this.passed(stage);
      return result;
    } catch (error) {
      return this.fail(stage, error);
    }
  }
}

type ProcessResult = {
  status: number | null;
  error?: unknown;
  stdout: string;
  stderr: string;
};

/**
 * Keep the existing single psql process, BEGIN/ALTER/COMMIT, ON_ERROR_STOP,
 * verify-full transport and SQL unchanged. Random echo acknowledgements label
 * the next operation only after the preceding statement succeeds.
 *
 * execute and verifyTransport are the existing guarded local helper operations.
 * No subprocess, credential preparation, retry or recovery is performed here.
 */
export function diagnoseActivationTransaction(input: {
  audit: RuntimeDiagnostics;
  statement: string;
  execute: (script: string) => ProcessResult;
  verifyTransport: (stdout: string) => void;
}): void {
  const { audit } = input;
  const prefix = `CI_RUNTIME_ACK_${randomUUID().replaceAll("-", "")}_`;
  const labels = ["BEGIN", "STATEMENT", "COMMIT", "DONE"] as const;
  const stages: RuntimeStage[] = ["TRANSACTION_BEGIN", "SQL_EXECUTION", "TRANSACTION_COMMIT"];
  const script = [
    `\\echo ${prefix}BEGIN`,
    "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s';",
    `\\echo ${prefix}STATEMENT`,
    input.statement,
    `\\echo ${prefix}COMMIT`,
    "COMMIT;",
    `\\echo ${prefix}DONE`,
    "",
  ].join("\n");
  let result: ProcessResult;
  try {
    result = input.execute(script);
  } catch (error) {
    return audit.fail("ACTIVATION_TRANSPORT", error, "PROCESS_FAILED");
  }
  if (result.stdout.length > 524288 || result.stderr.length > 524288)
    return audit.fail("ACTIVATION_TRANSPORT", undefined, "OUTPUT_LIMIT");
  // Verify the same connection identity even when psql later returns an error.
  try {
    input.verifyTransport(result.stdout);
  } catch {
    return audit.fail(
      "ACTIVATION_TRANSPORT",
      { code: psqlErrorCode(result.stderr) },
    );
  }
  audit.passed("ACTIVATION_TRANSPORT");
  const observed = result.stdout.replace(/\r\n/g, "\n").split("\n")
    .filter((line) => line.startsWith(prefix));
  if (!observed.length || observed.some((line, i) => line !== prefix + labels[i]))
    return audit.fail("TRANSACTION_BEGIN", undefined, "DIAGNOSTIC_PROTOCOL_FAILED");
  for (let i = 0; i < Math.min(observed.length - 1, 2); i++) audit.passed(stages[i]);
  const current = stages[Math.min(observed.length - 1, 2)];
  if (result.status !== 0 || result.error || psqlErrorCode(result.stderr))
    return audit.fail(current, { code: psqlErrorCode(result.stderr) }, "PROCESS_FAILED");
  if (observed.length !== labels.length)
    return audit.fail(current, undefined, "DIAGNOSTIC_PROTOCOL_FAILED");
  audit.passed("TRANSACTION_COMMIT");
}
