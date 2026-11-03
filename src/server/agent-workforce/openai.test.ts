// Explicit mocked budget boundary for these isolated, mocked HTTP transport tests.
vi.mock("@/server/agent-workforce/daily/budget", () => ({
  reserveProvider: vi.fn(async () => ({ finish: vi.fn(async () => {}) })),
  unitCost: () => 0.01,
  openAiPricing: () => ({ input: 1, output: 1 }),
  webSearchCost: () => 0.01,
  providerAttempts: (limit: number) => limit,
}));
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenAiWorkforceModel, structuredSchema } from "./openai";
import {
  extractedResearchSchema,
  sequenceSchema,
} from "@/features/agent-workforce/gate-a-contracts";
import { isPublicIpv4, allowedSourceUrl } from "./public-sources";
const env = {
  OPENAI_API_KEY: "test-key-not-real",
  OPENAI_MODEL: "configured-test-model",
} as unknown as NodeJS.ProcessEnv;
const payload = (extra: Record<string, unknown> = {}) => ({
  status: "completed",
  usage: { input_tokens: 100, output_tokens: 40 },
  output_text: '{"answer":"Source-backed answer"}',
  ...extra,
});
const schema = z.object({ answer: z.string() }).strict();
describe("actual OpenAI Responses transport, mocked HTTP only", () => {
  it("uses server-side credentials, strict schemas, bounded output and reported token usage", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload()));
    const provider = new OpenAiWorkforceModel(env, fetcher);
    const usage: Parameters<typeof provider.discover>[1] = [];
    expect(await provider.structured("STRATEGY", schema, "Choose an angle", {}, usage)).toEqual({
      answer: "Source-backed answer",
    });
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const sent = JSON.parse(String(request?.body));
    expect(sent.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      schema: { additionalProperties: false },
    });
    expect(sent.store).toBe(false);
    expect(sent.max_output_tokens).toBeLessThanOrEqual(6000);
    expect(String(request?.body)).not.toContain("test-key-not-real");
    expect(usage[0]).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      estimatedCostUsd: 0.00014,
    });
  });
  it("requires configuration and never returns deterministic fixture copy", async () => {
    const fetcher = vi.fn();
    const provider = new OpenAiWorkforceModel({} as NodeJS.ProcessEnv, fetcher);
    await expect(provider.structured("SEQUENCE", schema, "write", {}, [])).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["not-json", '{"unexpected":true}'])(
    "rejects invalid model content: %s",
    async (output_text) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(payload({ output_text })));
      await expect(
        new OpenAiWorkforceModel(env, fetcher).structured("STRATEGY", schema, "test", {}, []),
      ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    },
  );
  it("does not accept incomplete output or missing usage metadata", async () => {
    for (const extra of [{ status: "incomplete" }, { usage: undefined }]) {
      const f = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload(extra)));
      await expect(
        new OpenAiWorkforceModel(env, f).structured("SEQUENCE", schema, "test", {}, []),
      ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    }
  });
  it("bounds transient retries and withholds upstream error bodies", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("sensitive upstream response", { status: 503 }));
    await expect(
      new OpenAiWorkforceModel(env, fetcher).structured("STRATEGY", schema, "test", {}, []),
    ).rejects.toThrow("HTTP 503");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response("secret", { status: 401 }));
    await expect(
      new OpenAiWorkforceModel(env, denied).structured("SEQUENCE", schema, "test", {}, []),
    ).rejects.not.toThrow("secret");
    expect(denied).toHaveBeenCalledOnce();
  });
  it("requires actual live web-search tool execution and source references", async () => {
    const noTool = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(payload({ output_text: "I know this company from training." })),
      );
    await expect(
      new OpenAiWorkforceModel(env, noTool).discover("company", []),
    ).rejects.toMatchObject({ code: "WEB_SEARCH_UNAVAILABLE" });
    const live = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        payload({
          output: [
            {
              type: "web_search_call",
              status: "completed",
              action: { sources: [{ url: "https://example.com/about" }] },
            },
          ],
        }),
      ),
    );
    expect(await new OpenAiWorkforceModel(env, live).discover("company", [])).toEqual([
      "https://example.com/about",
    ]);
    const body = JSON.parse(String(live.mock.calls[0][1]?.body));
    expect(body.tools[0].type).toBe("web_search");
    expect(body.max_tool_calls).toBe(1);
    expect(body.tool_choice).toBe("required");
  });
  it("distinguishes unavailable web tools from verified web access", async () => {
    const denied = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unsupported tool", { status: 400 }));
    await expect(
      new OpenAiWorkforceModel(env, denied).discover("company", []),
    ).rejects.toMatchObject({ code: "WEB_SEARCH_UNAVAILABLE" });
  });
  it("converts the committed contracts into strict structured output and rejects unsupported schemas", () => {
    expect(structuredSchema(sequenceSchema)).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(structuredSchema(extractedResearchSchema)).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(() => structuredSchema(z.any())).toThrow("Unsupported");
  });
});
describe("public source retrieval boundaries", () => {
  it.each([
    "https://127.0.0.1/",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/",
    "http://example.com/",
    "https://user:password@example.com",
    "https://example.com:8080/",
    "https://www.linkedin.com/in/person",
    "https://x.com/person",
  ])("rejects unsafe or gated URL %s", (url) => expect(allowedSourceUrl(url)).toBe(false));
  it("allows public company sources but rejects private, shared, reserved and multicast IPv4 addresses", () => {
    expect(allowedSourceUrl("https://example.com/about")).toBe(true);
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.1.1",
      "192.168.1.2",
      "100.64.0.1",
      "169.254.169.254",
      "0.0.0.0",
      "224.0.0.1",
    ])
      expect(isPublicIpv4(ip)).toBe(false);
    expect(isPublicIpv4("93.184.216.34")).toBe(true);
  });
});

it("uses configured writing and review models with the same configured estimates as the budget ledger", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(payload()));
  const provider = new OpenAiWorkforceModel(
    {
      ...env,
      OPENAI_WRITING_MODEL: "efficient-writer",
      OPENAI_QUALITY_MODEL: "configured-reviewer",
    },
    fetcher,
  );
  const usage: Parameters<typeof provider.discover>[1] = [];
  await provider.structured("SEQUENCE", schema, "write", {}, usage);
  await provider.structured("QUALITY_REVIEW", schema, "review", {}, usage);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).model).toBe("efficient-writer");
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).model).toBe("configured-reviewer");
  expect(usage.every((u) => typeof u.estimatedCostUsd === "number")).toBe(true);
});
it.each([
  { input_tokens: -1, output_tokens: 10 },
  { input_tokens: 10.5, output_tokens: 1 },
])("rejects malformed usage before budget settlement (%j)", async (usage) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...payload(), usage }));
  await expect(
    new OpenAiWorkforceModel(env, fetcher).structured("STRATEGY", schema, "write", {}, []),
  ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
});
