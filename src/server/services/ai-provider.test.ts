import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAiProvider, type AiDraftRequest } from "./ai-provider";

function request(overrides: Partial<AiDraftRequest> = {}): AiDraftRequest {
  return {
    workflow: "CREATE_OUTREACH",
    context: {
      approvedFacts: ["Signal monitors live search results."],
      userProvidedContext: ["Company name from user: Nike"],
      sourceReferences: [{ id: "source-1", title: "Approved source" }],
      safetyPolicy: ["Do not invent account facts."],
    },
    ...overrides,
  };
}

function mockOpenAiResponse(payload: unknown) {
  const calls: RequestInit[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init) {
        calls.push(init);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: JSON.stringify(payload) }),
      } as Response;
    }),
  );
  return calls;
}

describe("OpenAI provider output boundaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects empty primary content instead of treating it as a valid draft", async () => {
    mockOpenAiResponse({
      primaryContent: "",
      sourceReferences: [],
      factualClaimsUsed: [],
      uncertaintyNotes: [],
      safetyFlags: [],
    });

    await expect(
      new OpenAiProvider({
        ...process.env,
        OPENAI_API_KEY: "redacted",
        OPENAI_MODEL: "gpt-test",
      }).generateDraft(
        request(),
      ),
    ).rejects.toThrow("MALFORMED_RESPONSE");
  });

  it("rejects Build Sequence responses that do not return usable sequence steps", async () => {
    mockOpenAiResponse({
      primaryContent: "This is not enough for a sequence.",
      sourceReferences: [],
      factualClaimsUsed: [],
      uncertaintyNotes: [],
      safetyFlags: [],
    });

    await expect(
      new OpenAiProvider({
        ...process.env,
        OPENAI_API_KEY: "redacted",
        OPENAI_MODEL: "gpt-test",
      }).generateDraft(
        request({
          workflow: "BUILD_SEQUENCE",
          context: {
            approvedFacts: ["Signal monitors live search results."],
            userProvidedContext: ["Company name from user: Nike"],
            sourceReferences: [{ id: "source-1", title: "Approved source" }],
            safetyPolicy: ["Do not invent account facts."],
            brief: { sequenceLength: 3 },
          },
        }),
      ),
    ).rejects.toThrow("MALFORMED_RESPONSE");
  });

  it("sends user context separately from verified internal knowledge", async () => {
    const calls = mockOpenAiResponse({
      primaryContent: "Safe generated draft from approved Signal context.",
      sourceReferences: ["source-1"],
      factualClaimsUsed: ["Signal monitors live search results."],
      uncertaintyNotes: [],
      safetyFlags: [],
    });

    await new OpenAiProvider({
      ...process.env,
      OPENAI_API_KEY: "redacted",
      OPENAI_MODEL: "gpt-test",
    }).generateDraft(
      request(),
    );

    const body = JSON.parse(String(calls[0].body)) as {
      input: Array<{ content: Array<{ text: string }> }>;
    };
    const prompt = JSON.parse(body.input[0].content[0].text) as {
      verifiedInternalKnowledge: string[];
      userProvidedContext: string[];
    };
    expect(prompt.verifiedInternalKnowledge).toEqual(["Signal monitors live search results."]);
    expect(prompt.userProvidedContext).toEqual(["Company name from user: Nike"]);
  });
});
