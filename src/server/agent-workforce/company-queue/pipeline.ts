import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { sourceSchema } from "@/features/agent-workforce/gate-a-contracts";
import { companyGroundingReviewSchema } from "@/features/agent-workforce/company-research/grounding-review";
import { allowedSourceUrl, type SourceReader } from "../public-sources";
import { sourceDiagnosticUrl, sourceFailureReason } from "../source-diagnostics";
import { extractRetrievedResearch } from "../research-agents";
import { validateResearch } from "../evidence-validation";
import { WorkforceError, type WorkforceModel } from "../openai";
import { validateCompanyGroundingWithAi } from "../company-research/grounding-review";
import { buildGroundingAudit } from "../company-research/grounding-audit";
import { judgeCompanyResearch } from "../company-research/judgement";
import type { CompanyJob } from "./contracts";
import type { QueueExecutor } from "./engine";

export type StageRuntime = {
  mode: CompanyJob["mode"];
  model: WorkforceModel;
  reader: SourceReader;
  /** LIVE adapter must use the existing budget reservation context. No LIVE adapter is enabled here. */
  withAccounting<T>(work: () => Promise<T>): Promise<T>;
};
export class ResearchStages implements QueueExecutor {
  constructor(
    readonly mode: CompanyJob["mode"],
    private readonly runtime: (job: CompanyJob) => StageRuntime,
  ) {}
  async execute(job: CompanyJob, now: Date) {
    const runtime = this.runtime(job);
    if (runtime.mode !== this.mode || job.mode !== this.mode)
      throw new Error("QUEUE_MODE_MISMATCH");
    const run = job.run,
      input = run.input;
    const context = { id: run.id, intake: input, research: run.research, usage: run.usage };
    const diagnostic = (code: string, sourceUrl?: string) => {
      job.diagnostics.push({ stage: job.stage, code, ...(sourceUrl ? { sourceUrl } : {}) });
    };
    if (job.stage === "DISCOVER") {
      const urls = await runtime.withAccounting(() =>
        runtime.model.discover(
          `${input.companyName} ${input.companyDomain} business products markets official company news`,
          run.usage,
        ),
      );
      for (const raw of [`https://${input.companyDomain}/`, ...urls.slice(0, 6)]) {
        if (!allowedSourceUrl(raw)) {
          diagnostic("URL_REJECTED", sourceDiagnosticUrl(raw));
          continue;
        }
        const url = new URL(raw).href;
        if (!job.candidates.includes(url)) job.candidates.push(url);
      }
      job.stage = "RETRIEVE";
    } else if (job.stage === "RETRIEVE") {
      const url = job.candidates[job.cursor];
      if (url && run.research.sources.length < 3) {
        try {
          const page = await runtime.reader(url);
          if (page.url !== url || !allowedSourceUrl(page.url)) throw new Error("SOURCE_REDIRECT");
          const excerpt = page.text.slice(0, 18000);
          const source = sourceSchema.parse({
            id:
              "web:" +
              createHash("sha256")
                .update(page.url + excerpt)
                .digest("hex")
                .slice(0, 20),
            url,
            title: page.title,
            excerpt,
            observedAt: now.toISOString(),
            sourceType:
              new URL(url).hostname.replace(/^www\./, "") ===
              input.companyDomain.replace(/^www\./, "")
                ? "COMPANY_SITE"
                : "PUBLIC_WEB",
          });
          if (!run.research.sources.some((s) => s.id === source.id))
            run.research.sources.push(source);
          diagnostic("CONTENT_ACCEPTED", sourceDiagnosticUrl(url));
        } catch (error) {
          diagnostic(sourceFailureReason(error), sourceDiagnosticUrl(url));
        }
        job.cursor++;
      }
      if (job.cursor >= job.candidates.length || run.research.sources.length === 3)
        job.stage = "EXTRACT";
    } else if (job.stage === "EXTRACT") {
      if (run.research.sources.length)
        Object.assign(
          run.research,
          await runtime.withAccounting(() =>
            extractRetrievedResearch(
              "ACCOUNT",
              input,
              run.research.sources,
              runtime.model,
              run.usage,
            ),
          ),
        );
      else
        run.research.gaps = [
          "No permitted source content retrieved; no substitute facts generated.",
        ];
      run.research.researchedAt = now.toISOString();
      job.stage = "VALIDATE";
    } else if (job.stage === "VALIDATE") {
      run.issues = validateResearch(context, now, { company: true, prospect: false });
      if (run.research.facts.some((f) => f.subject !== "ACCOUNT" || !f.id.startsWith("account:")))
        run.issues.push("Only company facts are permitted");
      if (
        run.research.sources.some(
          (s) =>
            s.id !==
            "web:" +
              createHash("sha256")
                .update(s.url + s.excerpt)
                .digest("hex")
                .slice(0, 20),
        )
      )
        run.issues.push("Source content identity mismatch");
      if (run.issues.length) {
        run.research.facts = [];
        run.status = "INCOMPLETE";
        job.stage = "JUDGE";
        diagnostic("EVIDENCE_REJECTED");
      } else job.stage = "REVIEW";
    } else if (job.stage === "REVIEW") {
      try {
        const review = companyGroundingReviewSchema.parse(
          await runtime.withAccounting(() =>
            validateCompanyGroundingWithAi(context, runtime.model),
          ),
        );
        run.groundingAudit = buildGroundingAudit(run.research, review);
      } catch (error) {
        run.groundingAudit = buildGroundingAudit(
          run.research,
          error instanceof z.ZodError ||
            (error instanceof WorkforceError && error.code === "INVALID_MODEL_OUTPUT")
            ? "MALFORMED"
            : "UNAVAILABLE",
        );
        // A LIVE transport failure may have spent money. Preserve the request marker and HOLD.
        if (this.mode === "LIVE") throw error;
      }
      if (run.groundingAudit.status === "ACCEPTED") run.status = "REVIEW_REQUIRED";
      else {
        run.status = "INCOMPLETE";
        run.research.facts = [];
        run.issues = ["Independent grounding review did not accept the candidates"];
      }
      diagnostic(run.status === "REVIEW_REQUIRED" ? "GROUNDING_ACCEPTED" : "GROUNDING_REJECTED");
      job.stage = "JUDGE";
    } else if (job.stage === "JUDGE") {
      // Freshness can change across restarts. Revalidate before publishing a result.
      const issues = validateResearch(context, now, { company: true, prospect: false });
      if (issues.length && run.status === "REVIEW_REQUIRED") {
        run.issues = issues;
        run.status = "INCOMPLETE";
        run.research.facts = [];
      }
      job.judgement = JSON.stringify(
        judgeCompanyResearch(
          run,
          now,
          this.mode === "SIMULATED" ? "OFFLINE_SIMULATION" : "SAVED_RUN",
        ),
      );
      job.stage = "DONE";
    } else throw new Error("INVALID_QUEUE_STAGE");
    return job;
  }
}
