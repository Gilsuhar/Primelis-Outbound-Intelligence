import { afterEach, describe, expect, it, vi } from "vitest";

import { buildProspectIntelligence } from "@/features/build-sequence/prospect-intelligence";
import type { BuildSequenceInput } from "@/features/build-sequence/types";

import { createBuildSequenceAiProvider } from "./build-sequence-provider";

const input: BuildSequenceInput = {
  companyName: "Nike",
  companyWebsite: "nike.com",
  contactRole: "VP Performance Marketing",
  industry: "Fashion and Luxury",
  companyContext: "Strong fit - confirmed",
  observedTrigger: "Validate branded-search activity",
  primaryChannel: "EMAIL",
  sequenceLength: 4,
  desiredTone: "DIRECT",
  desiredOverallDuration: "10 business days",
  creatorId: "seed-sales-user",
};

const records = [
  {
    id: "truth-1",
    title: "Signal product truth",
    type: "PRODUCT_TRUTH" as const,
    approvedText:
      "Signal evaluates paid and organic brand search together to support efficient decisions.",
    channels: ["EMAIL" as const, "INTERNAL" as const],
    sourceIds: ["source-1"],
    sourceTitles: ["Approved source"],
    sourceDates: ["2026-01-01"],
  },
];

function generation() {
  return {
    overallStrategy: "Fallback strategy.",
    selectedAngle: "BRANDED_SEARCH_EFFICIENCY" as const,
    angleRationale: "Fallback rationale.",
    personaEmphasis: {
      persona: "Performance Marketing",
      emphasis: "efficiency" as const,
      rationale: "Owns paid brand.",
    },
    prospectIntelligence: buildProspectIntelligence(input, records),
    detectedAccountSignals: [],
    safetyNotes: [],
    knowledgeLimitations: [],
  };
}

describe("Build Sequence OpenAI provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the deterministic rendered sequence even when OpenAI returns full steps", async () => {
    const provider = createBuildSequenceAiProvider({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-test",
    } as unknown as NodeJS.ProcessEnv);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          primaryContent: "Sequence rewritten.",
          sequenceSteps: [
            {
              subjectLine: "Nike paid brand decision",
              messageBody: "AI step one: a sharp Nike-specific paid-brand decision.",
              cta: "How do you decide this today?",
            },
            {
              subjectLine: "Re: organic demand",
              messageBody: "AI step two: a new angle on organic demand and unnecessary spend.",
              cta: "Is this visible in your reporting?",
            },
            {
              subjectLine: "Re: competitor presence",
              messageBody: "AI step three: competitor presence, lower bids, and restored coverage.",
              cta: "Worth a brief walkthrough?",
            },
            {
              subjectLine: "Closing the loop",
              messageBody: "AI step four: a low-pressure close without repeating the opener.",
              cta: "Should I close the loop here?",
            },
          ],
          sourceReferences: ["source-1"],
          factualClaimsUsed: ["Signal evaluates paid and organic brand search together."],
          uncertaintyNotes: [],
          safetyFlags: [],
          changeSummary: "Use a sharper four-step sequence.",
        }),
      }),
    } as Response);

    const result = await provider.generate({
      input,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: generation(),
    });

    expect(result.steps[0].messageBody).toContain("VP Performance Marketing role at Nike");
    expect(result.steps[0].messageBody).toContain("branded-search question");
    expect(result.steps[1].imagePlaceholder).toBe("{{! Insert screenshot }}");
    expect(result.steps[2].messageBody).toContain("existing Google Ads setup");
    expect(JSON.stringify(result.steps)).not.toContain("Our tech");
    expect(result.steps[2].messageBody).not.toContain("Crocs, AppsFlyer, and MyHeritage");
    expect(result.steps[2].messageBody).not.toContain("40-60%");
    expect(result.steps[3].messageBody).toContain("AppsFlyer cut branded spend 29%");
    expect(result.steps[3].cta).toBe("Open to a quick overview?");
    expect(JSON.stringify(result.steps)).not.toContain("AI step one");
    expect(result.overallStrategy).toContain("prospect intelligence");
    const [, requestInit] = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(String(requestInit?.body));
    expect(body.max_output_tokens).toBeGreaterThanOrEqual(3000);
  });

  it("accepts OpenAI schema without letting model text replace rendered steps", async () => {
    const provider = createBuildSequenceAiProvider({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-test",
    } as unknown as NodeJS.ProcessEnv);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          sequenceSteps: [
            {
              subjectLine: "Nike paid-brand control",
              messageBody: "AI-only step one with a fresh paid-brand angle.",
              cta: "How do you decide this today?",
            },
            {
              subjectLine: "Re: organic demand",
              messageBody: "AI-only step two with a separate organic-demand angle.",
              cta: "Is this visible in reporting?",
            },
            {
              subjectLine: "Re: brand coverage",
              messageBody: "AI-only step three with a mechanism note.",
              cta: "Worth a brief walkthrough?",
            },
            {
              subjectLine: "Close the loop",
              messageBody: "AI-only step four with a calm final note.",
              cta: "Should I leave this here?",
            },
          ],
        }),
      }),
    } as Response);

    const result = await provider.generate({
      input,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: generation(),
    });

    expect(result.steps[0].messageBody).toContain("VP Performance Marketing role at Nike");
    expect(result.steps[1].messageBody).toContain("Signal monitors Google and Bing SERPs minute by minute");
    expect(JSON.stringify(result.steps)).not.toContain("AI-only step one");
    expect(result.safetyNotes.join(" ")).not.toContain("Deterministic fallback was used");
  });

  it("does not fall back when OpenAI returns string safety flags", async () => {
    const provider = createBuildSequenceAiProvider({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-test",
    } as unknown as NodeJS.ProcessEnv);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          sequenceSteps: [
            {
              subjectLine: "Nike paid-brand process",
              messageBody: "AI step one with a process question about paid brand decisions.",
              cta: "How do you decide this today?",
            },
            {
              subjectLine: "One evidence-led follow-up",
              messageBody: "AI step two with distinct evidence-led context and no invented proof.",
              cta: "Is this visible in reporting?",
            },
            {
              subjectLine: "Re: competitor presence",
              messageBody: "AI step three with a brief mechanism explanation.",
              cta: "Worth a brief walkthrough?",
            },
            {
              subjectLine: "Close the loop",
              messageBody: "AI step four with a brief low-pressure close for the sequence.",
              cta: "Should I leave this here?",
            },
          ],
          sourceReferences: ["source-1"],
          factualClaimsUsed: ["Signal evaluates paid and organic brand search together."],
          uncertaintyNotes: [],
          safetyFlags: ["The output contains an unsupported claim"],
          changeSummary: "Use the OpenAI sequence despite normalized safety flags.",
        }),
      }),
    } as Response);

    const result = await provider.generate({
      input,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: generation(),
    });

    expect(result.overallStrategy).toContain("prospect intelligence");
    expect(result.safetyNotes.join(" ")).not.toContain("Deterministic fallback was used");
    expect(JSON.stringify(result.steps)).not.toContain("The output contains an unsupported claim");
  });

  it("uses only the selected approved case-study proof when one is supplied", async () => {
    const provider = createBuildSequenceAiProvider({} as NodeJS.ProcessEnv);
    const result = await provider.generate({
      input,
      records: [
        ...records,
        {
          id: "proof-1",
          title: "Dior approved proof",
          type: "CASE_STUDY",
          approvalStatus: "APPROVED",
          approvedText: "Case study: Dior. Ad cost decreased by 54% while performance stayed stable.",
          channels: ["EMAIL", "LINKEDIN"],
          sourceIds: ["source-2"],
          sourceTitles: ["Dior source"],
          sourceDates: ["2026-01-02"],
        },
      ],
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: generation(),
    });

    expect(result.steps[2].messageBody).toContain("existing Google Ads setup");
    expect(result.steps[2].messageBody).not.toContain("Dior example");
    expect(result.steps[3].messageBody).toContain("Dior example");
    expect(result.steps[3].messageBody).toContain("54%");
    expect(result.steps[3].messageBody).not.toContain("AppsFlyer");
    expect(result.steps[2].messageBody).not.toContain("MyHeritage");
  });

  it("keeps domain-only facts, tenure metadata, and raw all-keyword notes out of rendered copy", async () => {
    const provider = createBuildSequenceAiProvider({} as NodeJS.ProcessEnv);
    const americaneagleInput: BuildSequenceInput = {
      ...input,
      companyName: "Americaneagle",
      companyWebsite: "americaneagle.com",
      contactFirstName: undefined,
      contactRole: "Head of Performance Marketing",
      companyContext: "Digital agency managing multiple client accounts",
      observedTrigger: "Promotion to PPC Team Lead",
      prospectContext: "Mia Johnson\nPPC Team Lead\nAmericaneagle.com.\nFull-time · 3 yrs 3 mos.",
      serpEvidence: "solo brand moments on all kws biiding",
      brandKeyword: undefined,
    };
    const result = await provider.generate({
      input: americaneagleInput,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: {
        ...generation(),
        prospectIntelligence: buildProspectIntelligence(americaneagleInput, records),
      },
    });
    const rendered = JSON.stringify(result.steps);

    expect(rendered).not.toContain("Americaneagle.com");
    expect(rendered).not.toContain("Full-time");
    expect(rendered).not.toContain("3 yrs 3 mos");
    expect(rendered).not.toContain("I noticed this about Americaneagle: PPC Team Lead");
    expect(rendered).not.toMatch(/kws|biiding/i);
    expect(rendered).not.toContain("Evidence first, logo second");
    expect(rendered).not.toContain("That is the practical benchmark");
    expect(rendered).not.toContain("250 brands");
    expect(rendered).not.toContain("35-60%");
    expect(result.steps[0].subjectLine).toBe("branded search across managed accounts");
    expect(result.steps[0].messageBody).toContain("Hi Mia");
    expect(result.steps[0].messageBody).toContain("Congrats on the move to PPC Team Lead");
    expect(result.steps[0].messageBody).toContain("across multiple accounts");
    expect(result.steps[3].messageBody).toContain("AppsFlyer cut branded spend 29%");
    expect(result.steps[3].messageBody).toContain("PPC team managing several accounts");
  });

  it("ignores leading Step headers from OpenAI body fields", async () => {
    const provider = createBuildSequenceAiProvider({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-test",
    } as unknown as NodeJS.ProcessEnv);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          sequenceSteps: [
            {
              subjectLine: "Nike paid-brand process",
              messageBody: "Step 1 - Day 0\nAI step one after the duplicated model heading.",
              cta: "How do you decide this today?",
            },
            {
              subjectLine: "One evidence-led follow-up",
              messageBody: "Step 2 - Day 3\nAI step two after the duplicated model heading.",
              cta: "Is this visible in reporting?",
            },
            {
              subjectLine: "Re: competitor presence",
              messageBody: "Step 3 - Day 6\nAI step three after the duplicated model heading.",
              cta: "Worth a brief walkthrough?",
            },
            {
              subjectLine: "Close the loop",
              messageBody: "Step 4 - Final touch\nAI step four after the duplicated model heading.",
              cta: "Should I leave this here?",
            },
          ],
          sourceReferences: ["source-1"],
          factualClaimsUsed: ["Signal evaluates paid and organic brand search together."],
          uncertaintyNotes: [],
          safetyFlags: [],
          changeSummary: "Use cleaned OpenAI sequence steps.",
        }),
      }),
    } as Response);

    const result = await provider.generate({
      input,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: generation(),
    });

    expect(result.steps[0].messageBody).toContain("VP Performance Marketing role at Nike");
    expect(result.steps[1].messageBody).toContain("Signal monitors Google and Bing SERPs minute by minute");
    expect(result.steps[2].messageBody).toContain("existing Google Ads setup");
    expect(result.steps[3].messageBody).toContain("AppsFlyer cut branded spend 29%");
    expect(result.steps[3].cta).toBe("Open to a quick overview?");
    expect(JSON.stringify(result.steps)).not.toContain("duplicated model heading");
  });

  it("shows a specific fallback reason when OpenAI rejects the model", async () => {
    const provider = createBuildSequenceAiProvider({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "missing-model",
    } as unknown as NodeJS.ProcessEnv);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const result = await provider.generate({
      input,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: generation(),
    });

    expect(result.safetyNotes.join(" ")).toContain("OpenAI model was not found");
  });
});
