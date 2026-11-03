import { z } from "zod";
import { CompanyQueue } from "../../src/server/agent-workforce/company-queue/engine";
import { fixtureCompanies } from "../../src/server/agent-workforce/company-queue/fixtures";
import { signalFixtureExecutor } from "../../src/server/agent-workforce/signal-opportunity/fixtures";
import type { QueueState } from "../../src/server/agent-workforce/company-queue/contracts";
import type { QueueStore } from "../../src/server/agent-workforce/company-queue/store";
import { checksum, fail, type Approval } from "./policy";

const invocation = z
  .object({
    runId: z.string().regex(/^\d+$/),
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    event: z.enum(["schedule", "workflow_dispatch"]),
    at: z.string().datetime(),
  })
  .strict();
export const auditSchema = z
  .object({
    version: z.literal(1),
    cohort: z.string().max(80),
    approvalHash: z.string().length(64),
    phase: z.enum(["INTERRUPTED", "RECOVERED", "VERIFIED"]),
    interruption: invocation,
    recovery: invocation.optional(),
    verification: invocation.optional(),
    interruptedJobId: z.string().max(100),
    checkpointHash: z.string().length(64),
    resultHash: z.string().length(64).optional(),
    duplicateReplayPassed: z.literal(true),
    activeDuplicateDenied: z.literal(true),
    concurrentClaimDenied: z.literal(true),
    manualDispatches: z.number().int().min(0).max(3),
  })
  .strict();
export type Audit = z.infer<typeof auditSchema>;
export type Invocation = z.infer<typeof invocation>;
export interface AuditStore {
  read(): Promise<Audit | null>;
  save(value: Audit, expected: Audit["phase"] | null): Promise<void>;
}
export const queueHash = (s: QueueState) => checksum(JSON.stringify(s));
function assertCohort(state: QueueState, approval: Approval, complete = false) {
  if (state.jobs.length !== 3) fail("CI_COHORT_MISMATCH");
  for (const [i, fixture] of fixtureCompanies.entries()) {
    const job = state.jobs[i];
    if (
      job.fixture !== fixture.fixture ||
      job.mode !== "SIMULATED" ||
      job.workflow !== "SIGNAL_OPPORTUNITY_V1" ||
      job.run.input.companyDomain !== fixture.companyDomain ||
      job.run.input.companyName !== fixture.companyName ||
      job.key !== `ci-${approval.cohort}-${fixture.fixture}` ||
      job.run.usage.length ||
      job.run.approved ||
      job.run.canSend ||
      job.run.canEnroll ||
      job.inFlight ||
      (complete && (job.status !== "COMPLETE" || job.stage !== "DONE"))
    )
      fail("CI_COHORT_MISMATCH");
  }
}
export function assertResults(state: QueueState, approval: Approval) {
  assertCohort(state, approval, true);
  const [good, rejected, missing] = state.jobs;
  if (
    good.signalReport?.insights.length !== 3 ||
    good.signalReport.eligibility !== "Eligible" ||
    good.signalReport.emails.length !== 4 ||
    rejected.run.research.facts.length ||
    rejected.run.groundingAudit?.status !== "REJECTED" ||
    !rejected.run.groundingAudit.reasonCodes.includes("REJECTED_FACTS") ||
    rejected.signalReport?.insights.length !== 0 ||
    rejected.signalReport.eligibility !== "HOLD" ||
    rejected.signalReport.emails.length ||
    missing.signalReport?.eligibility !== "HOLD" ||
    missing.signalReport.emails.length ||
    missing.recoveries !== 1 ||
    state.jobs.some(
      (j) =>
        !j.judgement ||
        JSON.parse(j.judgement).factual?.mode !== "OFFLINE_SIMULATION" ||
        j.checkpoints.length !== (j.fixture === "RECOVERY" ? 3 : 4) ||
        !j.signalReport ||
        j.signalReport.mode !== "SIMULATED" ||
        j.signalReport.approved ||
        j.signalReport.canSend ||
        j.signalReport.canEnroll ||
        j.signalReport.provenSavings !== null,
    )
  )
    fail("CI_RESULTS_REJECTED");
}
export async function runAcceptance(options: {
  approval: Approval;
  approvalHash: string;
  invocation: Invocation;
  store: QueueStore;
  audit: AuditStore;
  now?: () => Date;
  interrupt: () => never;
}) {
  const { approval: a, approvalHash, invocation: run, store, audit, interrupt } = options;
  const now = options.now ?? (() => new Date());
  const previous = await audit.read();
  const manual = run.event === "workflow_dispatch" ? 1 : 0;
  if (
    previous &&
    (previous.cohort !== a.cohort ||
      previous.approvalHash !== approvalHash ||
      previous.interruption.sha !== run.sha)
  )
    fail("CI_RUN_IDENTITY_CHANGED");
  if (!previous) {
    if ((await store.read(a.actor)).jobs.length) fail("CI_NOT_EMPTY");
    const base = signalFixtureExecutor();
    let interrupted = false;
    const queue = new CompanyQueue(
      store,
      {
        mode: "SIMULATED",
        execute: async (job, time) => {
          if (job.fixture === "RECOVERY" && job.stage === "VALIDATE") {
            const claimed = await store.read(a.actor);
            assertCohort(claimed, a);
            const contender = new CompanyQueue(store, base, now);
            if ((await contender.tick(a.actor)) !== null) fail("CI_CONCURRENT_CLAIM");
            // lastWorkerAt can change on the denied tick; job contents must not.
            const after = await store.read(a.actor);
            if (JSON.stringify(after.jobs) !== JSON.stringify(claimed.jobs))
              fail("CI_CONCURRENT_MUTATION");
            await audit.save(
              {
                version: 1,
                cohort: a.cohort,
                approvalHash,
                phase: "INTERRUPTED",
                interruption: run,
                interruptedJobId: job.id,
                checkpointHash: queueHash(after),
                duplicateReplayPassed: true,
                activeDuplicateDenied: true,
                concurrentClaimDenied: true,
                manualDispatches: manual,
              },
              null,
            );
            interrupted = true;
            interrupt(); // Process exit 73 after durable claim + audit commit; no graceful release.
          }
          return base.execute(job, time);
        },
      },
      now,
    );
    for (const { fixture, ...input } of fixtureCompanies)
      await queue.enqueue(
        a.actor,
        input,
        `ci-${a.cohort}-${fixture}`,
        fixture,
        "SIGNAL_OPPORTUNITY_V1",
      );
    const first = (await store.read(a.actor)).jobs[0];
    await queue.enqueue(a.actor, first.run.input, first.key, first.fixture, first.workflow);
    let duplicateDenied = false;
    try {
      await queue.enqueue(
        a.actor,
        first.run.input,
        "ci-extra-duplicate",
        first.fixture,
        first.workflow,
      );
    } catch (error) {
      duplicateDenied = error instanceof Error && error.message === "COMPANY_ALREADY_QUEUED";
    }
    if (!duplicateDenied) fail("CI_DUPLICATE_NOT_DENIED");
    for (let i = 0; i < 15; i++) await queue.tick(a.actor);
    if (!interrupted) fail("CI_INTERRUPTION_MISSING");
    return fail("CI_INTERRUPTION_RETURNED");
  }
  const state = await store.read(a.actor);
  if (previous.phase === "INTERRUPTED") {
    if (run.runId === previous.interruption.runId) fail("CI_FRESH_RUN_REQUIRED");
    if (queueHash(state) !== previous.checkpointHash) fail("CI_CHECKPOINT_CHANGED");
    assertCohort(state, a);
    const job = state.jobs.find((j) => j.id === previous.interruptedJobId);
    if (
      !job?.lease ||
      job.stage !== "VALIDATE" ||
      job.checkpoints.length !== 1 ||
      Date.parse(job.lease.until) >= +now()
    )
      fail("CI_LEASE_NOT_EXPIRED");
    const queue = new CompanyQueue(store, signalFixtureExecutor(), now);
    for (let i = 0; i < 15; i++) await queue.tick(a.actor);
    const completed = await store.read(a.actor);
    assertResults(completed, a);
    // Replaying all stable keys after completion cannot create a fourth job.
    for (const j of completed.jobs)
      await queue.enqueue(a.actor, j.run.input, j.key, j.fixture, j.workflow);
    const reopened = await store.read(a.actor);
    if (queueHash(reopened) !== queueHash(completed)) fail("CI_DUPLICATE_MUTATION");
    const result: Audit = {
      ...previous,
      phase: "RECOVERED",
      recovery: run,
      resultHash: queueHash(reopened),
      manualDispatches: previous.manualDispatches + manual,
    };
    await audit.save(result, "INTERRUPTED");
    return { state: reopened, audit: result };
  }
  if (!previous.recovery || !previous.resultHash) fail("CI_AUDIT_INVALID");
  if (
    previous.phase === "RECOVERED" &&
    [previous.interruption.runId, previous.recovery.runId].includes(run.runId)
  )
    fail("CI_FRESH_RUN_REQUIRED");
  assertResults(state, a);
  if (queueHash(state) !== previous.resultHash) fail("CI_PERSISTENCE_CHANGED");
  if (previous.phase === "VERIFIED") return { state, audit: previous };
  const result: Audit = {
    ...previous,
    phase: "VERIFIED",
    verification: run,
    manualDispatches: previous.manualDispatches + manual,
  };
  await audit.save(result, "RECOVERED");
  return { state, audit: result };
}
export function qualityReport(
  state: QueueState,
  audit: Audit,
  approval: Approval,
  hosted: boolean,
) {
  assertResults(state, approval);
  return `# Three-company reliability and quality report

**SIMULATED evidence, contacts, reviewer and product approvals. No real prospecting quality demonstrated.**
Storage: ${hosted ? "isolated PostgreSQL; fresh hosted runs" : "offline disk test adapter; PostgreSQL and cloud NOT verified"}.
${hosted ? "Run IDs below identify distinct GitHub executions." : "Run IDs below are offline process labels, not GitHub executions."}
Acceptance phase: ${audit.phase}. Provider usage: zero; sending/enrollment: blocked.

| Fictional company | Result | Insights | Factual / opportunity score | Recovery |
|---|---|---:|---|---:|
${state.jobs.map((j) => `| ${j.run.input.companyName} | ${j.signalReport!.eligibility} | ${j.signalReport!.insights.length} | ${j.signalReport!.judgement.factualCoverage} / ${j.signalReport!.judgement.opportunityCoverage} | ${j.recoveries} |`).join("\n")}

Acme's three synthetic evidence-backed insights pass the fixture reviewer. Four fictional drafts remain review-only.
Birch's candidate is rejected by independent simulated review; no accepted insights or emails.
Cedar remains HOLD for missing licensed search, SERP and verified contact evidence. None proves savings or a real opportunity.

## Reliability evidence

Three jobs only; duplicate enqueue replay and active duplicate denial passed.
A concurrent claim while a lease was held was denied.
Interruption run: ${audit.interruption.runId}; recovery: ${audit.recovery?.runId ?? "pending"}; independent reopen: ${audit.verification?.runId ?? "pending"}.
Queue hash after recovery: ${audit.resultHash ?? "pending"}.
Original checkpoint hash: ${audit.checkpointHash}.
Accepted reports, rejection audit and Judgement are included in the private results JSON.

## Intervention measurement

${hosted ? "Declared setup interventions" : "Fictional setup-intervention input"}: ${approval.setupManualInterventions} (${hosted ? "operator supplied; not independently measured" : "regression fixture only; no cloud setup occurred"}).
Manual workflow dispatches ${hosted ? "observed" : "simulated"}: ${audit.manualDispatches}.
Manual edits between phases: zero permitted; changed source revision or queue hash fails.
Three fictional jobs processed without per-company intervention. This measures simulated operational automation only.
Unobserved account/operator activity is not measured. No claim of 85% real prospecting autonomy.

Next: inspect the private audit and measured runner minutes/database usage. No live data/provider activation follows automatically.
`;
}
