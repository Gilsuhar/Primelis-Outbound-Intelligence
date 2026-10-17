import "server-only";
import { qualityReviewPassed } from "./oiq";
import { strategyGroundingConcerns } from "./commercial-quality";
import { BudgetError } from "./daily/budget";
import { z } from "zod";
import {
  stages,
  intakeSchema,
  editSchema,
  rejectSchema,
  type WorkforceRun,
} from "@/features/agent-workforce/gate-a-contracts";
import { OpenAiWorkforceModel, WorkforceError, type WorkforceModel } from "./openai";
import { loadApprovedProductKnowledge } from "./knowledge-agent";
import { researchSubject, investigateBrandSearch } from "./research-agents";
import {
  validateResearch,
  validateSequence,
  duplicatesAnotherProspect,
} from "./evidence-validation";
import {
  validateGroundingWithAi,
  chooseSalesStrategy,
  generatePersonalSequence,
  reviewSequenceWithAi,
} from "./creative-agents";
import { checkWorkforceEligibility } from "./safety";
import { PrismaWorkforceStore, digest, type WorkforceStore } from "./store";
import type { SourceReader } from "./public-sources";
export type WorkforceDependencies = {
  studioAuthorized?: boolean;
  store?: WorkforceStore;
  model?: WorkforceModel;
  knowledge?: typeof loadApprovedProductKnowledge;
  eligibility?: typeof checkWorkforceEligibility;
  reader?: SourceReader;
  now?: () => Date;
};
const startSchema = z
  .object({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/), intake: intakeSchema })
  .strict();
export class WorkforceOrchestrator {
  readonly store: WorkforceStore;
  private readonly model: WorkforceModel;
  constructor(private readonly deps: WorkforceDependencies = {}) {
    this.store = deps.store ?? new PrismaWorkforceStore();
    this.model = deps.model ?? new OpenAiWorkforceModel();
  }
  private now() {
    return (this.deps.now ?? (() => new Date()))();
  }
  async start(actor: string, raw: unknown) {
    if (!actor.trim()) throw new Error("UNAUTHENTICATED");
    const input = startSchema.parse(raw);
    return this.store.create(actor, input.idempotencyKey, input.intake, this.now());
  }
  async advance(actor: string, id: string) {
    const original = await this.store.get(actor, id);
    if (!original) throw new Error("NOT_FOUND");
    if (
      original.prospectResearch ||
      (original.draftStudio && !this.deps.studioAuthorized) ||
      original.status !== "RUNNING"
    )
      return original;
    const now = this.now();
    if (original.leaseUntil && Date.parse(original.leaseUntil) > now.getTime()) return original;
    if (original.leaseUntil) {
      const failed = {
        ...original,
        version: original.version + 1,
        status: "GENERATION_FAILED" as const,
        leaseUntil: null,
        issues: [
          "Previous agent request was interrupted. No automatic replay was attempted; start a new run to retry.",
        ],
      };
      await this.store.change(actor, original.version, failed);
      return (await this.store.get(actor, id))!;
    }
    const run = structuredClone(original);
    run.version++;
    run.leaseUntil = new Date(now.getTime() + 110_000).toISOString();
    run.updatedAt = now.toISOString();
    run.events.push({ stage: run.stage, state: "STARTED", at: now.toISOString() });
    if (!(await this.store.change(actor, original.version, run)))
      return (await this.store.get(actor, id))!;
    const claimedVersion = run.version;
    try {
      if (
        run.usage.length >= 12 ||
        run.usage.reduce((n, u) => n + u.inputTokens, 0) > 250_000 ||
        run.usage.reduce((n, u) => n + u.outputTokens, 0) > 45_000
      )
        throw new WorkforceError("MODEL_FAILED", "Run token/call budget exhausted");
      run.eligibility = await (this.deps.eligibility ?? checkWorkforceEligibility)(
        actor,
        run.intake,
        this.now(),
      );
      if (
        run.eligibility.blockDrafting ||
        (["SEQUENCE", "QUALITY_REVIEW"].includes(run.stage) && run.eligibility.status !== "READY")
      ) {
        run.status = "INSUFFICIENT_EVIDENCE";
        run.issues = [
          "Qualification/suppression restrictions block drafting",
          ...run.eligibility.reasons,
        ];
      } else await this.execute(run, actor);
      run.events.push({ stage: original.stage, state: "COMPLETED", at: this.now().toISOString() });
    } catch (error) {
      run.status =
        error instanceof BudgetError
          ? "RUNNING"
          : error instanceof WorkforceError &&
              [
                "NOT_CONFIGURED",
                "WEB_SEARCH_UNAVAILABLE",
                "MISSING_KNOWLEDGE",
                "UNSUPPORTED_EVIDENCE",
              ].includes(error.code)
            ? "RESEARCH_INCOMPLETE"
            : "GENERATION_FAILED";
      run.issues = [
        error instanceof BudgetError
          ? `Processing paused: ${error.code}`
          : error instanceof WorkforceError
            ? error.message
            : "Agent step failed safely. Check database/provider availability; no partial run was approved.",
      ];
      if (error instanceof WorkforceError && error.retryAfterMs && run.draftStudio)
        run.draftStudio.nextRetryAt = new Date(
          this.now().getTime() + error.retryAfterMs,
        ).toISOString();
      run.events.push({ stage: original.stage, state: "FAILED", at: this.now().toISOString() });
    }
    run.leaseUntil = null;
    run.updatedAt = this.now().toISOString();
    run.version++;
    if (!(await this.store.change(actor, claimedVersion, run)))
      return (await this.store.get(actor, id))!;
    return run;
  }
  private async execute(run: WorkforceRun, actor: string) {
    const stage = run.stage;
    if (stage === "KNOWLEDGE")
      run.knowledge = await (this.deps.knowledge ?? loadApprovedProductKnowledge)();
    else if (stage === "ACCOUNT_RESEARCH" || stage === "PROSPECT_INTELLIGENCE") {
      const result = await researchSubject(
        run,
        stage === "ACCOUNT_RESEARCH" ? "ACCOUNT" : "PROSPECT",
        this.model,
        this.deps.reader,
        () => this.now(),
      );
      run.research.sources = [
        ...new Map([...run.research.sources, ...result.sources].map((s) => [s.id, s])).values(),
      ];
      run.research.facts.push(...result.facts);
      run.research.gaps.push(...result.gaps);
      run.research.assumptions.push(...result.assumptions);
      run.research.researchedAt = this.now().toISOString();
      if (!result.sources.length || !result.facts.length) {
        run.status = "RESEARCH_INCOMPLETE";
        run.issues = result.gaps.length
          ? result.gaps
          : ["No source-backed facts found for this subject"];
      }
    } else if (stage === "EVIDENCE_VALIDATION") {
      run.brandSearch = investigateBrandSearch();
      const issues = validateResearch(run, this.now());
      if (issues.length) {
        run.status = "RESEARCH_INCOMPLETE";
        run.issues = issues;
        return;
      }
      const review = await validateGroundingWithAi(run, this.model);
      const expected = new Set(run.research.facts.map((f) => f.id));
      if (
        !review.identityMatches ||
        review.rejectedFactIds.length ||
        review.concerns.length ||
        review.supportedFactIds.length !== expected.size ||
        new Set(review.supportedFactIds).size !== expected.size ||
        review.supportedFactIds.some((id) => !expected.has(id))
      ) {
        run.status = "RESEARCH_INCOMPLETE";
        run.issues = [
          "Evidence critic did not verify every fact and current identity",
          ...review.concerns,
        ];
        return;
      }
    } else if (stage === "STRATEGY") {
      run.strategy = await chooseSalesStrategy(run, this.model);
      const facts = new Set(run.research.facts.map((f) => f.id));
      if (
        run.strategy.prospectId !== run.id ||
        run.strategy.supportingFactIds.some((id) => !facts.has(id))
      )
        throw new WorkforceError(
          "INVALID_MODEL_OUTPUT",
          "Strategy has incorrect identity or unknown evidence references",
        );
      const strategyIssues = strategyGroundingConcerns(run, run.strategy);
      if (
        run.strategy.angle === "NO_PITCH" ||
        !run.strategy.supportingFactIds.length ||
        strategyIssues.length
      ) {
        run.status = "INSUFFICIENT_EVIDENCE";
        run.issues = [...strategyIssues, run.strategy.rationale];
        return;
      }
    } else if (stage === "SEQUENCE") {
      await this.assertKnowledgeCurrent(run);
      run.sequence = await generatePersonalSequence(run, this.model);
      run.critic = null;
      run.issues = validateSequence(run, run.sequence);
      run.contentHash = digest(run.sequence);
    } else if (stage === "QUALITY_REVIEW") {
      await this.assertKnowledgeCurrent(run);
      const researchIssues = validateResearch(run, this.now());
      if (researchIssues.length) {
        run.status = "RESEARCH_INCOMPLETE";
        run.issues = researchIssues;
        return;
      }
      if (!run.sequence) throw new WorkforceError("INVALID_MODEL_OUTPUT", "No sequence to review");
      run.issues = validateSequence(run, run.sequence);
      run.critic = await reviewSequenceWithAi(run, this.model, this.now());
      const critic = run.critic;
      if ((await this.store.list(actor)).some((other) => duplicatesAnotherProspect(run, other)))
        run.issues.push(
          "Draft wording duplicates another prospect after removing identity labels; choose a substantively different approach using only this prospect’s evidence",
        );
      run.issues = [
        ...new Set([...run.issues, ...critic.concerns, ...critic.unsupportedAssertions]),
      ];
      const pass =
        qualityReviewPassed(run, this.now()) &&
        critic.verdict === "PASS" &&
        Object.values(critic.checks).every(Boolean) &&
        new Set(critic.checkedSteps).size === 4 &&
        !run.issues.length;
      if (pass) {
        run.status = "READY_FOR_REVIEW";
        run.sequence.review = { verdict: "NEEDS_REVIEW", concerns: [] };
        run.contentHash = digest(run.sequence);
        return;
      }
      if (critic.oiq?.decision === "BLOCKED") {
        run.status = "GENERATION_FAILED";
        run.sequence.review = { verdict: "HOLD", concerns: run.issues };
        return;
      }
      if (run.revisionAttempts < 1) {
        run.revisionAttempts++;
        run.stage = "SEQUENCE";
        if (!run.issues.length)
          run.issues = [
            "Quality checks did not all pass; rethink the approach for originality, strategic fit, accuracy and coherent progression",
          ];
        return;
      }
      run.status = "GENERATION_FAILED";
      run.sequence.review = {
        verdict: "HOLD",
        concerns: run.issues.length ? run.issues : ["Automated quality review did not pass"],
      };
      return;
    }
    if (run.status === "RUNNING")
      run.stage = stages[Math.min(stages.indexOf(stage) + 1, stages.length - 1)];
  }
  private async assertKnowledgeCurrent(run: WorkforceRun) {
    const current = await (this.deps.knowledge ?? loadApprovedProductKnowledge)();
    if (
      run.knowledge.some(
        (k) =>
          !current.some(
            (c) =>
              c.id === k.id &&
              c.kind === k.kind &&
              c.text === k.text &&
              c.restrictions === k.restrictions &&
              [...c.sourceIds].sort().join("\n") === [...k.sourceIds].sort().join("\n") &&
              [...c.sourceUrls].sort().join("\n") === [...k.sourceUrls].sort().join("\n"),
          ),
      )
    )
      throw new WorkforceError(
        "MISSING_KNOWLEDGE",
        "Approved knowledge changed or was revoked; start new research before drafting",
      );
  }
  async edit(actor: string, id: string, raw: unknown) {
    const input = z.union([editSchema, rejectSchema]).parse(raw);
    const run = await this.store.get(actor, id);
    if (!run) throw new Error("NOT_FOUND");
    if (run.draftStudio && !this.deps.studioAuthorized) throw new Error("DRAFT_STUDIO_REQUIRED");
    if (run.version !== input.expectedVersion || run.status === "RUNNING")
      throw new Error("VERSION_CONFLICT");
    const expected = run.version;
    run.version++;
    run.updatedAt = this.now().toISOString();
    run.approved = false;
    if (input.action === "REJECT") {
      run.status = "REJECTED";
      run.issues = ["Draft rejected by the authenticated reviewer"];
    } else {
      if (!run.sequence) throw new Error("NO_SEQUENCE");
      const eligibility = await (this.deps.eligibility ?? checkWorkforceEligibility)(
        actor,
        run.intake,
        this.now(),
      );
      if (eligibility.status !== "READY" || eligibility.blockDrafting)
        throw new Error("DRAFT_ELIGIBILITY_HOLD");
      run.sequence.messages = input.messages.map((message) => ({
        ...message,
        assertions:
          message.supportingFactIds.length ||
          message.approvedKnowledgeIds.length ||
          (message.supportingObservationIds ?? []).length
            ? [
                {
                  text: message.body,
                  factIds: message.supportingFactIds,
                  knowledgeIds: message.approvedKnowledgeIds,
                  observationIds: message.supportingObservationIds ?? [],
                },
              ]
            : [],
      }));
      run.sequence.review = {
        verdict: "NEEDS_REVIEW",
        concerns: [],
      };
      run.status = "RUNNING";
      run.stage = "QUALITY_REVIEW";
      run.revisionAttempts = 1;
      run.critic = null;
      run.issues = [];
      run.contentHash = digest(run.sequence);
    }
    if (!(await this.store.change(actor, expected, run))) throw new Error("VERSION_CONFLICT");
    return run;
  }
}
