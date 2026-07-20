import { afterEach, describe, expect, it, vi } from "vitest";

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
  sequenceLength: 3,
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

describe("Build Sequence OpenAI provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses AI-returned sequence steps instead of only updating strategy", async () => {
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
              subjectLine: "Closing the loop",
              messageBody: "AI step three: a low-pressure close without repeating the opener.",
              cta: "Should I close the loop here?",
            },
          ],
          sourceReferences: ["source-1"],
          factualClaimsUsed: ["Signal evaluates paid and organic brand search together."],
          uncertaintyNotes: [],
          safetyFlags: [],
          changeSummary: "Use a sharper three-step sequence.",
        }),
      }),
    } as Response);

    const result = await provider.generate({
      input,
      records,
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      generation: {
        overallStrategy: "Fallback strategy.",
        selectedAngle: "BRANDED_SEARCH_EFFICIENCY",
        angleRationale: "Fallback rationale.",
        personaEmphasis: {
          persona: "Performance Marketing",
          emphasis: "efficiency",
          rationale: "Owns paid brand.",
        },
        detectedAccountSignals: [],
        safetyNotes: [],
        knowledgeLimitations: [],
      },
    });

    expect(result.steps.map((step) => step.messageBody)).toEqual([
      "AI step one: a sharp Nike-specific paid-brand decision.",
      "AI step two: a new angle on organic demand and unnecessary spend.",
      "AI step three: a low-pressure close without repeating the opener.",
    ]);
    expect(result.steps[0].subjectLine).toBe("Nike paid brand decision");
    expect(result.overallStrategy).toBe("Use a sharper three-step sequence.");
    const [, requestInit] = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(String(requestInit?.body));
    expect(body.max_output_tokens).toBeGreaterThanOrEqual(3000);
  });

  it("accepts OpenAI sequence steps even when primaryContent is omitted", async () => {
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
              messageBody: "AI-only step three with a calm final note.",
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
      generation: {
        overallStrategy: "Fallback strategy.",
        selectedAngle: "BRANDED_SEARCH_EFFICIENCY",
        angleRationale: "Fallback rationale.",
        personaEmphasis: {
          persona: "Performance Marketing",
          emphasis: "efficiency",
          rationale: "Owns paid brand.",
        },
        detectedAccountSignals: [],
        safetyNotes: [],
        knowledgeLimitations: [],
      },
    });

    expect(result.steps[0].messageBody).toBe("AI-only step one with a fresh paid-brand angle.");
    expect(result.safetyNotes.join(" ")).not.toContain("Deterministic fallback was used");
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
      generation: {
        overallStrategy: "Fallback strategy.",
        selectedAngle: "BRANDED_SEARCH_EFFICIENCY",
        angleRationale: "Fallback rationale.",
        personaEmphasis: {
          persona: "Performance Marketing",
          emphasis: "efficiency",
          rationale: "Owns paid brand.",
        },
        detectedAccountSignals: [],
        safetyNotes: [],
        knowledgeLimitations: [],
      },
    });

    expect(result.safetyNotes.join(" ")).toContain("OpenAI model was not found");
  });
});
