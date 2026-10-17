import "server-only";
import { qualityReviewPassed, oiqContentHash } from "../oiq";
import { z } from "zod";
import { messageSchema, type WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { snapshotSchema } from "@/server/services/sales-agent-collection-service";
import { PrismaEvidenceStore, type EvidenceStore } from "@/server/sales-agent/evidence-store";
import { isInOwnedIntakeScope } from "@/features/sales-agent/intake-scope";
import { PrismaWorkforceStore, digest, type WorkforceStore } from "../store";
import { checkWorkforceEligibility } from "../safety";
import { loadApprovedProductKnowledge } from "../knowledge-agent";
import { validateResearch, validateSequence } from "../evidence-validation";
import { WorkforceOrchestrator } from "../orchestrator";
import { OpenAiWorkforceModel, type WorkforceModel } from "../openai";
import { researchIdentity } from "../prospect-research/engine";
const mutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("EDIT"),
      expectedVersion: z.number().int().positive(),
      messages: z.array(messageSchema).length(4),
      requestKey: z.string().min(8).max(100),
    })
    .strict(),
  z
    .object({
      action: z.enum(["APPROVE", "REJECT", "REGENERATE"]),
      expectedVersion: z.number().int().positive(),
      requestKey: z.string().min(8).max(100),
    })
    .strict(),
]);
type Dependencies = {
  maxRetries?: number;
  store?: WorkforceStore;
  evidence?: EvidenceStore;
  eligibility?: typeof checkWorkforceEligibility;
  knowledge?: typeof loadApprovedProductKnowledge;
  model?: () => WorkforceModel;
  now?: () => Date;
};
const messagesHash = (run: WorkforceRun) => (run.sequence ? digest(run.sequence) : null);
/** Whole approved records only: preserve approved wording/restrictions while bounding writer context. */
function relevantKnowledge(knowledge: WorkforceRun["knowledge"], source: WorkforceRun) {
  const terms = new Set(
    (source.intake.prospectTitle + " " + source.research.facts.map((f) => f.statement).join(" "))
      .toLowerCase()
      .match(/[a-z]{4,}/g) ?? [],
  );
  const scored = [...knowledge].sort((a, b) => {
    const score = (k: typeof a) =>
      (k.kind === "PRODUCT" ? 10000 : 0) +
      [...new Set((k.title + " " + k.text).toLowerCase().match(/[a-z]{4,}/g) ?? [])].filter(
        (term) => terms.has(term),
      ).length;
    return score(b) - score(a) || a.id.localeCompare(b.id);
  });
  const selected: typeof knowledge = [];
  let bytes = 0;
  for (const record of scored) {
    const size = JSON.stringify(record).length;
    if (selected.length < 12 && bytes + size <= 32000) {
      selected.push(record);
      bytes += size;
    }
  }
  return selected;
}
export class DraftStudioEngine {
  readonly store: WorkforceStore;
  private readonly evidence: EvidenceStore;
  constructor(private readonly deps: Dependencies = {}) {
    this.store = deps.store ?? new PrismaWorkforceStore();
    this.evidence = deps.evidence ?? new PrismaEvidenceStore();
  }
  private now() {
    return (this.deps.now ?? (() => new Date()))();
  }
  private async context(actor: string, sourceId: string) {
    const source = await this.store.get(actor, sourceId);
    if (!source?.prospectResearch || !source.intake.hubspotRecordId)
      throw new Error("RESEARCH_REQUIRED");
    const id = source.intake.hubspotRecordId;
    const related = await (this.store.byContact?.(actor, id) ?? this.store.list(actor));
    if (
      related.some(
        (r) =>
          r.prospectResearch &&
          r.id !== source.id &&
          r.createdAt > source.createdAt &&
          r.intake.hubspotRecordId === id &&
          r.prospectResearch.stages.REVIEW.status === "COMPLETE" &&
          r.prospectResearch.status !== "STALE",
      )
    )
      throw new Error("RESEARCH_REVIEW_REQUIRED");
    const raw = this.evidence.find
      ? await this.evidence.find(actor, id)
      : (await this.evidence.list(actor)).find(
          (s) => snapshotSchema.safeParse(s).data?.contact.hubspotRecordId === id,
        );
    const snapshot = snapshotSchema.parse(raw);
    const eligibility = await (this.deps.eligibility ?? checkWorkforceEligibility)(
      actor,
      source.intake,
      this.now(),
    );
    if (eligibility.status !== "READY" || eligibility.blockDrafting)
      throw new Error("DRAFT_ELIGIBILITY_HOLD");
    if (
      !isInOwnedIntakeScope(snapshot.contact) ||
      !snapshot.integrationReceipts?.HUBSPOT ||
      researchIdentity(snapshot) !== source.prospectResearch.identityHash
    )
      throw new Error("RESEARCH_IDENTITY_CHANGED");
    if (
      source.prospectResearch.status === "STALE" ||
      Date.parse(source.prospectResearch.expiresAt) <= this.now().getTime() ||
      source.prospectResearch.stages.COMPANY.status !== "COMPLETE" ||
      source.prospectResearch.stages.CONTACT.status !== "COMPLETE" ||
      source.prospectResearch.stages.REVIEW.status !== "COMPLETE" ||
      source.prospectResearch.reviewIssues.length ||
      validateResearch(source, this.now()).length
    )
      throw new Error("RESEARCH_REVIEW_REQUIRED");
    const knowledge = await (this.deps.knowledge ?? loadApprovedProductKnowledge)();
    if (!knowledge.some((k) => k.kind === "PRODUCT"))
      throw new Error("APPROVED_KNOWLEDGE_REQUIRED");
    const suppression = [...(await this.evidence.suppressionRecords())].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
    const dependencyHash = digest({
      identity: snapshot.contact,
      observations: snapshot.observations,
      verification: snapshot.verification,
      suppression,
      research: source.research,
      serp: source.prospectResearch.serp,
      opportunity: source.prospectResearch.opportunity,
      researchExpiresAt: source.prospectResearch.expiresAt,
      knowledge: knowledge
        .map((k) => ({
          ...k,
          sourceIds: [...k.sourceIds].sort(),
          sourceUrls: [...k.sourceUrls].sort(),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
    return { source, knowledge, dependencyHash, eligibility };
  }
  async prepare(actor: string, sourceId: string) {
    const ctx = await this.context(actor, sourceId);
    let run = await this.store.create(
      actor,
      "draft-" + digest({ sourceId, dependencyHash: ctx.dependencyHash }),
      ctx.source.intake,
      this.now(),
    );
    for (
      let recovery = 0;
      run.draftStudio?.reviewStatus === "INVALIDATED" && recovery < 3;
      recovery++
    ) {
      run = await this.store.create(
        actor,
        "draft-recovery-" + digest({ previous: run.id, dependencyHash: ctx.dependencyHash }),
        ctx.source.intake,
        this.now(),
      );
    }
    if (run.draftStudio) return this.read(actor, run.id);
    const expected = run.version;
    run.version++;
    run.stage = "STRATEGY";
    run.research = { ...structuredClone(ctx.source.research), prospectId: run.id };
    run.knowledge = relevantKnowledge(ctx.knowledge, ctx.source);
    run.eligibility = ctx.eligibility;
    run.brandSearch.gaps =
      ctx.source.prospectResearch!.stages.SERP.status === "COMPLETE"
        ? [
            "See the attributed SERP snapshot in personalization context. It does not establish a persistent pattern.",
          ]
        : ctx.source.prospectResearch!.stages.SERP.detail
          ? [ctx.source.prospectResearch!.stages.SERP.detail]
          : ["SERP data unavailable"];
    run.draftStudio = {
      sourceRunId: sourceId,
      dependencyHash: ctx.dependencyHash,
      qualityDecision: null,
      reviewStatus: "PENDING",
      approval: null,
      context: {
        serp: structuredClone(ctx.source.prospectResearch!.serp),
        opportunity: structuredClone(ctx.source.prospectResearch!.opportunity),
        missingInformation: [
          ...ctx.source.research.gaps,
          ctx.source.prospectResearch!.similarweb.requiredAccess,
          ...run.brandSearch.gaps,
        ].slice(0, 30),
        personalizationMode:
          ctx.source.prospectResearch!.opportunity?.recommendedAngle === "NO_PITCH"
            ? "ROLE_RELEVANT"
            : "EVIDENCE_LED",
      },
      versions: [],
      events: [{ at: this.now().toISOString(), actor, action: "CREATED", contentHash: null }],
      regenerations: 0,
      failures: 0,
      nextRetryAt: null,
    };
    await this.store.change(actor, expected, run);
    return this.read(actor, run.id);
  }
  async prepareContact(actor: string, contactId: string) {
    const runs = await (this.store.byContact?.(actor, contactId) ?? this.store.list(actor));
    const prior = runs
      .filter((r) => r.draftStudio && r.intake.hubspotRecordId === contactId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (prior) await this.read(actor, prior.id);
    const source = runs
      .filter((r) => r.intake.hubspotRecordId === contactId && r.prospectResearch)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!source) throw new Error("RESEARCH_REQUIRED");
    return this.prepare(actor, source.id);
  }
  private async invalidate(actor: string, run: WorkforceRun, reason: string) {
    const expected = run.version;
    run.version++;
    run.updatedAt = this.now().toISOString();
    run.leaseUntil = null;
    run.status = "INSUFFICIENT_EVIDENCE";
    const meta = run.draftStudio!;
    meta.reviewStatus = "INVALIDATED";
    meta.approval = null;
    meta.qualityDecision = "BLOCKED";
    meta.events.push({
      at: this.now().toISOString(),
      actor,
      action: "INVALIDATED",
      contentHash: messagesHash(run),
    });
    run.issues = [reason];
    if (meta.events.length > 60) meta.events = meta.events.slice(-60);
    await this.store.change(actor, expected, run);
    const current = (await this.store.get(actor, run.id))!;
    return this.redact(current);
  }
  private redact(run: WorkforceRun) {
    const view = structuredClone(run);
    view.sequence = null;
    if (view.draftStudio) {
      view.draftStudio.approval = null;
      view.draftStudio.versions = view.draftStudio.versions.map((v) => ({ ...v, messages: null }));
    }
    return view;
  }
  async read(actor: string, id: string): Promise<WorkforceRun> {
    const run = await this.store.get(actor, id);
    if (!run?.draftStudio) throw new Error("NOT_FOUND");
    try {
      const ctx = await this.context(actor, run.draftStudio.sourceRunId);
      if (ctx.dependencyHash !== run.draftStudio.dependencyHash)
        throw new Error("DRAFT_DEPENDENCIES_CHANGED");
      if (run.draftStudio.reviewStatus === "INVALIDATED") return this.redact(run);
      const approval = run.draftStudio.approval;
      if (
        approval &&
        (approval.actor !== actor ||
          approval.contentHash !== messagesHash(run) ||
          approval.dependencyHash !== ctx.dependencyHash ||
          run.status !== "READY_FOR_REVIEW" ||
          run.draftStudio.qualityDecision !== "PASS" ||
          !qualityReviewPassed(run, this.now()) ||
          validateSequence(run, run.sequence!).length)
      )
        throw new Error("APPROVAL_INVALIDATED");
      if (run.status === "READY_FOR_REVIEW" && !qualityReviewPassed(run, this.now())) {
        run.draftStudio.qualityDecision =
          run.critic?.oiq?.decision === "BLOCKED" ? "BLOCKED" : "REVISE";
        run.issues = [...new Set([...run.issues, "OIQ_REVIEW_REQUIRED"])];
      }
      return run;
    } catch (error) {
      if (run.draftStudio.reviewStatus === "INVALIDATED") return this.redact(run);
      const reason =
        error instanceof Error &&
        [
          "DRAFT_ELIGIBILITY_HOLD",
          "DRAFT_DEPENDENCIES_CHANGED",
          "RESEARCH_IDENTITY_CHANGED",
          "RESEARCH_REVIEW_REQUIRED",
          "APPROVED_KNOWLEDGE_REQUIRED",
          "APPROVAL_INVALIDATED",
        ].includes(error.message)
          ? error.message
          : "Current eligibility, research or approved knowledge cannot be verified";
      return this.invalidate(actor, run, reason);
    }
  }
  private snapshotVersion(run: WorkforceRun, origin: "AI" | "HUMAN") {
    if (!run.sequence) return;
    const meta = run.draftStudio!;
    const hash = messagesHash(run)!;
    const latest = meta.versions.at(-1);
    if (latest?.contentHash !== hash) {
      if (meta.versions.length >= 10) throw new Error("VERSION_LIMIT_REACHED");
      meta.versions.push({
        number: meta.versions.length + 1,
        at: this.now().toISOString(),
        origin,
        contentHash: hash,
        messages: structuredClone(run.sequence.messages),
        qualityDecision: "PENDING",
      });
    }
    // An identical rewrite is still the same content version. Keep its historical
    // assessment while a fresh review is pending; never use that history as current approval.
    if (run.critic?.oiq?.contentHash === oiqContentHash(run))
      meta.versions.at(-1)!.oiq = structuredClone(run.critic.oiq);
    meta.versions.at(-1)!.qualityDecision =
      run.status === "READY_FOR_REVIEW" ? "PASS" : (meta.qualityDecision ?? "PENDING");
  }
  async advance(actor: string, id: string) {
    let run = await this.read(actor, id);
    if (
      !run.draftStudio ||
      run.draftStudio.reviewStatus === "INVALIDATED" ||
      run.status !== "RUNNING"
    )
      return run;
    const meta = run.draftStudio;
    if (meta.nextRetryAt && Date.parse(meta.nextRetryAt) > this.now().getTime()) return run;
    if (run.leaseUntil && Date.parse(run.leaseUntil) > this.now().getTime()) return run;
    if (run.leaseUntil) {
      const expected = run.version;
      run.version++;
      run.leaseUntil = null;
      meta.failures++;
      meta.events.push({
        at: this.now().toISOString(),
        actor,
        action: "RETRY",
        contentHash: messagesHash(run),
      });
      if (meta.failures >= Math.min(3, (this.deps.maxRetries ?? 2) + 1)) {
        run.status = "GENERATION_FAILED";
        meta.qualityDecision = "BLOCKED";
      }
      if (!(await this.store.change(actor, expected, run))) return this.read(actor, id);
      if (run.status !== "RUNNING") return run;
    }
    if (meta.versions.length >= 10 && run.stage === "SEQUENCE") {
      const expected = run.version;
      run.version++;
      run.status = "GENERATION_FAILED";
      meta.qualityDecision = "BLOCKED";
      run.issues = ["Draft version limit reached; human review required"];
      await this.store.change(actor, expected, run);
      return this.read(actor, id);
    }
    const previousStage = run.stage;
    const orchestrator = new WorkforceOrchestrator({
      store: this.store,
      model: (
        this.deps.model ??
        (() =>
          new OpenAiWorkforceModel(
            run.revisionAttempts > 0 && process.env.OPENAI_ESCALATION_MODEL
              ? {
                  ...process.env,
                  OPENAI_WRITING_MODEL: process.env.OPENAI_ESCALATION_MODEL,
                  OPENAI_QUALITY_MODEL: process.env.OPENAI_ESCALATION_MODEL,
                }
              : process.env,
          ))
      )(),
      knowledge: this.deps.knowledge,
      eligibility: this.deps.eligibility,
      now: this.deps.now,
      studioAuthorized: true,
    });
    run = await orchestrator.advance(actor, id);
    if (run.leaseUntil) return run;
    // Recheck all dependencies after external provider work, before exposing the output.
    const completedVersion = run.version;
    const checked = await this.read(actor, id);
    if (
      checked.draftStudio!.reviewStatus === "INVALIDATED" ||
      checked.version !== completedVersion ||
      checked.leaseUntil
    )
      return checked;
    run = checked;
    const expected = run.version;
    run.version++;
    const current = run.draftStudio!;
    current.approval = null;
    current.qualityDecision =
      run.status === "READY_FOR_REVIEW"
        ? "PASS"
        : run.critic?.verdict === "HOLD" || run.critic?.unsupportedAssertions.length
          ? "BLOCKED"
          : run.critic?.verdict === "REVISE"
            ? "REVISE"
            : null;
    if (
      previousStage === "QUALITY_REVIEW" &&
      run.status === "RUNNING" &&
      run.stage === "SEQUENCE" &&
      !current.qualityDecision
    )
      current.qualityDecision = run.issues.some((issue) =>
        /unsupported|unknown evidence|incorrect identity/i.test(issue),
      )
        ? "BLOCKED"
        : "REVISE";
    if (
      run.status === "GENERATION_FAILED" &&
      !run.critic &&
      current.failures < Math.min(3, (this.deps.maxRetries ?? 2) + 1)
    ) {
      current.failures++;
      if (current.failures < Math.min(3, (this.deps.maxRetries ?? 2) + 1)) {
        run.status = "RUNNING";
        current.nextRetryAt = new Date(
          Math.max(
            this.now().getTime() + 60000 * 2 ** (current.failures - 1),
            current.nextRetryAt ? Date.parse(current.nextRetryAt) : 0,
          ),
        ).toISOString();
      } else current.qualityDecision = "BLOCKED";
    } else current.nextRetryAt = null;
    if (
      run.status === "GENERATION_FAILED" ||
      run.status === "RESEARCH_INCOMPLETE" ||
      run.status === "INSUFFICIENT_EVIDENCE"
    )
      current.qualityDecision = "BLOCKED";
    this.snapshotVersion(
      run,
      previousStage === "QUALITY_REVIEW" && current.versions.at(-1)?.origin === "HUMAN"
        ? "HUMAN"
        : "AI",
    );
    await this.store.change(actor, expected, run);
    return this.read(actor, id);
  }
  async mutate(actor: string, id: string, raw: unknown) {
    const input = mutationSchema.parse(raw);
    const run = await this.read(actor, id);
    const meta = run.draftStudio!;
    // Request-key action receipts remain independent of changing content/version counters.
    const receipt = meta.events.find((e) => e.requestKey === input.requestKey);
    if (receipt) {
      if (receipt.requestHash !== digest(input)) throw new Error("IDEMPOTENCY_CONFLICT");
      return run;
    }
    if (meta.reviewStatus === "INVALIDATED") throw new Error("DRAFT_ELIGIBILITY_HOLD");
    if (run.version !== input.expectedVersion || run.status === "RUNNING" || run.leaseUntil)
      throw new Error("VERSION_CONFLICT");
    if (meta.versions.length >= 10 && ["EDIT", "REGENERATE"].includes(input.action))
      throw new Error("VERSION_LIMIT_REACHED");
    const expected = run.version;
    run.version++;
    const current = run.draftStudio!;
    current.approval = null;
    current.reviewStatus = "PENDING";
    if (input.action === "APPROVE") {
      if (
        run.status !== "READY_FOR_REVIEW" ||
        current.qualityDecision !== "PASS" ||
        !qualityReviewPassed(run, this.now()) ||
        !run.sequence ||
        validateSequence(run, run.sequence).length
      )
        throw new Error("QUALITY_REVIEW_REQUIRED");
      current.approval = {
        actor,
        at: this.now().toISOString(),
        contentHash: messagesHash(run)!,
        dependencyHash: current.dependencyHash,
        scope: "CONTENT_REVIEW_ONLY",
      };
      current.reviewStatus = "CONTENT_APPROVED";
    } else if (input.action === "REJECT") {
      run.status = "REJECTED";
      current.reviewStatus = "REJECTED";
    } else if (input.action === "REGENERATE") {
      if (current.regenerations >= 3) throw new Error("REGENERATION_LIMIT_REACHED");
      current.regenerations++;
      run.status = "RUNNING";
      run.stage = run.strategy && run.strategy.angle !== "NO_PITCH" ? "SEQUENCE" : "STRATEGY";
      run.critic = null;
      run.revisionAttempts = 0;
      run.issues = [
        "Human requested fresh wording using the same verified research. Explore a different narrative without adding unsupported evidence.",
      ];
      current.qualityDecision = null;
    } else if ("messages" in input) {
      if (!run.sequence) throw new Error("NO_SEQUENCE");
      run.sequence.messages = input.messages.map((message) => ({
        ...message,
        assertions:
          message.supportingFactIds.length ||
          message.approvedKnowledgeIds.length ||
          message.supportingObservationIds.length
            ? [
                {
                  text: message.body,
                  factIds: message.supportingFactIds,
                  knowledgeIds: message.approvedKnowledgeIds,
                  observationIds: message.supportingObservationIds,
                },
              ]
            : [],
      }));
      run.sequence.review = { verdict: "NEEDS_REVIEW", concerns: [] };
      run.status = "RUNNING";
      run.stage = "QUALITY_REVIEW";
      run.critic = null;
      run.revisionAttempts = 1;
      run.issues = [];
      current.qualityDecision = null;
      this.snapshotVersion(run, "HUMAN");
    }
    current.events.push({
      at: this.now().toISOString(),
      actor,
      requestKey: input.requestKey,
      requestHash: digest(input),
      action:
        input.action === "EDIT"
          ? "EDITED"
          : input.action === "REGENERATE"
            ? "REGENERATED"
            : input.action === "APPROVE"
              ? "APPROVED"
              : "REJECTED",
      contentHash: messagesHash(run),
    });
    run.contentHash = messagesHash(run);
    run.updatedAt = this.now().toISOString();
    if (!(await this.store.change(actor, expected, run))) throw new Error("VERSION_CONFLICT");
    return this.read(actor, id);
  }
}
