/** Offline acceptance harness only. Never used by the application or cloud worker. */
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmdirSync } from "node:fs";
import { replaceFixtureCheckpoint } from "./replace-fixture-checkpoint";
import { join, resolve } from "node:path";
import { CompanyQueue } from "../server/agent-workforce/company-queue/engine";
import { fixtureExecutor } from "../server/agent-workforce/company-queue/fixtures";
import { scheduleFixtureCohort } from "../server/agent-workforce/company-queue/schedule";
import {
  initialQueue,
  parseQueue,
  type QueueState,
} from "../server/agent-workforce/company-queue/contracts";
import type { QueueStore } from "../server/agent-workforce/company-queue/store";
const actor = "offline-fixture-operator";
const directory = resolve(process.argv[2]);
const phase = process.argv[3];
// This harness requires an explicit isolated directory, not a database or project root.
if (
  !directory.includes("company-queue-offline-") ||
  !["crash", "resume", "inspect"].includes(phase)
)
  throw new Error("OFFLINE_HARNESS_ARGUMENTS");
globalThis.fetch = async () => {
  throw new Error("OFFLINE_NETWORK_FORBIDDEN");
};
class DiskFixtureStore implements QueueStore {
  private file = join(directory, "fixture-state.json");
  async read(owner: string) {
    if (owner !== actor) throw new Error("OFFLINE_OWNER_MISMATCH");
    return existsSync(this.file)
      ? parseQueue(JSON.parse(readFileSync(this.file, "utf8")))
      : initialQueue();
  }
  async change<T>(owner: string, mutate: (state: QueueState) => T) {
    const lock = join(directory, "transaction.lock");
    mkdirSync(lock); // Exclusive process lock. No stale-lock deletion or production database access.
    try {
      const state = await this.read(owner),
        result = mutate(state);
      writeFileSync(this.file + ".next", JSON.stringify(parseQueue(state)), {
        flag: "w",
        flush: true,
      });
      await replaceFixtureCheckpoint(this.file + ".next", this.file);
      return structuredClone(result);
    } finally {
      rmdirSync(lock);
    }
  }
}
async function main() {
  const store = new DiskFixtureStore();
  if (phase !== "inspect") {
    const now = new Date(phase === "crash" ? "2026-10-19T10:00:00Z" : "2026-10-19T10:04:00Z");
    const base = fixtureExecutor();
    const queue = new CompanyQueue(
      store,
      {
        mode: "SIMULATED",
        execute: async (job, time) => {
          // The claim has already committed. Abrupt process exit discards the worker, not its checkpoints.
          if (phase === "crash" && job.fixture === "RECOVERY" && job.stage === "EXTRACT")
            process.exit(73);
          return base.execute(job, time);
        },
      },
      () => now,
    );
    await scheduleFixtureCohort(queue, actor, now);
    for (let i = 0; i < 30; i++) await queue.tick(actor);
  }
  const state = await store.read(actor);
  console.log(
    JSON.stringify({
      jobs: state.jobs.map((j) => ({
        id: j.id,
        status: j.status,
        stage: j.stage,
        recoveries: j.recoveries,
        runStatus: j.run.status,
        mode: j.mode,
        findings: j.run.research.facts.length,
        checkpointCount: j.checkpoints.length,
        judgement: JSON.parse(j.judgement ?? "null"),
        audit: j.run.groundingAudit,
        usage: j.run.usage,
      })),
      providerRequests: 0,
    }),
  );
}
void main().catch((error: unknown) => {
  // Diagnostic category only: never print a path, state payload, or raw error text.
  const code = (error as { code?: unknown })?.code;
  const syscall = (error as { syscall?: unknown })?.syscall;
  console.error(
    "OFFLINE_HARNESS_FAILED",
    typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : "UNKNOWN",
    typeof syscall === "string" && /^[a-z]+$/.test(syscall) ? syscall : "unknown",
  );
  process.exitCode = 1;
});
