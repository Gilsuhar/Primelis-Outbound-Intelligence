import type { z } from "zod";
import type { WorkforceIntake, WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { initialRun, type WorkforceStore } from "@/server/agent-workforce/store";
import type { WorkforceModel } from "@/server/agent-workforce/openai";
export const testNow = new Date("2026-10-15T18:00:00Z");
export const workforceIntake: WorkforceIntake = {
  companyName: "Test Company",
  companyDomain: "example.com",
  prospectName: "Test Person",
  prospectTitle: "Head of Paid Search",
  targetMarket: "United Kingdom",
};
export const testKnowledge = [
  {
    id: "product-1",
    kind: "PRODUCT" as const,
    title: "Approved fictional test product record",
    text: "Signal monitors branded search conditions.",
    sourceIds: ["approved-test-source"],
    sourceUrls: ["https://example.com/approved"],
    restrictions: "",
  },
];
export class MemoryWorkforceStore implements WorkforceStore {
  records = new Map<string, WorkforceRun>();
  private key(actor: string, id: string) {
    return `${actor}:${id}`;
  }
  async create(actor: string, key: string, input: WorkforceIntake, now: Date) {
    const run = initialRun(actor, key, input, now);
    const k = this.key(actor, run.id);
    const prior = this.records.get(k);
    if (prior && prior.inputHash !== run.inputHash) throw new Error("IDEMPOTENCY_CONFLICT");
    if (!prior) this.records.set(k, structuredClone(run));
    return structuredClone(prior ?? run);
  }
  async get(actor: string, id: string) {
    return structuredClone(this.records.get(this.key(actor, id)) ?? null);
  }
  async list(actor: string) {
    return structuredClone(
      [...this.records].filter(([k]) => k.startsWith(actor + ":")).map(([, r]) => r),
    );
  }
  async change(actor: string, expected: number, run: WorkforceRun) {
    const key = this.key(actor, run.id);
    if (this.records.get(key)?.version !== expected) return false;
    this.records.set(key, structuredClone(run));
    return true;
  }
}
export class MockWorkforceModel implements WorkforceModel {
  calls: string[] = [];
  revise = false;
  malformed = false;
  async discover(_query: string, usage: WorkforceRun["usage"]) {
    this.calls.push("DISCOVERY");
    this.charge("DISCOVERY", usage);
    return ["https://example.com/team"];
  }
  private charge(stage: string, usage: WorkforceRun["usage"]) {
    usage.push({
      stage,
      model: "mock-test-only",
      attempts: 1,
      inputTokens: 20,
      outputTokens: 20,
      estimatedCostUsd: null,
    });
  }
  async structured<T>(
    stage: string,
    schema: z.ZodType<T>,
    _instruction: string,
    raw: unknown,
    usage: WorkforceRun["usage"],
  ): Promise<T> {
    this.calls.push(stage);
    this.charge(stage, usage);
    const c = raw as {
      prospectId: string;
      accountDomain: string;
      intake: WorkforceIntake;
      sources: WorkforceRun["research"]["sources"];
      research: WorkforceRun["research"];
      strategy: WorkforceRun["strategy"];
    };
    let payload: unknown;
    if (stage === "ACCOUNT_RESEARCH" || stage === "PROSPECT_INTELLIGENCE") {
      const account = stage === "ACCOUNT_RESEARCH";
      const statement = account
        ? `${c.intake.companyName} sells outdoor equipment through its online store.`
        : `${c.intake.prospectName} is ${c.intake.prospectTitle} at ${c.intake.companyName}.`;
      payload = {
        facts: [
          {
            id: account ? "account:business" : "prospect:position",
            statement,
            subject: account ? "ACCOUNT" : "PROSPECT",
            category: account ? "BUSINESS_MODEL" : "POSITION",
            confidence: "HIGH",
            sourceIds: [c.sources[0].id],
            quotes: [{ sourceId: c.sources[0].id, text: statement }],
            limitations: [],
          },
        ],
        gaps: [],
        assumptions: [],
      };
    } else if (stage === "EVIDENCE_VALIDATION")
      payload = {
        supportedFactIds: c.research.facts.map((f) => f.id),
        rejectedFactIds: [],
        identityMatches: true,
        concerns: [],
      };
    else if (stage === "STRATEGY")
      payload = {
        prospectId: c.prospectId,
        angle: "OTHER_EVIDENCE_LED",
        hypothesis: "A question about how branded coverage decisions are evaluated",
        supportingFactIds: ["account:business", "prospect:position"],
        uncertainties: ["No verified SERP capture"],
        rationale: "A cautious process discussion fits the verified business context.",
        companyRationale: "The company sells directly online.",
        prospectRationale: "The verified role concerns paid search.",
        alternatives: [
          { angle: "COMPETITOR_DEFENSE", reasonNotSelected: "No competitor ad observation" },
        ],
      };
    else if (stage === "SEQUENCE")
      payload = {
        prospectId: c.prospectId,
        accountDomain: c.accountDomain,
        creativePlan: {
          approaches: [
            {
              id: "measurement",
              concept: "Explore measurement choices",
              voice: "Analytical",
              narrative: "Question then context",
              prospectFit: c.intake.prospectTitle,
              tradeoffs: "Requires interest in measurement",
            },
            {
              id: "decision",
              concept: "Discuss decision ownership",
              voice: "Conversational",
              narrative: "Perspective then invitation",
              prospectFit: c.intake.prospectTitle,
              tradeoffs: "Responsibilities remain uncertain",
            },
          ],
          selectedApproachId: "measurement",
          selectionRationale:
            "The verified role supports a measurement conversation, not claims of waste.",
          hypotheses: [],
        },
        strategy: c.strategy,
        messages: [
          "Business context",
          "Measurement question",
          "Product capability",
          "Low-pressure close",
        ].map((purpose, index) => ({
          step: index + 1,
          subject: index ? "Re: Brand coverage review" : "Brand coverage review",
          body: [
            `${c.intake.companyName} sells outdoor equipment through its online store. Signal monitors branded search conditions. Would a brief exchange about coverage decisions be useful?`,
            "When branded queries differ by product, how do you decide where defensive coverage earns its place? Happy to compare approaches if that is useful.",
            "Would separating paid conversions from traffic that might arrive organically make the coverage question easier to evaluate? I can share the measurement questions first.",
            "Happy to leave this here if it is not a priority. Thanks for considering it.",
          ][index],
          purpose,
          supportingFactIds: index ? [] : ["account:business"],
          suggestedDelayDays: index ? 4 : 0,
          approvedKnowledgeIds: index ? [] : ["product-1"],
          assertions: index
            ? []
            : [
                {
                  text: "Signal monitors branded search conditions.",
                  factIds: [],
                  knowledgeIds: ["product-1"],
                },
              ],
        })),
        review: { verdict: "NEEDS_REVIEW", concerns: [] },
        approved: false,
        canSend: false,
        canEnroll: false,
      };
    else if (stage === "QUALITY_REVIEW")
      payload = {
        verdict: this.revise ? "REVISE" : "PASS",
        checks: {
          factualAccuracy: true,
          sourceGrounding: true,
          prospectRelevance: true,
          nonRepetitive: !this.revise,
          naturalLanguage: true,
          commercialUsefulness: true,
          approvedClaimsOnly: true,
          originality: !this.revise,
          strategicFit: true,
        },
        checkedSteps: [1, 2, 3, 4],
        unsupportedAssertions: [],
        concerns: this.revise ? ["Vary the copy"] : [],
      };
    if (this.malformed) payload = { unexpected: true };
    return schema.parse(payload);
  }
}
export function testReader(input = workforceIntake) {
  return async (url: string) => ({
    url,
    title: "Explicitly fictional test source",
    text: `${input.companyName} sells outdoor equipment through its online store. ${input.prospectName} is ${input.prospectTitle} at ${input.companyName}. Public source excerpt supplied by an automated test fixture, not real research.`,
  });
}
