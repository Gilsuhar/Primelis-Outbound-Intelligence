# Daily scheduler preparation, inactive

No Vercel cron, route, build hook or background process was activated. The new `dailyCronRehearsal`
adapter is deliberately callable only in local NODE_ENV=test with explicit rehearsal/daily enablement,
a scheduler bearer credential and operator identity. It rejects every hosted environment, including
Production and Preview, before tick/store/provider access. The existing worker endpoint and Preview
policy remain unchanged. No flag makes this adapter deployable as a live scheduler.

The prepared request contract is authenticated GET to `/api/sales-agent/daily/worker` with no query
parameters. It calls exactly one injected DailyEngine.tick(actor, true), returns only a bounded status,
never echoes exceptions or retries, and leaves persistence and concurrency to the existing engine.
There is no import-time scheduling or implicit provider construction.

Existing mechanics retained: DailyStore uses per-operator PostgreSQL transaction/advisory locking;
scheduled Jerusalem calendar-day keys are idempotent; one active/paused run blocks another start;
150-second expiring leases and fencing tokens prevent stale workers overwriting newer checkpoints;
stage retries/backoff and recovery attempts are bounded; provider calls use shared budget reservations;
partial Outreach failures never grant history clearance. Tests use the existing in-memory transactional
store and mocked handlers, including overlapping requests from separate engine instances.

Before cloud execution can be approved: audit actual database locking/privileges on an isolated
worker resource, bound provider timeouts below the lease window, verify budget configuration and
write/refresh permissions, approve exactly which providers may run, and review the current worker's
Production denial. A Vercel GET route and cron schedule require a separate implementation/approval;
do not bypass Preview policy to add them. For a multi-stage bounded engine, one daily cron tick alone
will not finish a run: later ticks or a separately supervised continuation are required. Select cadence
only after confirming plan limits and execution duration. Do not add a new queue architecture merely
to prepare the first synthetic Preview demonstration.

Initial Preview remains synthetic review only. Rollback is removing this unused rehearsal module;
no cloud setting, schedule or database state exists to undo from this sprint.
