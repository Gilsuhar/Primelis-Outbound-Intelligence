import { assertPreviewOperation } from "@/lib/preview-policy.mjs";
import "server-only";
import { z } from "zod";
import {
  companyInputSchema,
  companyRunSchema,
  type CompanyRun,
} from "@/features/agent-workforce/company-research/contracts";
import { companyGroundingReviewSchema } from "@/features/agent-workforce/company-research/grounding-review";
import { withBudgetContext, BudgetError } from "../daily/budget";
import type { DailyStore } from "../daily/state";
import { OpenAiWorkforceModel, WorkforceError, type WorkforceModel } from "../openai";
import { researchSubject } from "../research-agents";
import { validateResearch } from "../evidence-validation";
import { validateCompanyGroundingWithAi } from "./grounding-review";
import { digest } from "../store";
import { allowedSourceUrl, type SourceReader } from "../public-sources";
import { localCompanyAiConfig } from "./config";
import { LocalCompanyBudgetStore, PrismaCompanyStore, type CompanyStore } from "./store";
import { logCompanySourceDiagnostic } from "../source-diagnostics";
import { buildGroundingAudit } from "./grounding-audit";

type Dependencies = {
  store?: CompanyStore;
  budgetStore?: DailyStore;
  model?: () => WorkforceModel;
  reader?: SourceReader;
  now?: () => Date;
};
export async function runCompanyResearch(
  actor: string,
  raw: unknown,
  key: string,
  deps: Dependencies = {},
) {
  assertPreviewOperation("ai-execution");
  const input = companyInputSchema.parse(raw);
  if (!allowedSourceUrl(`https://${input.companyDomain}/`))
    throw new Error("INVALID_COMPANY_DOMAIN");
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(key)) throw new Error("INVALID_REQUEST_KEY");
  // Validate opt-in and limits before persistence, retrieval, or model construction.
  const config = localCompanyAiConfig(actor);
  const store = deps.store ?? new PrismaCompanyStore();
  const now = deps.now ?? (() => new Date());
  const id = "company-" + digest({ actor, key });
  const at = now().toISOString();
  const run: CompanyRun = companyRunSchema.parse({
    version: 1,
    id,
    input,
    createdAt: at,
    updatedAt: at,
    status: "RUNNING",
    research: {
      accountDomain: input.companyDomain,
      prospectId: id,
      researchedAt: at,
      sources: [],
      facts: [],
      assumptions: [],
      gaps: [],
    },
    issues: [],
    usage: [],
    approved: false,
    canSend: false,
    canEnroll: false,
  });
  if (!(await store.create(actor, run))) {
    const saved = await store.get(actor, id);
    if (!saved || digest(saved.input) !== digest(input)) throw new Error("IDEMPOTENCY_CONFLICT");
    return saved;
  }
  try {
    await withBudgetContext(
      { actor, config: config.budget, store: deps.budgetStore ?? new LocalCompanyBudgetStore() },
      async () => {
        const model = deps.model
          ? deps.model()
          : new OpenAiWorkforceModel(config.providerEnv, undefined, config.modelOptions);
        const context = { id, intake: input, research: run.research, usage: run.usage };
        const result = await researchSubject(context, "ACCOUNT", model, deps.reader, now, {
          tryRemainingCandidates: true,
          onDiagnostic: logCompanySourceDiagnostic,
        });
        run.research = { ...run.research, ...result, researchedAt: now().toISOString() };
        context.research = run.research;
        const issues = validateResearch(context, now(), { company: true, prospect: false });
        if (result.facts.some((f) => f.subject !== "ACCOUNT" || !f.id.startsWith("account:")))
          issues.push("Only company facts with account identifiers are permitted");
        logCompanySourceDiagnostic({
          stage: "VALIDATION",
          outcome: issues.length ? "EVIDENCE_REJECTED" : "EVIDENCE_ACCEPTED",
          sourceCount: result.sources.length,
          factCount: result.facts.length,
          issueCount: issues.length,
        });
        if (issues.length) {
          run.status = "INCOMPLETE";
          run.issues = issues;
          run.research.facts = [];
          return;
        }
        let review;
        try {
          review = companyGroundingReviewSchema.parse(
            await validateCompanyGroundingWithAi(context, model),
          );
        } catch (error) {
          run.groundingAudit = buildGroundingAudit(
            run.research,
            error instanceof z.ZodError ||
              (error instanceof WorkforceError && error.code === "INVALID_MODEL_OUTPUT")
              ? "MALFORMED"
              : "UNAVAILABLE",
          );
          throw error;
        }
        run.groundingAudit = buildGroundingAudit(run.research, review);
        if (run.groundingAudit.status !== "ACCEPTED") {
          run.status = "INCOMPLETE";
          logCompanySourceDiagnostic({ stage: "VALIDATION", outcome: "GROUNDING_REJECTED" });
          run.issues = [
            "Independent grounding/identity review failed; extracted facts were withheld",
          ];
          run.research.facts = [];
          return;
        }
        logCompanySourceDiagnostic({
          stage: "VALIDATION",
          outcome: "GROUNDING_ACCEPTED",
          factCount: result.facts.length,
        });
        run.status = "REVIEW_REQUIRED";
      },
    );
  } catch (error) {
    logCompanySourceDiagnostic({ stage: "PIPELINE", outcome: "FAILED" });
    run.status = "FAILED";
    run.research.facts = [];
    run.issues = [
      error instanceof BudgetError
        ? error.code
        : error instanceof WorkforceError
          ? error.code
          : "Company research failed; diagnostic details withheld",
    ];
  }
  run.updatedAt = now().toISOString();
  await store.finish(actor, companyRunSchema.parse(run));
  return run;
}
