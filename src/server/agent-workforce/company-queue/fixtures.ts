import "server-only";
import type { z } from "zod";
import type { WorkforceModel } from "../openai";
import type { CompanyJob } from "./contracts";
import { ResearchStages, type StageRuntime } from "./pipeline";
export const fixtureCompanies = [
  { fixture: "SUPPORTED", companyName: "Simulated Acme", companyDomain: "acme.example" },
  { fixture: "UNSUPPORTED", companyName: "Simulated Birch", companyDomain: "birch.example" },
  { fixture: "RECOVERY", companyName: "Simulated Cedar", companyDomain: "cedar.example" },
] as const;
/** Never imports a provider client or public reader. Unknown fixtures fail, never fall back to LIVE. */
export function fixtureRuntime(job: CompanyJob): StageRuntime {
  const fixture = fixtureCompanies.find((f) => f.fixture === job.fixture);
  if (
    job.mode !== "SIMULATED" ||
    !fixture ||
    fixture.companyName !== job.run.input.companyName ||
    fixture.companyDomain !== job.run.input.companyDomain
  )
    throw new Error("FIXTURE_NOT_ALLOWED");
  const quote = `${fixture.companyName} sells inventory software to retail companies.`;
  const model: WorkforceModel = {
    discover: async () => [`https://${fixture.companyDomain}/`],
    structured: async <T>(
      stage: string,
      schema: z.ZodType<T>,
      _instruction: string,
      raw: unknown,
    ) => {
      const context = raw as {
        sources?: { id: string }[];
        research?: { sources: { id: string }[] };
      };
      const id = (context.sources ?? context.research?.sources)?.[0]?.id;
      if (!id) throw new Error("FIXTURE_SOURCE_MISSING");
      if (stage === "ACCOUNT_RESEARCH")
        return schema.parse({
          facts: [
            {
              id: "account:products",
              subject: "ACCOUNT",
              category: "PRODUCTS",
              statement:
                fixture.fixture === "UNSUPPORTED"
                  ? `${fixture.companyName} guarantees doubled customer revenue.`
                  : quote,
              sourceIds: [id],
              confidence: "HIGH",
              limitations: [],
              quotes: [{ sourceId: id, text: quote }],
            },
          ],
          gaps: ["No approved product relevance or customer performance evidence."],
          assumptions: [],
        });
      if (stage !== "EVIDENCE_VALIDATION") throw new Error("FIXTURE_STAGE_NOT_ALLOWED");
      return schema.parse({
        identityMatches: true,
        supportedFactIds: fixture.fixture === "UNSUPPORTED" ? [] : ["account:products"],
        rejectedFactIds: fixture.fixture === "UNSUPPORTED" ? ["account:products"] : [],
        concerns:
          fixture.fixture === "UNSUPPORTED"
            ? [
                {
                  severity: "BLOCKING",
                  code: "CLAIM_NOT_ENTAILED",
                  scope: "FACT",
                  reason:
                    "The exact source quote describes a product; it does not support a revenue guarantee.",
                  factIds: ["account:products"],
                  sourceIds: [id],
                },
              ]
            : [],
      });
    },
  };
  return {
    mode: "SIMULATED",
    model,
    reader: async (url) => {
      if (url !== `https://${fixture.companyDomain}/`) throw new Error("FIXTURE_URL_NOT_ALLOWED");
      return {
        url,
        title: `${fixture.companyName} — synthetic fixture`,
        text: `${quote} This content is a synthetic offline fixture, not evidence about a real business.`,
      };
    },
    withAccounting: (work) => work(),
  };
}
export const fixtureExecutor = () => new ResearchStages("SIMULATED", fixtureRuntime);
