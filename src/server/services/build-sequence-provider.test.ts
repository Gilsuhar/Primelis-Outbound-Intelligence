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

function responseStep(subjectLine: string, messageBody: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      output_text: JSON.stringify({
        sequenceSteps: [
          {
            subjectLine,
            messageBody,
            cta: "ignored by hybrid renderer",
          },
        ],
        sourceReferences: ["source-1"],
        factualClaimsUsed: [],
        uncertaintyNotes: [],
        safetyFlags: [],
      }),
    }),
  } as Response;
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
    expect(result.steps[1].imagePlaceholder).toBeUndefined();
    expect(result.steps[1].imageContextNote).toContain("outside the email body");
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

  it("accepts validated hybrid rewrites step by step", async () => {
    const provider = createBuildSequenceAiProvider({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-test",
    } as unknown as NodeJS.ProcessEnv);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(responseStep("nike brand coverage", "Hi there,\n\nNike's branded search may be worth one narrow look.\n\nA campaign can look healthy while the brand auction is quiet."))
      .mockResolvedValueOnce(responseStep("re: brand auctions", "Hi there,\n\nNike can face two different branded auctions.\n\nSome moments need coverage, and quieter moments may need less pressure."))
      .mockResolvedValueOnce(responseStep("re: paid brand control", "Hi there,\n\nFor Nike, the useful part is seeing when the auction changes.\n\nSignal works alongside Google Ads without rebuilding campaigns."))
      .mockResolvedValueOnce(responseStep("paid-brand example", "Hi there,\n\nAppsFlyer cut branded spend 29% with qualified lead volume up 25% in the first 30 days.\n\nThat is a useful benchmark for paid coverage decisions."));

    const result = await provider.generate({
      input,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: generation(),
    });

    expect(result.steps[0].messageBody).toContain("Nike's branded search may be worth");
    expect(result.steps[2].messageBody).toContain("For Nike, the useful part");
    expect(result.steps[3].messageBody).toContain("AppsFlyer cut branded spend 29%");
    expect(result.safetyNotes).toContain("Hybrid rewrite accepted for step 1.");
  });

  it("accepts natural prospect-led hybrid copy without treating sentence starters as invented entities", async () => {
    const provider = createBuildSequenceAiProvider({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-test",
    } as unknown as NodeJS.ProcessEnv);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(responseStep("Branded search across managed accounts!", "Hi there,\n\nCongrats on your promotion to VP Performance Marketing.\n\nNike's branded search may be worth one narrow look."))
      .mockResolvedValueOnce(responseStep("Re: brand auctions", "Hi there,\n\nNike can face two different branded auctions.\n\nSome moments need coverage, and quieter moments may need less pressure."))
      .mockResolvedValueOnce(responseStep("Re: paid brand control", "Hi there,\n\nFor Nike, the useful part is seeing when the auction changes.\n\nSignal works alongside Google Ads without rebuilding campaigns."))
      .mockResolvedValueOnce(responseStep("Paid-brand example", "Hi there,\n\nAppsFlyer cut branded spend 29% with qualified lead volume up 25% in the first 30 days.\n\nThat is a useful benchmark for paid coverage decisions."));

    const result = await provider.generate({
      input,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: generation(),
    });

    expect(result.steps[0].subjectLine).toBe("branded search across managed accounts");
    expect(result.steps[0].messageBody).toContain("Congrats on your promotion");
    expect(result.safetyNotes).toContain("Hybrid rewrite accepted for step 1.");
  });

  it("falls back only the step whose hybrid rewrite uses an unrecognized entity", async () => {
    const provider = createBuildSequenceAiProvider({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-test",
    } as unknown as NodeJS.ProcessEnv);

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(responseStep("gong brand coverage", "Hi there,\n\nGong has a paid-brand issue worth checking."))
      .mockResolvedValueOnce(responseStep("gong brand coverage", "Hi there,\n\nGong has a paid-brand issue worth checking."))
      .mockResolvedValueOnce(responseStep("re: brand auctions", "Hi there,\n\nNike can face two different branded auctions.\n\nSome moments need coverage, and quieter moments may need less pressure."))
      .mockResolvedValueOnce(responseStep("re: paid brand control", "Hi there,\n\nFor Nike, the useful part is seeing when the auction changes.\n\nSignal works alongside Google Ads without rebuilding campaigns."))
      .mockResolvedValueOnce(responseStep("paid-brand example", "Hi there,\n\nAppsFlyer cut branded spend 29% with qualified lead volume up 25% in the first 30 days.\n\nThat is a useful benchmark for paid coverage decisions."));

    const result = await provider.generate({
      input,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: generation(),
    });

    expect(result.steps[0].messageBody).toContain("VP Performance Marketing role at Nike");
    expect(result.steps[1].messageBody).toContain("Nike can face two different branded auctions");
    expect(JSON.stringify(result.steps)).not.toContain("Gong");
    expect(result.safetyNotes.join(" ")).toContain("Hybrid rewrite fell back for step 1");
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
    expect(result.steps[0].messageBody).toContain("Congrats on your promotion to PPC Team Lead");
    expect(result.steps[1].messageBody).toContain("The same branded query can move between two different auctions");
    expect(result.steps[2].messageBody).toContain("For a PPC team, the value is not another dashboard.");
    expect(rendered).not.toContain("{{! Insert screenshot }}");
    expect(result.steps[0].messageBody).toContain("across multiple accounts");
    expect(result.steps[3].messageBody).toContain("AppsFlyer cut branded spend 29%");
    expect(result.steps[3].messageBody).toContain("one account with meaningful branded-search spend");
  });

  it("turns raw promotion posts into a concise congratulations opener", async () => {
    const provider = createBuildSequenceAiProvider({} as NodeJS.ProcessEnv);
    const americaneagleInput: BuildSequenceInput = {
      ...input,
      companyName: "American Eagle",
      companyWebsite: "americaneagle.com",
      contactFirstName: "Mia",
      contactRole: "PPC Team Lead",
      companyContext: "Digital agency managing multiple client accounts",
      observedTrigger: "Promotion to PPC Team Lead",
      prospectContext: "Mia Johnson\nI’m excited to share that I’ve been promoted to PPC Team Lead at Americaneagle.com!",
      serpEvidence: "solo brand moments",
      brandKeyword: "American Eagle baggy",
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

    expect(result.steps[0].messageBody).toContain("Hi Mia");
    expect(result.steps[0].messageBody).toContain("Congrats on your promotion to PPC Team Lead");
    expect(rendered).not.toContain("I noticed this about American Eagle: I’m excited");
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
