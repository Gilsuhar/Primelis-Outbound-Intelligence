/** Offline subprocess regression. File storage is NOT PostgreSQL verification. */
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmdirSync } from "node:fs";
import { replaceFixtureCheckpoint } from "./replace-fixture-checkpoint";
import { join, resolve } from "node:path";
import { initialQueue, parseQueue } from "../server/agent-workforce/company-queue/contracts";
import type { QueueStore } from "../server/agent-workforce/company-queue/store";
import {
  runAcceptance,
  auditSchema,
  qualityReport,
  type AuditStore,
} from "../../ci/company-acceptance/acceptance";
import { fictionalApproval } from "../../ci/company-acceptance/test-support";
import { blockProviderNetwork } from "../../ci/company-acceptance/network";
const directory = resolve(process.argv[2]),
  runId = process.argv[3];
if (!directory.includes("company-ci-offline-") || !/^\d+$/.test(runId))
  throw new Error("OFFLINE_ARGUMENTS");
const attempts = blockProviderNetwork();
const queueFile = join(directory, "queue.json"),
  auditFile = join(directory, "audit.json");
const save = async (file: string, data: unknown) => {
  writeFileSync(file + ".next", JSON.stringify(data), { flush: true });
  await replaceFixtureCheckpoint(file + ".next", file);
};
const owner = (actor: string) => {
  if (actor !== fictionalApproval.actor) throw new Error("CI_ACTOR_DENIED");
};
const store: QueueStore = {
  read: async (actor) => {
    owner(actor);
    return existsSync(queueFile)
      ? parseQueue(JSON.parse(readFileSync(queueFile, "utf8")))
      : initialQueue();
  },
  change: async (actor, mutate) => {
    owner(actor);
    mkdirSync(join(directory, "lock"));
    try {
      const state = await store.read(actor),
        result = mutate(state);
      await save(queueFile, parseQueue(state));
      return structuredClone(result);
    } finally {
      rmdirSync(join(directory, "lock"));
    }
  },
};
const audit: AuditStore = {
  read: async () =>
    existsSync(auditFile) ? auditSchema.parse(JSON.parse(readFileSync(auditFile, "utf8"))) : null,
  save: async (value, expected) => {
    if (((await audit.read())?.phase ?? null) !== expected) throw new Error("CI_AUDIT_CONFLICT");
    await save(auditFile, auditSchema.parse(value));
  },
};
const now = new Date(runId === "100" ? "2026-10-19T10:00:00.000Z" : "2026-10-19T10:04:00.000Z");
void runAcceptance({
  approval: fictionalApproval,
  approvalHash: "a".repeat(64),
  store,
  audit,
  now: () => now,
  invocation: { runId, sha: "b".repeat(40), event: "schedule", at: now.toISOString() },
  interrupt: () => process.exit(73),
})
  .then((result) => {
    if (attempts()) throw new Error("NETWORK_ATTEMPTED");
    writeFileSync(
      join(directory, "REPORT.md"),
      qualityReport(result.state, result.audit, fictionalApproval, false),
    );
    writeFileSync(join(directory, "results.json"), JSON.stringify(result, null, 2));
    console.log(result.audit.phase);
  })
  .catch((error: unknown) => {
    const code = (error as { code?: unknown })?.code;
    const syscall = (error as { syscall?: unknown })?.syscall;
    console.error(
      "OFFLINE_CI_FAILED",
      typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : "UNKNOWN",
      typeof syscall === "string" && /^[a-z]+$/.test(syscall) ? syscall : "unknown",
    );
    process.exitCode = 1;
  });
