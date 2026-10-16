import "server-only";
import { randomUUID } from "node:crypto";
import type {
  DailyConfig,
  DailyContact,
  DailyReport,
  DailyRun,
} from "@/features/agent-workforce/daily/contracts";
import { DailyStore, dailyConfig } from "./state";
import { jerusalemParts, nextScheduledAt, scheduledKey } from "./schedule";
import { withBudgetContext } from "./budget";
export type UnitResult = {
  done: boolean;
  reason?: string;
  retryAt?: string;
  failed?: boolean;
  syncJobId?: string;
  discovered?: number;
  deferred?: number;
  contacts?: DailyContact[];
  contact?: DailyContact;
  budgetBlocked?: string;
};
export interface DailyHandlers {
  sync(actor: string, run: DailyRun, provider: "HUBSPOT" | "OUTREACH"): Promise<UnitResult>;
  intake(actor: string, run: DailyRun, max: number): Promise<UnitResult>;
  contact(actor: string, run: DailyRun, contact: DailyContact): Promise<UnitResult>;
}
export class DailyEngine {
  constructor(
    readonly store = new DailyStore(),
    readonly config: DailyConfig = dailyConfig(),
    private readonly handlers?: DailyHandlers,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async start(actor: string, key: string, trigger: DailyRun["trigger"]): Promise<DailyRun> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new Error("INVALID_JSON");
    const now = this.now().toISOString();
    return this.store.change(actor, (state) => {
      const prior = state.runs.find((r) => r.key === key);
      if (prior) return prior;
      const active = state.runs.find(
        (r) =>
          r.status === "RUNNING" ||
          r.status === "PAUSED" ||
          !!(r.lease && Date.parse(r.lease.until) > this.now().getTime()),
      );
      if (active) return active; // One daily pipeline, including unresolved budget pauses.
      const run: DailyRun = {
        id: randomUUID(),
        key,
        localDate: trigger === "SCHEDULED" ? key.slice(6) : jerusalemParts(this.now()).date,
        trigger,
        status: "RUNNING",
        stage: "HUBSPOT",
        createdAt: now,
        updatedAt: now,
        finishedAt: null,
        lease: null,
        attempts: 0,
        nextAttemptAt: null,
        reason: null,
        estimatedUsd: 0,
        discovered: 0,
        deferred: 0,
        contacts: [],
        errors: [],
      };
      // 90 reports; keys from today's date are retained even under repeated manual runs.
      if (state.runs.filter((r) => r.localDate === run.localDate).length >= 20)
        throw new Error("DAILY_RUN_LIMIT");
      state.runs = [...state.runs.slice(-89), run];
      return structuredClone(run);
    });
  }
  async tick(actor: string, scheduled = false) {
    if (scheduled) {
      const key = await this.store.change(actor, (state) => {
        const due = scheduledKey(this.now(), this.config, state);
        state.lastWorkerAt = this.now().toISOString();
        return due;
      });
      if (key) await this.start(actor, key, "SCHEDULED");
    }
    const token = randomUUID(),
      now = this.now();
    const claimed = await this.store.change(actor, (state) => {
      const run = state.runs.find((r) => r.status === "RUNNING");
      if (
        !run ||
        (run.lease && Date.parse(run.lease.until) > now.getTime()) ||
        (run.nextAttemptAt && Date.parse(run.nextAttemptAt) > now.getTime())
      )
        return null;
      if (run.lease) {
        run.attempts++;
        run.errors.push({ at: now.toISOString(), stage: run.stage, code: "WORKER_INTERRUPTED" });
        if (run.attempts > this.config.maxRetries) {
          run.status = "FAILED";
          run.reason = "Crash recovery limit reached; inspect checkpoints and retry";
          run.finishedAt = now.toISOString();
          run.lease = null;
          return null;
        }
      }
      run.lease = { token, until: new Date(now.getTime() + 150000).toISOString() };
      run.updatedAt = now.toISOString();
      return structuredClone(run);
    });
    if (!claimed) return null;
    const context = {
      actor,
      runId: claimed.id,
      contactId: claimed.contacts.find((c) => c.status === "WAITING" || c.status === "RUNNING")?.id,
      store: this.store,
      config: this.config,
      now: this.now,
      blocked: undefined as string | undefined,
    };
    let result: UnitResult;
    try {
      const handlers = this.handlers ?? (await import("./handlers")).dailyHandlers(this.config);
      result = await withBudgetContext(context, async () => {
        if (claimed.stage === "HUBSPOT" || claimed.stage === "OUTREACH")
          return handlers.sync(actor, claimed, claimed.stage);
        if (claimed.stage === "CONTACTS" && !claimed.contacts.length)
          return handlers.intake(actor, claimed, this.config.maxContacts);
        const contact = claimed.contacts.find((c) => ["WAITING", "RUNNING"].includes(c.status));
        if (contact) {
          if (contact.nextAttemptAt && Date.parse(contact.nextAttemptAt) > now.getTime())
            return { done: false, retryAt: contact.nextAttemptAt };
          return handlers.contact(actor, claimed, structuredClone(contact));
        }
        return { done: true };
      });
      if (context.blocked) result = { done: false, budgetBlocked: context.blocked };
    } catch (error) {
      result = context.blocked
        ? { done: false, budgetBlocked: context.blocked }
        : { done: false, failed: true, reason: safeCode(error) };
    }
    return this.store.change(actor, (state) => {
      const run = state.runs.find((r) => r.id === claimed.id);
      if (!run || run.lease?.token !== token) return null; // Fenced stale worker cannot overwrite a retry or cancellation.
      run.lease = null;
      run.updatedAt = this.now().toISOString();
      if (run.status !== "RUNNING") return run;
      if (result.syncJobId) run.syncJobId = result.syncJobId;
      if (result.budgetBlocked) {
        run.status = "PAUSED";
        run.reason = result.budgetBlocked;
        run.nextAttemptAt = null;
      } else if (result.failed) {
        run.attempts++;
        run.reason = result.reason ?? "PROVIDER_UNAVAILABLE";
        run.errors = [
          ...run.errors.slice(-99),
          { at: run.updatedAt, stage: run.stage, code: run.reason },
        ];
        if (run.attempts > this.config.maxRetries) {
          const contact =
            run.stage === "CONTACTS"
              ? run.contacts.find((c) => ["WAITING", "RUNNING"].includes(c.status))
              : undefined;
          if (contact) {
            contact.status = "FAILED";
            contact.reasons.push(run.reason);
            contact.attempts = run.attempts;
            run.attempts = 0;
            run.nextAttemptAt = null;
          } else {
            run.status = "FAILED";
            run.finishedAt = run.updatedAt;
          }
        } else
          run.nextAttemptAt = new Date(
            Math.max(
              this.now().getTime() + 60000 * 2 ** (run.attempts - 1),
              result.retryAt ? Date.parse(result.retryAt) : 0,
            ),
          ).toISOString();
      } else {
        run.attempts = 0;
        run.nextAttemptAt = result.retryAt ?? null;
        run.reason = result.reason ?? null;
        if (result.syncJobId) run.syncJobId = result.syncJobId;
        if (result.discovered !== undefined) run.discovered = result.discovered;
        if (result.deferred !== undefined) run.deferred = result.deferred;
        if (result.contacts) run.contacts = result.contacts;
        if (result.contact) {
          const index = run.contacts.findIndex((c) => c.id === result.contact!.id);
          if (index >= 0) run.contacts[index] = result.contact;
        }
        if (result.done) {
          if (run.stage === "HUBSPOT") run.stage = "OUTREACH";
          else if (run.stage === "OUTREACH") {
            run.stage = "CONTACTS";
            delete run.syncJobId;
          } else if (!run.contacts.some((c) => ["WAITING", "RUNNING"].includes(c.status))) {
            run.stage = "REPORT";
            run.status =
              run.deferred || run.contacts.some((c) => c.status !== "COMPLETED")
                ? "PARTIAL"
                : "COMPLETED";
            run.finishedAt = run.updatedAt;
          }
          if (run.stage === "OUTREACH") delete run.syncJobId;
        }
      }
      return structuredClone(run);
    });
  }
  async control(actor: string, runId: string, action: "CANCEL" | "RETRY") {
    return this.store.change(actor, (state) => {
      const run = state.runs.find((r) => r.id === runId);
      if (!run) throw new Error("NOT_FOUND");
      // Preserve the lease while cancellation drains an already-started read-only provider call.
      if (action === "CANCEL") {
        run.status = "CANCELLED";
        run.reason =
          "Cancelled by operator; in-flight read-only requests may finish, drafts remain unapproved";
        run.finishedAt = this.now().toISOString();
      } else {
        if (
          state.runs.some(
            (r) => r.id !== runId && (r.status === "RUNNING" || r.status === "PAUSED"),
          )
        )
          throw new Error("VERSION_CONFLICT");
        if (run.lease && Date.parse(run.lease.until) > this.now().getTime())
          throw new Error("VERSION_CONFLICT");
        for (const contact of run.contacts)
          if (contact.status === "FAILED" || contact.status === "BLOCKED") {
            contact.status = "WAITING";
            contact.retryRequested = true;
            contact.attempts = 0;
            contact.nextAttemptAt = null;
          }
        run.status = "RUNNING";
        run.finishedAt = null;
        run.attempts = 0;
        run.nextAttemptAt = null;
        run.reason = null;
        run.lease = null;
      }
      run.updatedAt = this.now().toISOString();
      return structuredClone(run);
    });
  }
  async report(actor: string): Promise<DailyReport> {
    const state = await this.store.get(actor),
      now = this.now(),
      day = jerusalemParts(now).date;
    const observed =
      state.lastWorkerAt &&
      Date.parse(state.lastWorkerAt) <= now.getTime() &&
      now.getTime() - Date.parse(state.lastWorkerAt) < 10 * 60000;
    return {
      config: this.config,
      scheduler: {
        state: !this.config.enabled ? "DISABLED" : observed ? "WORKER_OBSERVED" : "AWAITING_WORKER",
        lastWorkerAt: state.lastWorkerAt,
        nextRunAt:
          this.config.enabled && observed
            ? nextScheduledAt(
                now,
                this.config.time,
                state.runs.some((r) => r.key === `daily-${day}`) ? day : undefined,
              )
            : null,
      },
      runs: [...state.runs].reverse(),
      lastSuccessfulRunAt:
        [...state.runs].reverse().find((r) => r.status === "COMPLETED")?.finishedAt ?? null,
      budget: {
        day,
        month: day.slice(0, 7),
        dailyEstimatedUsd: state.days[day]?.estimatedUsd ?? 0,
        monthlyEstimatedUsd: state.months[day.slice(0, 7)] ?? 0,
        usage: state.days[day] ?? null,
        activeCalls: Object.values(state.pending).filter((p) => Date.parse(p.until) > now.getTime())
          .length,
      },
    };
  }
}
export function safeCode(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : error instanceof Error
        ? error.message
        : "";
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : "PROVIDER_OR_CHECKPOINT_UNAVAILABLE";
}
