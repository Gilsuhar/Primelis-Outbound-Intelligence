import { afterEach, describe, expect, it, vi } from "vitest";

import { extractProspect } from "@/features/build-sequence/prospect-memory";
import { extractProspectSemantic, type SemanticExtractionProvider } from "./prospect-semantic-intake";

function semanticProvider(responses: Record<string, unknown>): SemanticExtractionProvider {
  return async (rawText) => {
    const key = Object.keys(responses).find((item) => rawText.includes(item));
    if (!key) throw new Error("NO_FIXTURE");
    return responses[key];
  };
}

const qaSamples = [
  {
    name: "clean LinkedIn-style paste",
    raw: "Mia Chen\nPPC Team Lead\nCompany: Americaneagle\nMia was promoted to PPC Team Lead.",
    key: "Mia Chen",
    expected: { firstName: "Mia", companyName: "Americaneagle", jobTitle: "PPC Team Lead", serp: "UNKNOWN" },
    ai: {
      identity: { firstName: "Mia", fullName: "Mia Chen" },
      company: { companyName: "Americaneagle" },
      role: { jobTitle: "PPC Team Lead", persona: "PAID_SEARCH" },
      prospectFacts: [
        {
          text: "Mia was promoted to PPC Team Lead",
          category: "promotion",
          sourceEvidence: "Mia was promoted to PPC Team Lead.",
          confidence: "HIGH",
        },
      ],
    },
  },
  {
    name: "messy prose",
    raw: "Quick note: Chris at Remofirst has managed over $50M in paid media and is exploring AI and automation for paid-search decisions.",
    key: "Chris at Remofirst",
    expected: { firstName: "Chris", companyName: "Remofirst", serp: "UNKNOWN" },
    ai: {
      identity: { firstName: "Chris" },
      company: { companyName: "Remofirst" },
      prospectFacts: [
        {
          text: "managed over $50M in paid media",
          category: "paid_media_experience",
          sourceEvidence: "has managed over $50M in paid media",
          confidence: "HIGH",
        },
        {
          text: "exploring AI and automation for paid-search decisions",
          category: "interest",
          sourceEvidence: "is exploring AI and automation for paid-search decisions",
          confidence: "HIGH",
        },
      ],
    },
  },
  {
    name: "name company role only",
    raw: "Avery Stone\nCleanCo\nDirector of Paid Search",
    key: "Avery Stone",
    expected: { firstName: "Avery", companyName: "CleanCo", jobTitle: "Director of Paid Search", serp: "UNKNOWN" },
    ai: {
      identity: { fullName: "Avery Stone" },
      company: { companyName: "CleanCo" },
      role: { jobTitle: "Director of Paid Search" },
    },
  },
  {
    name: "role buried inside paragraph",
    raw: "Spoke with Jordan at Verint. The relevant buyer is the Senior Director of Performance Marketing, and the team cares about measurement.",
    key: "Jordan at Verint",
    expected: { firstName: "Jordan", companyName: "Verint", jobTitle: "Senior Director of Performance Marketing", serp: "UNKNOWN" },
    ai: {
      identity: { firstName: "Jordan" },
      company: { companyName: "Verint" },
      role: { jobTitle: "Senior Director of Performance Marketing" },
      prospectFacts: [
        {
          text: "team cares about measurement",
          category: "priority",
          sourceEvidence: "the team cares about measurement",
          confidence: "MEDIUM",
        },
      ],
    },
  },
  {
    name: "company mentioned multiple times",
    raw: "Hostinger context. Buyer: Paula. Hostinger is testing paid search workflows across markets.",
    key: "Hostinger context",
    expected: { firstName: "Paula", companyName: "Hostinger", serp: "UNKNOWN" },
    ai: {
      identity: { firstName: "Paula" },
      company: { companyName: "Hostinger", market: "across markets" },
      companyFacts: [
        {
          text: "Hostinger is testing paid search workflows across markets",
          category: "company_context",
          sourceEvidence: "Hostinger is testing paid search workflows across markets.",
          confidence: "HIGH",
        },
      ],
    },
  },
  {
    name: "LinkedIn URL included",
    raw: "Dana Brooks\nhttps://www.linkedin.com/in/dana-brooks/\nCompany: Gong\nHead of Growth",
    key: "dana-brooks",
    expected: { firstName: "Dana", companyName: "Gong", jobTitle: "Head of Growth", serp: "UNKNOWN" },
    ai: {
      identity: { fullName: "Dana Brooks", linkedinUrl: "https://www.linkedin.com/in/dana-brooks/" },
      company: { companyName: "Gong" },
      role: { jobTitle: "Head of Growth" },
    },
  },
  {
    name: "email included",
    raw: "Miguel Santos\nmiguel@example.com\nCursor\nMiguel is focused on experimentation and AI.",
    key: "miguel@example.com",
    expected: { firstName: "Miguel", companyName: "Cursor", serp: "UNKNOWN" },
    ai: {
      identity: { fullName: "Miguel Santos", email: "miguel@example.com" },
      company: { companyName: "Cursor" },
      prospectFacts: [
        {
          text: "Miguel is focused on experimentation and AI",
          category: "priority",
          sourceEvidence: "Miguel is focused on experimentation and AI.",
          confidence: "HIGH",
        },
      ],
    },
  },
  {
    name: "SOLO SERP evidence",
    raw: "Chris\nRemofirst\nSERP:\nremofirst - solo",
    key: "remofirst - solo",
    expected: { firstName: "Chris", companyName: "Remofirst", serp: "SOLO" },
    ai: {
      identity: { firstName: "Chris" },
      company: { companyName: "Remofirst" },
      serpEvidence: [
        {
          keyword: "remofirst",
          observation: "remofirst - solo",
          scenarioHint: "SOLO",
          sourceEvidence: "remofirst - solo",
        },
      ],
    },
  },
  {
    name: "CONTESTED SERP evidence",
    raw: "Chris\nRemofirst\nSERP:\nemployer of record - Deel appeared",
    key: "Deel appeared",
    expected: { firstName: "Chris", companyName: "Remofirst", serp: "CONTESTED" },
    ai: {
      identity: { firstName: "Chris" },
      company: { companyName: "Remofirst" },
      serpEvidence: [
        {
          keyword: "employer of record",
          observation: "employer of record - Deel appeared",
          competitor: "Deel",
          scenarioHint: "CONTESTED",
          sourceEvidence: "employer of record - Deel appeared",
        },
      ],
    },
  },
  {
    name: "MIXED SERP evidence",
    raw: "Merrell\nAlex\nSERP:\nmerrell shoes - solo\nhiking boots - REI appeared",
    key: "hiking boots",
    expected: { firstName: "Alex", companyName: "Merrell", serp: "MIXED" },
    ai: {
      identity: { firstName: "Alex" },
      company: { companyName: "Merrell" },
      serpEvidence: [
        {
          keyword: "merrell shoes",
          observation: "merrell shoes - solo",
          scenarioHint: "SOLO",
          sourceEvidence: "merrell shoes - solo",
        },
        {
          keyword: "hiking boots",
          observation: "hiking boots - REI appeared",
          competitor: "REI",
          scenarioHint: "CONTESTED",
          sourceEvidence: "hiking boots - REI appeared",
        },
      ],
    },
  },
  {
    name: "no SERP evidence",
    raw: "Nora Lee\nVP Growth\nCompany: NoSerpCo\nNo checked keywords yet.",
    key: "NoSerpCo",
    expected: { firstName: "Nora", companyName: "NoSerpCo", jobTitle: "VP Growth", serp: "UNKNOWN" },
    ai: {
      identity: { fullName: "Nora Lee" },
      company: { companyName: "NoSerpCo" },
      role: { jobTitle: "VP Growth" },
      notes: [
        {
          text: "No checked keywords yet",
          sourceEvidence: "No checked keywords yet.",
          confidence: "HIGH",
        },
      ],
    },
  },
  {
    name: "conflicting noisy notes",
    raw: "About\nAndy Miller\nMerrell\nAndy recently joined Merrell.\nNote: do not assume wasted spend.",
    key: "Andy Miller",
    expected: { firstName: "Andy", companyName: "Merrell", serp: "UNKNOWN" },
    ai: {
      identity: { fullName: "Andy Miller" },
      company: { companyName: "Merrell" },
      prospectFacts: [
        {
          text: "Andy recently joined Merrell",
          category: "career_move",
          sourceEvidence: "Andy recently joined Merrell.",
          confidence: "HIGH",
        },
        {
          text: "Andy leads a global AI transformation",
          category: "unsupported",
          sourceEvidence: "global AI transformation",
          confidence: "LOW",
        },
      ],
      notes: [
        {
          text: "do not assume wasted spend",
          sourceEvidence: "do not assume wasted spend.",
          confidence: "HIGH",
        },
      ],
    },
  },
] as const;

function scenarioFromExtraction(extraction: Awaited<ReturnType<typeof extractProspectSemantic>>["extraction"]) {
  const hasSolo = extraction.serpEvidence.some((item) => item.status === "SOLO");
  const hasContested = extraction.serpEvidence.some((item) => item.status === "CONTESTED");
  if (hasSolo && hasContested) return "MIXED";
  if (hasSolo) return "SOLO";
  if (hasContested) return "CONTESTED";
  return "UNKNOWN";
}

describe("AI semantic prospect intake", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts grounded prospect context across the 12-sample QA set", async () => {
    const provider = semanticProvider(
      Object.fromEntries(qaSamples.map((sample) => [sample.key, sample.ai])),
    );

    for (const sample of qaSamples) {
      const result = await extractProspectSemantic(sample.raw, { provider });

      expect(result.mode, sample.name).toBe("AI_SEMANTIC");
      expect(result.extraction.firstName, sample.name).toBe(sample.expected.firstName);
      expect(result.extraction.companyName, sample.name).toBe(sample.expected.companyName);
      if ("jobTitle" in sample.expected) {
        expect(result.extraction.jobTitle, sample.name).toBe(sample.expected.jobTitle);
      }
      expect(scenarioFromExtraction(result.extraction), sample.name).toBe(sample.expected.serp);
      const persistedFacts = [
        ...result.extraction.prospectFacts,
        ...result.extraction.companyFacts,
        ...result.extraction.notes,
        ...result.extraction.serpEvidence.map((item) => item.observation ?? item.keyword),
      ].join("\n");
      expect(persistedFacts, sample.name).not.toMatch(/global AI transformation|global paid media teams/i);
    }
  });

  it("drops ungrounded model facts instead of persisting or generating from them", async () => {
    const result = await extractProspectSemantic(
      "Chris has managed over $50M in paid media.",
      {
        provider: async () => ({
          identity: { firstName: "Chris" },
          prospectFacts: [
            {
              text: "managed global paid media teams",
              sourceEvidence: "global paid media teams",
              confidence: "HIGH",
            },
            {
              text: "managed over $50M in paid media",
              sourceEvidence: "managed over $50M in paid media",
              confidence: "HIGH",
            },
          ],
        }),
      },
    );

    expect(result.extraction.prospectFacts).toContain("managed over $50M in paid media");
    expect(result.extraction.prospectFacts).not.toContain("managed global paid media teams");
    expect(result.rejectedFacts).toContain("managed global paid media teams");
  });

  it("falls back to deterministic extraction when semantic extraction is unavailable", async () => {
    const result = await extractProspectSemantic(
      "Chris\nRemofirst\nChris has managed over $50M in paid media.",
      { provider: async () => { throw new Error("provider unavailable"); } },
    );

    expect(result.mode).toBe("DETERMINISTIC_FALLBACK");
    expect(result.extraction.firstName).toBe("Chris");
    expect(result.extraction.companyName).toBe("Remofirst");
    expect(result.fallbackReason).toBeTruthy();
  });

  it("shows where semantic extraction improves over the deterministic extractor", async () => {
    const raw =
      "Spoke with Jordan at Verint. The relevant buyer is the Senior Director of Performance Marketing, and the team cares about measurement.";
    const deterministic = extractProspect({ rawText: raw });
    const semantic = await extractProspectSemantic(raw, {
      provider: async () => ({
        identity: { firstName: "Jordan" },
        company: { companyName: "Verint" },
        role: { jobTitle: "Senior Director of Performance Marketing" },
        prospectFacts: [
          {
            text: "team cares about measurement",
            sourceEvidence: "the team cares about measurement",
            confidence: "HIGH",
          },
        ],
      }),
    });

    expect(deterministic.jobTitle).toBeUndefined();
    expect(semantic.extraction.jobTitle).toBe("Senior Director of Performance Marketing");
    expect(semantic.extraction.prospectFacts).toContain("team cares about measurement");
  });

  it("uses OpenAI semantic extraction when only OPENAI_API_KEY is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            identity: { firstName: "Chris" },
            company: { companyName: "AtlasHR" },
            prospectFacts: [
              {
                text: "managed over $50M in paid media",
                sourceEvidence: "managed over $50M in paid media",
                confidence: "HIGH",
              },
            ],
          }),
        }),
      } as Response)),
    );

    const result = await extractProspectSemantic(
      "Chris\nAtlasHR\nChris has managed over $50M in paid media.",
      { env: { OPENAI_API_KEY: "redacted", OPENAI_MODEL: "gpt-test" } as unknown as NodeJS.ProcessEnv },
    );

    expect(result.mode).toBe("AI_SEMANTIC");
    expect(result.extraction.firstName).toBe("Chris");
    expect(result.extraction.companyName).toBe("AtlasHR");
  });
});
