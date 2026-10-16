import "server-only";
import { randomUUID } from "node:crypto";
import { isInOwnedIntakeScope } from "@/features/sales-agent/intake-scope";
import type { EvidenceObservation, IntakeContact } from "@/features/sales-agent/evidence";
import { snapshotSchema } from "@/server/services/sales-agent-collection-service";
import {
  PrismaEvidenceStore,
  type EvidenceSnapshot,
  type EvidenceStore,
} from "@/server/sales-agent/evidence-store";
import { LocalSuppressionAdapter } from "@/server/sales-agent/local-suppression";
import { HubSpotConnector } from "./hubspot";
import { OutreachConnector, OutreachTokens } from "./outreach";
import { IntegrationError } from "./http";
import { parseTimestamp } from "@/features/sales-agent/qualification";
import { PrismaIntegrationStore, type IntegrationStore } from "./store";
import { REQUIRED_SCOPES, type IntegrationProvider, type SyncJob } from "./contracts";
export interface HubSpotReader {
  check(): Promise<void>;
  discover(
    since: string,
    until: string,
    cursor?: string,
  ): Promise<{ ids: string[]; next?: string }>;
  contact(id: string, intakeSince: string): Promise<IntakeContact | null>;
}
export interface OutreachReader {
  check(): Promise<void>;
  collect(
    contact: IntakeContact,
    evidence: EvidenceObservation[],
  ): Promise<{ observations: EvidenceObservation[]; blockers: string[] }>;
}
export type SyncDependencies = {
  store?: IntegrationStore;
  evidence?: EvidenceStore;
  hubspot?: HubSpotReader;
  outreach?: OutreachReader;
  now?: () => Date;
  intakeSince?: string;
};
export class IntegrationSync {
  readonly store: IntegrationStore;
  private readonly evidence: EvidenceStore;
  private readonly now: () => Date;
  constructor(
    private readonly actor: string,
    private readonly deps: SyncDependencies = {},
  ) {
    if (!actor) throw new IntegrationError("CONFIGURATION");
    // One bootstrap rotating grant belongs to one explicitly configured application operator.
    // Injected readers/stores are server-only test dependencies, never request parameters.
    if (
      !deps.store &&
      !deps.evidence &&
      !deps.hubspot &&
      !deps.outreach &&
      process.env.INTEGRATION_OPERATOR_USER_ID !== actor
    )
      throw new IntegrationError("CONFIGURATION");
    this.store = deps.store ?? new PrismaIntegrationStore();
    this.evidence = deps.evidence ?? new PrismaEvidenceStore();
    this.now = deps.now ?? (() => new Date());
  }
  private hubspot(): HubSpotReader {
    return (
      this.deps.hubspot ??
      new HubSpotConnector(
        {
          token: process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? "",
          portalId: process.env.HUBSPOT_PORTAL_ID ?? "",
          revenueCurrency: process.env.HUBSPOT_COMPANY_REVENUE_CURRENCY,
          outreachIdProperty: process.env.HUBSPOT_OUTREACH_ID_PROPERTY,
        },
        { deadline: Date.now() + 20000 },
      )
    );
  }
  private outreach(): OutreachReader {
    if (this.deps.outreach) return this.deps.outreach;
    const tokens = new OutreachTokens(this.actor, this.store, {
      clientId: process.env.OUTREACH_CLIENT_ID ?? "",
      clientSecret: process.env.OUTREACH_CLIENT_SECRET ?? "",
      refreshToken: process.env.OUTREACH_REFRESH_TOKEN,
      redirectUri: process.env.OUTREACH_REDIRECT_URI ?? "",
    });
    return new OutreachConnector(() => tokens.access(), { deadline: Date.now() + 20000 });
  }
  async check(provider: IntegrationProvider) {
    try {
      await (provider === "HUBSPOT" ? this.hubspot() : this.outreach()).check();
      await this.store.change(this.actor, provider, async (row) => {
        row.state.status = "CONNECTED";
        row.state.checkedAt = this.now().toISOString();
        row.state.missingScopes = [];
        row.state.detail =
          "Authenticated read checks succeeded for every required resource. Connection success does not establish historical coverage.";
        return { row, value: undefined };
      });
    } catch (error) {
      await this.failure(provider, error);
      throw error;
    }
    return (await this.store.get(this.actor, provider)).state;
  }
  private async failure(provider: IntegrationProvider, error: unknown, jobId?: string) {
    const safe =
      error instanceof IntegrationError ? error : new IntegrationError("INVALID_RESPONSE");
    await this.store.change(this.actor, provider, async (row) => {
      row.state.status =
        safe.code === "DISCONNECTED" || safe.code === "CONFIGURATION"
          ? "DISCONNECTED"
          : safe.code === "PERMISSION_MISSING"
            ? "PERMISSION_MISSING"
            : "ERROR";
      row.state.checkedAt = this.now().toISOString();
      // A 403 can mean role visibility, not just missing OAuth scopes. These are requirements to review.
      row.state.missingScopes =
        safe.code === "PERMISSION_MISSING" ? [...REQUIRED_SCOPES[provider]] : [];
      row.state.detail = `${safe.message}. ${safe.code === "PERMISSION_MISSING" ? "Review the listed required scopes and connected user's visibility; missing scopes cannot be inferred exactly from a generic 403." : "Check server-side configuration and provider diagnostics; no credentials or response bodies are exposed."}`;
      if (jobId && row.state.job?.id === jobId) {
        row.state.job.status = "FAILED";
        row.state.job.error = safe.message;
        row.state.job.attempts++;
        row.state.job.nextAttemptAt = new Date(
          this.now().getTime() + Math.max(60000, safe.retryAfterMs),
        ).toISOString();
        row.state.coverage = "PARTIAL";
      }
      return { row, value: undefined };
    });
  }
  async start(provider: IntegrationProvider, mode: SyncJob["mode"], requestKey: string) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestKey)) throw new IntegrationError("CONFIGURATION");
    const priorState = (await this.store.get(this.actor, provider)).state;
    const existing = priorState.job;
    if (priorState.requestKeys?.includes(requestKey) && existing?.requestKey !== requestKey)
      throw new Error("IDEMPOTENCY_CONFLICT");
    if (
      existing?.requestKey === requestKey ||
      (existing && ["RUNNING", "QUEUED"].includes(existing.status))
    )
      return existing;
    await this.check(provider);
    if (provider === "OUTREACH") {
      const hubspot = (await this.store.get(this.actor, "HUBSPOT")).state;
      const success = hubspot.lastSuccessfulSync ? Date.parse(hubspot.lastSuccessfulSync) : NaN;
      if (
        hubspot.status !== "CONNECTED" ||
        hubspot.job?.status !== "COMPLETED" ||
        !Number.isFinite(success) ||
        success > this.now().getTime() ||
        this.now().getTime() - success > 86400000
      )
        throw new IntegrationError("CONFIGURATION");
    }
    const since = this.deps.intakeSince ?? process.env.HUBSPOT_SYNC_START_AT;
    if (!since || parseTimestamp(since) === null || Date.parse(since) > this.now().getTime())
      throw new IntegrationError("CONFIGURATION");
    const snapshots = provider === "OUTREACH" ? await this.snapshots() : [];
    return this.store.change(this.actor, provider, async (row) => {
      if (row.state.requestKeys?.includes(requestKey) && row.state.job?.requestKey !== requestKey)
        throw new Error("IDEMPOTENCY_CONFLICT");
      if (
        row.state.job?.requestKey === requestKey ||
        (row.state.job && ["RUNNING", "QUEUED"].includes(row.state.job.status))
      )
        return { row, value: row.state.job };
      if (mode === "INCREMENTAL" && !row.state.lastSuccessfulSync)
        throw new IntegrationError("CONFIGURATION");
      const job: SyncJob = {
        id: randomUUID(),
        requestKey,
        mode,
        status: "QUEUED",
        since:
          mode === "INCREMENTAL"
            ? new Date(
                Math.max(
                  Date.parse(since),
                  Date.parse(row.state.watermark ?? row.state.lastSuccessfulSync!) - 300000,
                ),
              ).toISOString()
            : new Date(since).toISOString(),
        until: this.now().toISOString(),
        pending:
          provider === "OUTREACH"
            ? snapshots
                .filter((snapshot) => isInOwnedIntakeScope(snapshot.contact))
                .map((snapshot) => snapshot.contact.hubspotRecordId)
            : [],
        cursor: undefined,
        phase: provider === "OUTREACH" ? "REFRESH" : "DISCOVER",
        refreshed: [],
        imported: 0,
        updated: 0,
        unchanged: 0,
        attempts: 0,
        startedAt: this.now().toISOString(),
      };
      row.state.job = job;
      row.state.requestKeys = [...(row.state.requestKeys ?? []), requestKey];
      row.state.coverage = "PARTIAL";
      return { row, value: job };
    });
  }
  async resume(provider: IntegrationProvider) {
    await this.check(provider);
    return this.store.change(this.actor, provider, async (row) => {
      if (!row.state.job || row.state.job.status === "COMPLETED")
        throw new IntegrationError("CONFIGURATION");
      row.state.job.status = "QUEUED";
      row.state.job.attempts = 0;
      delete row.state.job.nextAttemptAt;
      return { row, value: row.state.job };
    });
  }
  private async snapshots() {
    return (await this.evidence.list(this.actor)).flatMap((raw) => {
      const parsed = snapshotSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    });
  }
  /** One durable unit per call. A worker may drain several units within its execution budget. */
  async step(provider: IntegrationProvider): Promise<boolean> {
    const worker = randomUUID();
    if (!(await this.store.claim(this.actor, provider, worker))) return false;
    let job: SyncJob | null = null;
    try {
      job = structuredClone((await this.store.get(this.actor, provider)).state.job);
      if (
        !job ||
        job.status === "COMPLETED" ||
        job.attempts >= 3 ||
        (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > this.now().getTime())
      )
        return false;
      job.status = "RUNNING";
      if (job.pending.length) {
        const id = job.pending[0];
        if (provider === "HUBSPOT") await this.importContact(id, job);
        else await this.refreshOutreach(id, job);
        job.pending.shift();
        job.refreshed.push(id);
      } else if (provider === "HUBSPOT" && job.phase === "DISCOVER") {
        const result = await this.hubspot().discover(job.since, job.until, job.cursor);
        job.pending = [...new Set(result.ids)].filter((id) => !job!.refreshed.includes(id));
        if (result.next && result.next === job.cursor)
          throw new IntegrationError("INVALID_RESPONSE");
        job.cursor = result.next;
        if (!result.next) job.phase = "REFRESH";
      } else {
        const ids =
          provider === "HUBSPOT"
            ? (await this.snapshots())
                .map((snapshot) => snapshot.contact.hubspotRecordId)
                .filter((id) => !job!.refreshed.includes(id))
            : [];
        // Refresh previously imported records even when deal/history/owner changes don't update contact search.
        if (ids.length) job.pending = ids;
        else {
          job.status = "COMPLETED";
          job.completedAt = this.now().toISOString();
        }
      }
      const currentJob = job;
      await this.store.change(this.actor, provider, async (row) => {
        if (row.state.job?.id !== currentJob.id) throw new IntegrationError("INVALID_RESPONSE");
        row.state.job = currentJob;
        if (currentJob.status === "COMPLETED") {
          row.state.lastSuccessfulSync = this.now().toISOString();
          row.state.watermark = currentJob.until;
          row.state.coverage = "VISIBLE_RECORDS_ONLY";
          row.state.detail =
            "All selected records and pages synchronized. Historical coverage remains separate; API visibility/retention and independent verification may still require HOLD.";
        }
        return { row, value: undefined };
      });
      return job.status !== "COMPLETED";
    } catch (error) {
      await this.failure(provider, error, job?.id);
      return false;
    } finally {
      await this.store.release(this.actor, provider, worker);
    }
  }
  private async findSnapshot(id: string) {
    if (this.evidence.find) {
      const raw = await this.evidence.find(this.actor, id),
        parsed = snapshotSchema.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    }
    return (await this.snapshots()).find((snapshot) => snapshot.contact.hubspotRecordId === id);
  }
  private async importContact(id: string, job: SyncJob) {
    const previous = await this.findSnapshot(id);
    if (previous?.integrationReceipts?.HUBSPOT?.jobId === job.id) {
      if (previous.integrationReceipts.HUBSPOT.operation === "IMPORTED") job.imported++;
      else job.updated++;
      return;
    }
    const cutoff =
      previous?.contact.intakeSince ?? this.deps.intakeSince ?? process.env.HUBSPOT_SYNC_START_AT!;
    const contact = await this.hubspot().contact(id, cutoff);
    if (!contact) {
      if (previous) {
        // Do not delete or leave an old READY snapshot when ownership/scope changes.
        await this.evidence.edit(this.actor, id, (raw) => {
          const saved = snapshotSchema.parse(raw);
          return {
            ...saved,
            contact: {
              ...saved.contact,
              ownerId: "UNAUTHORIZED",
              observedAt: this.now().toISOString(),
            },
            integrationReceipts: {
              ...saved.integrationReceipts,
              HUBSPOT: { jobId: job.id, operation: "UPDATED" },
            },
            provenanceAtCollection: [],
            blockers: [
              ...new Set([
                ...saved.blockers,
                "HubSpot current owner/intake scope no longer authorized; history UNKNOWN",
              ]),
            ],
            collectedAt: this.now().toISOString(),
          };
        });
        job.updated++;
      }
      return;
    }
    const suppressions = new LocalSuppressionAdapter(await this.evidence.suppressionRecords());
    const local = await suppressions.collect(contact, this.now());
    const retained = (previous?.observations ?? []).filter(
      (item) => !["HUBSPOT", "LOCAL_SUPPRESSION"].includes(item.provider),
    );
    const snapshot: EvidenceSnapshot = {
      version: 1,
      integrationReceipts: {
        ...previous?.integrationReceipts,
        HUBSPOT: { jobId: job.id, operation: previous ? "UPDATED" : "IMPORTED" },
      },
      contact,
      observations: [...contact.observations, ...local.observations, ...retained],
      blockers: [
        ...contact.warnings,
        ...local.blockers,
        ...(previous?.blockers.filter((blocker) => blocker.startsWith("Outreach")) ?? []),
      ],
      provenanceAtCollection: [],
      providers: [
        {
          provider: "HUBSPOT",
          status: "CONNECTED",
          message: "Read-only contact, company, deal and activity API reads succeeded",
        },
        ...(previous?.providers.filter((item) => item.provider !== "HUBSPOT") ?? []),
      ],
      collectedAt: this.now().toISOString(),
    };
    // Merge under the existing actor lock so a concurrent Outreach result is never overwritten.
    if (previous) {
      const changed = await this.evidence.edit(this.actor, id, (raw) => {
        const latest = snapshotSchema.parse(raw);
        const identityChanged =
          latest.contact.email !== contact.email ||
          latest.contact.companyDomain !== contact.companyDomain ||
          latest.contact.fullName !== contact.fullName ||
          latest.contact.outreachProspectId !== contact.outreachProspectId;
        return {
          ...snapshot,
          dashboardReview: latest.dashboardReview,
          verification: latest.verification,
          research: identityChanged ? [] : latest.research,
          integrationReceipts: {
            ...latest.integrationReceipts,
            HUBSPOT: { jobId: job.id, operation: "UPDATED" },
          },
          observations: [
            ...contact.observations,
            ...local.observations,
            ...latest.observations.filter(
              (item) =>
                !["HUBSPOT", "LOCAL_SUPPRESSION"].includes(item.provider) &&
                (!identityChanged || item.provider !== "OUTREACH"),
            ),
          ],
          blockers: [
            ...contact.warnings,
            ...local.blockers,
            ...(identityChanged
              ? ["Outreach identity changed; history UNKNOWN, fresh matching and sync required"]
              : latest.blockers.filter((blocker) => blocker.startsWith("Outreach"))),
          ],
          providers: [
            ...snapshot.providers.filter((item) => item.provider === "HUBSPOT"),
            ...latest.providers.filter((item) => item.provider !== "HUBSPOT"),
          ],
        };
      });
      if (!changed) throw new IntegrationError("INVALID_RESPONSE");
    } else await this.evidence.save(this.actor, [snapshot]);
    if (previous) job.updated++;
    else job.imported++;
  }
  private async refreshOutreach(id: string, job: SyncJob) {
    const previous = await this.findSnapshot(id);
    if (!previous) throw new IntegrationError("INVALID_RESPONSE");
    if (!isInOwnedIntakeScope(previous.contact)) return;
    if (previous.integrationReceipts?.OUTREACH?.jobId === job.id) {
      job.updated++;
      return;
    }
    const result = await this.outreach().collect(previous.contact, previous.observations);
    const edited = await this.evidence.edit(this.actor, id, (raw) => {
      const latest = snapshotSchema.parse(raw);
      // Refuse to attach history fetched for an identity which changed during the request.
      if (
        latest.contact.email !== previous.contact.email ||
        latest.contact.companyDomain !== previous.contact.companyDomain ||
        latest.contact.outreachProspectId !== previous.contact.outreachProspectId
      )
        throw new IntegrationError("INVALID_RESPONSE");
      return {
        ...latest,
        integrationReceipts: {
          ...latest.integrationReceipts,
          OUTREACH: { jobId: job.id, operation: "UPDATED" },
        },
        observations: [
          ...latest.observations.filter((item) => item.provider !== "OUTREACH"),
          ...result.observations,
        ],
        blockers: [
          ...latest.blockers.filter((blocker) => !blocker.startsWith("Outreach")),
          ...result.blockers,
        ],
        providers: [
          ...latest.providers.filter((item) => item.provider !== "OUTREACH"),
          {
            provider: "OUTREACH",
            status: "CONNECTED",
            message: "Authenticated API-visible history read; coverage is not proven complete",
          },
        ],
        collectedAt: this.now().toISOString(),
        provenanceAtCollection: [],
      };
    });
    if (!edited) throw new IntegrationError("INVALID_RESPONSE");
    job.updated++;
  }
}
