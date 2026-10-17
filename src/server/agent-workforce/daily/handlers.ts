import "server-only";
import { checkWorkforceDraftAccess, draftAccessForSnapshot } from "../draft-access";
import { randomUUID } from "node:crypto";
import { recordResearchAttempt } from "./budget";
import type { DailyConfig, DailyContact } from "@/features/agent-workforce/daily/contracts";
import {
  snapshotSchema,
  reviewEvidenceSnapshot,
} from "@/server/services/sales-agent-collection-service";
import { isInOwnedIntakeScope } from "@/features/sales-agent/intake-scope";
import { PrismaEvidenceStore } from "@/server/sales-agent/evidence-store";
import { PrismaIntegrationStore } from "@/server/integrations/store";
import { IntegrationSync } from "@/server/integrations/sync";
import { retryVerification } from "@/server/verification/service";
import { ProspectResearchEngine } from "../prospect-research/engine";
import { DraftStudioEngine } from "../draft-studio/engine";
import { checkWorkforceEligibility } from "../safety";
import { DailyStore } from "./state";
import type { DailyHandlers } from "./engine";
/** All adapters are existing read-only integrations; controller never synthesizes clearance. */
export function dailyHandlers(config: DailyConfig): DailyHandlers {
  const integrations = new PrismaIntegrationStore(),
    evidence = new PrismaEvidenceStore(),
    research = new ProspectResearchEngine({ maxRetries: config.maxRetries }),
    drafts = new DraftStudioEngine({ maxRetries: config.maxRetries });
  return {
    async sync(actor, run, provider) {
      const sync = new IntegrationSync(actor),
        prior = (await integrations.get(actor, provider)).state;
      const key = `daily-${run.id}-${provider}`;
      let job = prior.job;
      if (!run.syncJobId)
        job = await sync.start(provider, prior.lastSuccessfulSync ? "INCREMENTAL" : "INITIAL", key);
      if (!job) throw new Error("SYNC_CHECKPOINT_MISSING");
      if (job.status === "FAILED") {
        if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > Date.now())
          return { done: false, syncJobId: job.id, retryAt: job.nextAttemptAt };
        await sync.resume(provider);
      }
      if (job.status !== "COMPLETED") await sync.step(provider);
      const current = (await integrations.get(actor, provider)).state;
      job = current.job;
      if (!job || (run.syncJobId && job.id !== run.syncJobId))
        throw new Error("SYNC_CHECKPOINT_CHANGED");
      if (job.status === "FAILED")
        return {
          done: false,
          failed: true,
          reason: "SYNC_INCOMPLETE",
          retryAt: job.nextAttemptAt,
          syncJobId: job.id,
        };
      return {
        done: job.status === "COMPLETED",
        syncJobId: job.id,
        ...(provider === "HUBSPOT" ? { discovered: job.imported } : {}),
      };
    },
    async intake(actor, run, max) {
      const records = (await evidence.list(actor)).flatMap((raw) => {
        const parsed = snapshotSchema.safeParse(raw);
        return parsed.success &&
          isInOwnedIntakeScope(parsed.data.contact) &&
          parsed.data.integrationReceipts?.HUBSPOT
          ? [parsed.data]
          : [];
      });
      const unique = [...new Map(records.map((s) => [s.contact.hubspotRecordId, s])).values()].sort(
        (a, b) => a.contact.hubspotRecordId.localeCompare(b.contact.hubspotRecordId),
      );
      const history = (await new DailyStore(integrations).get(actor)).runs;
      const cursor = [...history]
        .reverse()
        .find((r) => r.id !== run.id && r.contacts.length && r.finishedAt)
        ?.contacts.at(-1)?.id;
      const ordered = cursor
        ? [
            ...unique.filter((s) => s.contact.hubspotRecordId > cursor),
            ...unique.filter((s) => s.contact.hubspotRecordId <= cursor),
          ]
        : unique;
      const contacts: DailyContact[] = ordered.slice(0, max).map((snapshot) => {
        const decision = reviewEvidenceSnapshot(snapshot, new Date()).plan.decision;
        return {
          id: snapshot.contact.hubspotRecordId,
          status: !draftAccessForSnapshot(snapshot, new Date()).draftAllowed
            ? "BLOCKED"
            : "WAITING",
          stage: "VERIFY_EMAIL",
          attempts: 0,
          nextAttemptAt: null,
          decision: decision.status === "READY" ? "ELIGIBLE" : decision.status,
          reasons: decision.reasons,
          missingEvidence: decision.missingVerificationRequirements,
          researchCompleted: false,
          draftPrepared: false,
        };
      });
      return {
        done: !contacts.some((c) => c.status === "WAITING"),
        contacts,
        deferred: Math.max(0, unique.length - contacts.length),
      };
    },
    async contact(actor, run, contact) {
      const raw = await evidence.find(actor, contact.id),
        snapshot = snapshotSchema.parse(raw);
      if (!isInOwnedIntakeScope(snapshot.contact)) {
        contact.status = "BLOCKED";
        contact.decision = "HOLD";
        contact.reasons = ["Owner/intake scope changed; refresh synchronization"];
        return { done: true, contact };
      }
      const title = String(
        snapshot.observations.filter((o) => o.field === "role").at(-1)?.value ?? "Role unverified",
      );
      const input = {
        hubspotRecordId: contact.id,
        companyName: snapshot.contact.companyName ?? "",
        companyDomain: snapshot.contact.companyDomain ?? "",
        prospectName: snapshot.contact.fullName,
        prospectTitle: title,
      };
      const eligibility = await checkWorkforceEligibility(actor, input, new Date());
      contact.decision = eligibility.status === "READY" ? "ELIGIBLE" : eligibility.status;
      contact.reasons = eligibility.reasons;
      contact.missingEvidence = reviewEvidenceSnapshot(
        snapshot,
        new Date(),
      ).plan.decision.missingVerificationRequirements;
      // Always revalidate an existing draft before returning a blocked eligibility decision.
      const priorDrafts = await (drafts.store.byContact?.(actor, contact.id) ??
        drafts.store.list(actor));
      const latestDraft = priorDrafts.find(
        (r) => r.draftStudio && r.intake.hubspotRecordId === contact.id,
      );
      if (latestDraft) await drafts.read(actor, latestDraft.id);
      if (contact.draftId && contact.draftId !== latestDraft?.id)
        await drafts.read(actor, contact.draftId);
      const draftAccess = await checkWorkforceDraftAccess(actor, input, new Date(), evidence);
      if (!draftAccess.draftAllowed || eligibility.status === "REJECTED") {
        contact.status = "BLOCKED";
        return { done: true, contact };
      }
      contact.status = "RUNNING";
      contact.nextAttemptAt = null;
      if (contact.stage === "VERIFY_EMAIL" || contact.stage === "VERIFY_EMPLOYMENT") {
        const kind = contact.stage === "VERIFY_EMAIL" ? "EMAIL" : "EMPLOYMENT";
        try {
          await retryVerification(
            actor,
            contact.id,
            kind,
            `daily-${run.id}-${kind}-${randomUUID()}`,
          );
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "EMAIL_HISTORY_REQUIRED") throw error;
        }
        const verified = snapshotSchema.parse(await evidence.find(actor, contact.id))
          .verification?.[kind];
        if (
          verified?.state === "RUNNING" ||
          (verified?.state === "FAILED" &&
            ["RATE_LIMITED", "UNAVAILABLE"].includes(verified.message) &&
            verified.attempts <= config.maxRetries)
        ) {
          return { done: false, contact, retryAt: verified.nextRetryAt };
        }
        if (kind === "EMPLOYMENT") {
          try {
            if (!(await new IntegrationSync(actor).refreshAfterVerification(contact.id)))
              return { done: false, contact, retryAt: new Date(Date.now() + 60000).toISOString() };
          } catch {
            contact.reasons.push(
              "Outreach history recheck after independent verification failed; history remains UNKNOWN",
            );
          }
        }
        contact.stage = kind === "EMAIL" ? "VERIFY_EMPLOYMENT" : "RESEARCH";
        return { done: false, contact };
      }
      if (contact.stage === "RESEARCH") {
        if (!contact.researchId) {
          const entry = (await research.enqueue(actor, { contactId: contact.id, limit: 1 }))
            .records[0];
          if (!entry?.runId) {
            contact.status = "BLOCKED";
            contact.reasons.push(entry?.issue ?? "RESEARCH_INTAKE_UNAVAILABLE");
            return { done: true, contact };
          }
          contact.researchId = entry.runId;
        }
        if (contact.retryRequested) {
          await research.retryFailed(actor, contact.researchId);
          contact.retryRequested = false;
        }
        let result = await research.store.get(actor, contact.researchId);
        if (!result?.prospectResearch) throw new Error("RESEARCH_CHECKPOINT_MISSING");
        const now = Date.now();
        if (result.leaseUntil && Date.parse(result.leaseUntil) > now)
          return { done: false, retryAt: result.leaseUntil, contact };
        if (result.prospectResearch.status === "STALE") {
          contact.status = "BLOCKED";
          contact.reasons.push(
            "Research is stale or identity changed; refresh intake and research before retrying",
          );
          return { done: true, contact };
        }
        const stages = Object.values(result.prospectResearch.stages);
        const pending = stages.some(
          (s) =>
            s.status === "WAITING" ||
            s.status === "RUNNING" ||
            (s.status === "FAILED" && s.attempts < Math.min(3, config.maxRetries + 1)),
        );
        const runnable = stages.some(
          (s) =>
            s.status === "WAITING" ||
            s.status === "RUNNING" ||
            (s.status === "FAILED" &&
              s.attempts < Math.min(3, config.maxRetries + 1) &&
              (!s.retryAt || Date.parse(s.retryAt) <= now)),
        );
        if (pending && !runnable)
          return {
            done: false,
            contact,
            retryAt: stages
              .map((s) => s.retryAt)
              .filter((s): s is string => !!s && Date.parse(s) > now)
              .sort()[0],
          };
        if (pending) {
          // Actual durable research stage attempts, not fabricated source findings or model call counts.
          await recordResearchAttempt(actor, contact.id, new DailyStore(integrations), new Date());
          result = await research.advance(actor, contact.researchId);
        }
        const researchState = result.prospectResearch!;
        if (researchState.status === "STALE") {
          contact.status = "BLOCKED";
          contact.reasons.push("Research invalidated during processing; refresh evidence");
          return { done: true, contact };
        }
        const outstanding = Object.values(researchState.stages).filter(
          (s) =>
            s.status === "WAITING" ||
            s.status === "RUNNING" ||
            (s.status === "FAILED" && s.attempts < Math.min(3, config.maxRetries + 1)),
        );
        if (outstanding.length) {
          const retry = outstanding
            .map((s) => s.retryAt)
            .filter((s): s is string => !!s && Date.parse(s) > Date.now())
            .sort()[0];
          return { done: false, contact, retryAt: retry };
        }
        contact.researchCompleted =
          researchState.stages.COMPANY.status === "COMPLETE" &&
          researchState.stages.CONTACT.status === "COMPLETE" &&
          researchState.stages.REVIEW.status === "COMPLETE" &&
          !researchState.reviewIssues.length;
        if (!contact.researchCompleted) {
          contact.reasons.push(
            ...researchState.reviewIssues,
            "Research limited; select the best supported review-only writing mode, never send-ready",
          );
        }
        contact.stage = "DRAFT";
        return { done: false, contact };
      }
      if (!draftAccess.draftAllowed) {
        contact.status = "BLOCKED";
        return { done: true, contact };
      }
      if (contact.stage === "DRAFT") {
        let draft = contact.draftId
          ? await drafts.read(actor, contact.draftId)
          : await drafts.prepare(actor, contact.researchId!);
        if (contact.retryRequested) {
          contact.retryRequested = false;
          if (["GENERATION_FAILED", "RESEARCH_INCOMPLETE"].includes(draft.status))
            draft = await drafts.mutate(actor, draft.id, {
              action: "REGENERATE",
              expectedVersion: draft.version,
              requestKey: randomUUID(),
            });
        }
        contact.draftId = draft.id;
        if (draft.leaseUntil && Date.parse(draft.leaseUntil) > Date.now())
          return { done: false, retryAt: draft.leaseUntil, contact };
        if (draft.status === "RUNNING") {
          const updated = await drafts.advance(actor, draft.id);
          if (updated.draftStudio?.nextRetryAt)
            return { done: false, contact, retryAt: updated.draftStudio.nextRetryAt };
          return { done: false, contact };
        }
        if (draft.status !== "READY_FOR_REVIEW" || draft.draftStudio?.qualityDecision !== "PASS") {
          contact.status = "BLOCKED";
          contact.reasons.push("Draft or quality review incomplete; inspect Draft Studio");
          return { done: true, contact };
        }
        contact.stage = "REVIEW";
      }
      // Fresh eligibility + dependency validation on every final review; no approval or send flags changed.
      const final = await drafts.read(actor, contact.draftId!);
      contact.draftPrepared =
        final.status === "READY_FOR_REVIEW" &&
        final.draftStudio?.qualityDecision === "PASS" &&
        !!final.sequence;
      contact.status = contact.draftPrepared ? "COMPLETED" : "BLOCKED";
      return { done: true, contact };
    },
  };
}
