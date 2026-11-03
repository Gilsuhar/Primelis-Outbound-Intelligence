import "server-only";
import type { SignalEvidence } from "@/features/agent-workforce/signal-opportunity";
import type { CacheScope } from "@/features/agent-workforce/similarweb-cache";
import type { KnowledgeRecord } from "@/features/agent-workforce/gate-a-contracts";
import { ResearchStages, type StageRuntime } from "../company-queue/pipeline";
import type { CompanyJob } from "../company-queue/contracts";
import type { QueueExecutor } from "../company-queue/engine";
import type { ContactDecision } from "./contact";
import { projectSignalEvidence } from "./evidence";
import { evaluateSignal } from "./evaluation";
import { reviewSignalSemantics } from "./semantic-review";

/** Trusted server adapter boundary, never populated from browser-submitted evidence or approval booleans.
 * LIVE registration requires licensed collectors, signalContactDecision and loadApprovedProductKnowledge.
 * There is deliberately no LIVE registration in this milestone.
 */
export interface SignalAdapters {
  mode: CompanyJob["mode"];
  collect(job: CompanyJob, now: Date): Promise<SignalEvidence>;
  /** Trusted tenant/account binding; never derive it from the returned receipt. */
  cacheScope?(job: CompanyJob): CacheScope;
  runtime(job: CompanyJob): StageRuntime;
  // Re-read gates/knowledge at final publication; do not persist email or raw contact history in jobs.
  contact(job: CompanyJob, now: Date): Promise<ContactDecision>;
  knowledge(job: CompanyJob): Promise<KnowledgeRecord[]>;
  /** Trusted registration only; absent by default. No new provider or spending default. */
  semanticReview?: true;
}
export class SignalStages implements QueueExecutor {
  readonly mode: CompanyJob["mode"];
  private readonly grounding: ResearchStages;
  constructor(
    private readonly adapters: SignalAdapters,
    private readonly legacy: QueueExecutor,
  ) {
    this.mode = adapters.mode;
    this.grounding = new ResearchStages(this.mode, (job) => adapters.runtime(job));
  }
  async execute(job: CompanyJob, now: Date) {
    if (!job.workflow) return this.legacy.execute(job, now);
    if (job.mode !== this.mode) throw new Error("QUEUE_MODE_MISMATCH");
    if (job.stage === "SIGNAL_COLLECT") {
      const collected = await this.adapters.collect(job, now);
      if (collected.cachedSearch && collected.cachedSearch.mode !== this.mode)
        throw new Error("CACHE_EVIDENCE_MODE_MISMATCH");
      const projected = projectSignalEvidence(
        job.run,
        collected,
        now,
        this.mode,
        this.adapters.cacheScope?.(job),
      );
      job.signalEvidence = { ...projected.evidence, blockers: projected.blockers };
      job.run.research = {
        ...job.run.research,
        researchedAt: now.toISOString(),
        sources: projected.sources,
        facts: projected.facts,
        gaps: projected.blockers,
      };
      job.stage = "VALIDATE";
      return job;
    }
    const publishing = job.stage === "JUDGE";
    const result = await this.grounding.execute(job, now);
    if (publishing) {
      if (!result.signalEvidence) throw new Error("SIGNAL_CHECKPOINT_MISSING");
      // Adapter failures fail closed, but don't store exception messages or private contact data.
      let contact: ContactDecision = {
        ready: false,
        blockers: ["CONTACT_VERIFICATION_INTEGRATION_UNAVAILABLE"],
        contact: null,
      };
      let knowledge: KnowledgeRecord[] = [];
      try {
        contact = await this.adapters.contact(job, now);
      } catch {
        /* HOLD */
      }
      try {
        knowledge = await this.adapters.knowledge(job);
      } catch {
        /* HOLD */
      }
      result.signalReport = evaluateSignal(
        result.run,
        result.signalEvidence,
        contact,
        knowledge,
        now,
        this.mode,
        this.adapters.cacheScope?.(job),
      );
      if (this.adapters.semanticReview && result.signalReport.eligibility === "Eligible")
        result.signalReport.semanticReview = await reviewSignalSemantics(
          result.run,
          result.signalReport,
          knowledge,
          this.adapters.runtime(result),
          now,
        );
      result.judgement = JSON.stringify({
        factual: JSON.parse(result.judgement!),
        signalOpportunity: result.signalReport.judgement,
        semantic: result.signalReport.semanticReview ?? { status: "NOT_RUN" },
      });
    }
    return result;
  }
}
