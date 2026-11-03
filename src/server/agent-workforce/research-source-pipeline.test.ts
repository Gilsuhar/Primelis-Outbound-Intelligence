// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import type { WorkforceModel } from "./openai";
import { researchSubject } from "./research-agents";
import { readPublicSource } from "./public-sources";
import {
  sourceDiagnosticUrl,
  sourceFailureReason,
  type SourceDiagnostic,
} from "./source-diagnostics";
import { validateResearch } from "./evidence-validation";
const now = () => new Date("2026-10-18T20:00:00Z");
const input = { companyName: "Fixture Company", companyDomain: "company.example" };
function model(urls: string[]): WorkforceModel {
  return {
    discover: vi.fn(async () => urls),
    structured: vi.fn(async (_stage, schema) =>
      schema.parse({ facts: [], gaps: [], assumptions: [] }),
    ) as WorkforceModel["structured"],
  };
}
afterEach(() => vi.restoreAllMocks());
it("reaches later discovered sources after three failed URLs, without another discovery", async () => {
  const ai = model([
    "https://company.example/a",
    "https://company.example/b",
    "https://company.example/good",
  ]);
  const reader = vi.fn(async (url: string) => {
    if (!url.endsWith("/good")) throw Error("SOURCE_REDIRECT");
    return {
      url,
      title: "Fixture",
      text: "Fixture Company offers public company information. ".repeat(4),
    };
  });
  const events: SourceDiagnostic[] = [];
  const result = await researchSubject({ intake: input, usage: [] }, "ACCOUNT", ai, reader, now, {
    tryRemainingCandidates: true,
    onDiagnostic: (e) => {
      events.push(e);
    },
  });
  expect(reader).toHaveBeenCalledTimes(4);
  expect(ai.discover).toHaveBeenCalledOnce();
  expect(result.sources).toHaveLength(1);
  expect(result.sources[0].excerpt).toContain("Fixture Company");
  expect(events.filter((e) => e.outcome === "SOURCE_REDIRECT")).toHaveLength(3);
  expect(events).toContainEqual(
    expect.objectContaining({ stage: "EXTRACTION", outcome: "COMPLETED", sourceCount: 1 }),
  );
});
it("keeps default workflows at their existing three-candidate limit", async () => {
  const reader = vi.fn(async () => {
    throw Error("SOURCE_NETWORK");
  });
  await researchSubject(
    { intake: input, usage: [] },
    "ACCOUNT",
    model(["https://a.example/", "https://b.example/", "https://c.example/"]),
    reader,
    now,
  );
  expect(reader).toHaveBeenCalledTimes(3);
});
it("bounds fallback to seven attempts and never repeats discovery", async () => {
  const ai = model(Array.from({ length: 20 }, (_, i) => `https://source${i}.example/`));
  const reader = vi.fn(async () => {
    throw Error("SOURCE_NETWORK");
  });
  await researchSubject({ intake: input, usage: [] }, "ACCOUNT", ai, reader, now, {
    tryRemainingCandidates: true,
  });
  expect(reader).toHaveBeenCalledTimes(7);
  expect(ai.discover).toHaveBeenCalledOnce();
  expect(ai.structured).not.toHaveBeenCalled();
});
it("stops after three accepted sources", async () => {
  const reader = vi.fn(async (url: string) => ({
    url,
    title: "Fixture",
    text: "Fixture Company source content. ".repeat(4),
  }));
  const result = await researchSubject(
    { intake: input, usage: [] },
    "ACCOUNT",
    model(["https://a.example/", "https://b.example/", "https://c.example/"]),
    reader,
    now,
    { tryRemainingCandidates: true },
  );
  expect(reader).toHaveBeenCalledTimes(3);
  expect(result.sources).toHaveLength(3);
});
it("canonicalizes duplicate URLs, rejects forbidden candidates and returned redirects", async () => {
  const reader = vi.fn(async () => ({
    url: "https://different.example/",
    title: "Fixture",
    text: "Fixture Company source content. ".repeat(4),
  }));
  const result = await researchSubject(
    { intake: input, usage: [] },
    "ACCOUNT",
    model([
      "https://company.example",
      "https://company.example/",
      "https://127.0.0.1/",
      "https://linkedin.com/company/secret",
    ]),
    reader,
    now,
    { tryRemainingCandidates: true },
  );
  expect(reader).toHaveBeenCalledTimes(1);
  expect(result.sources).toHaveLength(0);
});
it("redacts credentials, private hosts, arbitrary errors, paths, query and fragment data", () => {
  const output = JSON.stringify([
    sourceDiagnosticUrl("https://user:secret@example.com/private?key=secret#secret"),
    sourceDiagnosticUrl("https://example.com/private-secret?key=secret#secret"),
    sourceDiagnosticUrl("https://127.0.0.1/secret"),
    sourceFailureReason(Error("private-secret https://private.internal/")),
  ]);
  expect(output).not.toMatch(/secret|private|127\.0\.0\.1|user:/);
  expect(sourceDiagnosticUrl("https://investors.nike.com/")).toBe("https://investors.nike.com/");
  expect(sourceFailureReason(Error("SOURCE_HTTP_403"))).toBe("SOURCE_HTTP_403");
});
it("does not include raw source errors or body content in diagnostics", async () => {
  const events: SourceDiagnostic[] = [];
  await researchSubject(
    { intake: input, usage: [] },
    "ACCOUNT",
    model(["https://company.example/private-secret?token=secret"]),
    async () => {
      throw Error("private-secret");
    },
    now,
    {
      tryRemainingCandidates: true,
      onDiagnostic: (e) => {
        events.push(e);
      },
    },
  );
  expect(JSON.stringify(events)).not.toContain("secret");
  expect(events).toContainEqual(
    expect.objectContaining({ stage: "EXTRACTION", outcome: "SKIPPED_NO_SOURCES" }),
  );
});

it("awaits checkpoint sinks and reports source parsing failures without leaking page content", async () => {
  const events: SourceDiagnostic[] = [];
  let checkpointCount = 0;
  await researchSubject(
    { intake: input, usage: [] },
    "ACCOUNT",
    model(["https://company.example/bad"]),
    async (url) => ({ url, title: 42 as unknown as string, text: "private page text" }),
    now,
    {
      tryRemainingCandidates: true,
      onDiagnostic: async (event) => {
        await Promise.resolve();
        checkpointCount += 1;
        events.push(event);
      },
    },
  );
  expect(checkpointCount).toBe(events.length);
  expect(events).toContainEqual(
    expect.objectContaining({ stage: "PARSING", outcome: "SOURCE_PARSE_FAILED" }),
  );
  expect(JSON.stringify(events)).not.toContain("private page text");
});
// Explicit unpaid network probe only: mocks discovery and AI extraction; never uses service persistence or a provider.
it.skipIf(process.env.LOCAL_PUBLIC_SOURCE_DIAGNOSTIC !== "true")(
  "retrieves actual Nike content through discovery-to-evidence pipeline with AI mocked",
  async () => {
    const events: SourceDiagnostic[] = [];
    const ai = model([
      "https://www.nike.com/",
      "https://about.nike.com/",
      "https://investors.nike.com/",
    ]);
    ai.structured = vi.fn(async (_stage, schema, _instruction, context) => {
      const sources = (context as { sources: { id: string; excerpt: string; url: string }[] })
        .sources;
      const source = sources.find((s) => s.url === "https://investors.nike.com/");
      expect(source).toBeDefined();
      const quote = "Nike is a SPORT COMPANY";
      expect(source!.excerpt).toContain(quote);
      return schema.parse({
        facts: [
          {
            id: "account:business",
            subject: "ACCOUNT",
            category: "BUSINESS_MODEL",
            statement: quote,
            sourceIds: [source!.id],
            confidence: "HIGH",
            limitations: [],
            quotes: [{ sourceId: source!.id, text: quote }],
          },
        ],
        gaps: [],
        assumptions: [],
      });
    }) as WorkforceModel["structured"];
    const time = () => new Date();
    const result = await researchSubject(
      { intake: { companyName: "Nike", companyDomain: "nike.com" }, usage: [] },
      "ACCOUNT",
      ai,
      readPublicSource,
      time,
      {
        tryRemainingCandidates: true,
        onDiagnostic: (e) => {
          events.push(e);
        },
      },
    );

    expect(result.sources.some((s) => s.url === "https://investors.nike.com/")).toBe(true);
    const issues = validateResearch(
      {
        id: "unpaid-public-source-probe",
        intake: { companyName: "Nike", companyDomain: "nike.com" },
        research: {
          ...result,
          prospectId: "unpaid-public-source-probe",
          accountDomain: "nike.com",
          researchedAt: time().toISOString(),
        },
      },
      time(),
      { company: true, prospect: false },
    );
    expect(issues).toEqual([]);
    console.info(
      "[unpaid-public-source-probe]",
      JSON.stringify({
        sources: result.sources.map((s) => ({
          url: s.url,
          title: s.title,
          characters: s.excerpt.length,
        })),
        exactQuote: "Nike is a SPORT COMPANY",
        evidenceIssues: issues.length,
        ai: "MOCKED",
        databaseWrites: 0,
        events,
      }),
    );
  },
  60000,
);

it.skipIf(process.env.LOCAL_ALICE_SOURCE_DIAGNOSTIC !== "true")(
  "probes the existing reader against the supplied Alice/Swarovski URLs",
  async () => {
    const urls = [
      "https://ch.linkedin.com/in/alicedebenetti",
      "https://theorg.com/org/swarovski/org-chart/alice-de-benetti",
      "https://www.linkedin.com/posts/jan-duong_super-proud-of-all-the-hardwork-that-alice-activity-7208398891946258432-NNpd",
      "https://www.linkedin.com/posts/silvia-schmucker-12b59816_gartner-has-just-announced-its-digital-iq-activity-7468681128900657153-iER0",
    ];
    const outcomes = await Promise.all(
      urls.map(async (url) => {
        try {
          const page = await readPublicSource(url);
          return {
            host: new URL(url).hostname,
            result: "RETRIEVED",
            title: page.title,
            chars: page.text.length,
          };
        } catch (error) {
          return { host: new URL(url).hostname, result: sourceFailureReason(error) };
        }
      }),
    );
    console.info("[alice-existing-reader-probe]", JSON.stringify(outcomes));
    expect(
      outcomes
        .filter((outcome) => outcome.host.endsWith("linkedin.com"))
        .every((outcome) => outcome.result === "SOURCE_UNAVAILABLE"),
    ).toBe(true);
  },
);
