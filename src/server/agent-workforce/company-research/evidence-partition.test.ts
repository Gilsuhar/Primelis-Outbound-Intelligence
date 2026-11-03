// @vitest-environment node
import { syntheticDocument, choiceSources } from "@/test/synthetic-company-documents";
import { expect, it } from "vitest";
import { internalDocumentSchema } from "@/features/agent-workforce/company-research/internal-review";
import { partitionCompanyEvidence } from "./evidence-partition";

// Synthetic source excerpts; candidates below are EXPLICIT OFFLINE RECONSTRUCTIONS,
// not historical model outputs or independent semantic approvals.
const saved = internalDocumentSchema.parse(
  JSON.parse(JSON.stringify(syntheticDocument("e182f7bd-c35e-4a8b-afc7-67ff86f21cda"))),
);
const savedChoice = internalDocumentSchema.parse(
  JSON.parse(JSON.stringify(syntheticDocument("d4eb59e6-8160-4d45-a8d2-44c0174b7b65"))),
);
function replay() {
  const run = structuredClone(saved.automatic!.run!);
  const source = run.research.sources[0];
  const quote = "Hair Health Leader Nutrafol® Expands Into Skin";
  run.research.facts = [
    {
      id: "account:offline-supported",
      subject: "ACCOUNT",
      category: "DEVELOPMENT",
      statement:
        "Nutrafol published an article titled Hair Health Leader Nutrafol® Expands Into Skin.",
      confidence: "HIGH",
      sourceIds: [source.id],
      quotes: [{ sourceId: source.id, text: quote }],
      limitations: ["Historical article, not proof of current advertising conditions."],
    },
  ];
  return run;
}
const now = new Date(new Date(saved.createdAt).getTime() + 60000);
it("records that historical rejected wording was erased and cannot be recovered from this result", () => {
  expect(saved.automatic!.run!.research.facts).toEqual([]);
  expect(saved.automatic!.rejectedEvidence).toBeUndefined();
  expect(saved.automatic!.issues).toContain(
    "Quote does not occur in its actual source: account:003",
  );
});
it("saved Nutrafol excerpts preserve exact citations and quarantine bad extra citations", () => {
  const run = replay();
  const valid = run.research.facts[0];
  for (const id of ["001", "003", "007"]) {
    const invalid = structuredClone(valid);
    invalid.id = `account:${id}`;
    if (id === "003") invalid.quotes[0].text = "Nutrafol competitors always bid on branded queries";
    else {
      invalid.sourceIds.push(run.research.sources[1].id);
      invalid.quotes.push({
        sourceId: run.research.sources[1].id,
        text: "Unsupported extra citation",
      });
    }
    run.research.facts.push(invalid);
  }
  const result = partitionCompanyEvidence(run, now);
  expect(result.accepted.map((f) => f.id)).toEqual([
    "account:offline-supported",
    "account:001",
    "account:007",
  ]);
  expect(result.rejected).toHaveLength(1);
  expect(result.quarantined).toHaveLength(3);
  expect(result.rejected[0].quotes[0].exactMatch).toBe(false);
  expect(result.globalIssues).toEqual([]);
  expect(result.gaps).toEqual([]);
});
it.each(["identity", "duplicate", "stale", "wrong-source"])(
  "shared %s defect cannot be rescued by filtering",
  (defect) => {
    const run = replay();
    if (defect === "identity") run.research.accountDomain = "unrelated.example";
    if (defect === "duplicate") run.research.facts.push(structuredClone(run.research.facts[0]));
    if (defect === "stale") run.research.sources[0].observedAt = "2000-01-01T00:00:00Z";
    if (defect === "wrong-source") run.research.sources[0].url = "http://127.0.0.1/private";
    const result = partitionCompanyEvidence(run, now);
    expect(result.accepted).toEqual([]);
    expect(result.globalIssues.length).toBeGreaterThan(0);
  },
);
it("rejects unsupported numbers and semantic interpretations only through independent review, never calling exact matching semantic approval", () => {
  const run = replay();
  run.research.facts[0].statement = "Nutrafol wastes 30% of branded search spend";
  expect(partitionCompanyEvidence(run, now).accepted).toHaveLength(1);
  // This intentionally passes string checks; the independent-review regression rejects it.
});
it("bounds and redacts rejected diagnostic text", () => {
  const run = replay();
  run.research.facts[0].statement = "private@example.invalid";
  run.research.facts[0].quotes[0].text = "Bearer fictional-secret";
  const output = JSON.stringify(partitionCompanyEvidence(run, now).rejected);
  expect(output).not.toContain("private@example.invalid");
  expect(output).not.toContain("fictional-secret");
});

it("quarantines only bad Choice Hotels quotations and retains unchanged candidates with exact citations", () => {
  const run = structuredClone(savedChoice.automatic!.run!);
  // The historical run retained a bounded rejection audit, not the original typed fact objects.
  // Reconstruct candidate wording/citations from that audit; categories below are test metadata.
  const categoryById: Record<
    string,
    "BUSINESS_MODEL" | "PRODUCTS" | "MARKETS" | "DEVELOPMENT" | "WEBSITE"
  > = {
    "account:1": "BUSINESS_MODEL",
    "account:2": "PRODUCTS",
    "account:3": "PRODUCTS",
    "account:4": "MARKETS",
    "account:5": "DEVELOPMENT",
    "account:6": "DEVELOPMENT",
    "account:7": "WEBSITE",
  };
  run.research.facts = savedChoice.automatic!.rejectedEvidence!.map((candidate) => ({
    id: candidate.factId,
    subject: "ACCOUNT" as const,
    category: categoryById[candidate.factId],
    statement: candidate.statement,
    confidence: "HIGH" as const,
    sourceIds: candidate.sourceIds,
    quotes: candidate.quotes.map(({ sourceId, text }) => ({ sourceId, text })),
    limitations: ["Offline reconstruction from saved audit; requires independent grounding."],
  }));

  const originalClaims = new Map(run.research.facts.map((fact) => [fact.id, fact.statement]));
  const result = partitionCompanyEvidence(
    run,
    new Date(new Date(savedChoice.createdAt).getTime() + 60000),
  );

  expect(result.globalIssues).toEqual([]);
  expect(result.gaps).toEqual([]);
  expect(result.accepted.map((fact) => fact.id)).toEqual(["account:4", "account:5", "account:6"]);
  expect(result.accepted.every((fact) => fact.statement === originalClaims.get(fact.id))).toBe(
    true,
  );
  expect(
    result.accepted.every((fact) =>
      fact.quotes.every(
        (quote) =>
          fact.sourceIds.includes(quote.sourceId) &&
          run.research.sources
            .find((source) => source.id === quote.sourceId)
            ?.excerpt.includes(quote.text),
      ),
    ),
  ).toBe(true);

  // Transposed IDs are never repaired, and URL strings are not excerpt quotations.
  expect(result.rejected.map((candidate) => candidate.factId)).toEqual([
    "account:1",
    "account:2",
    "account:3",
    "account:7",
  ]);
  expect(result.accepted.flatMap((fact) => fact.sourceIds)).not.toContain(choiceSources[2].id);
  expect(result.quarantined.map((candidate) => candidate.factId)).toEqual([
    "account:1",
    "account:2",
    "account:3",
    "account:4",
    "account:5",
    "account:6",
    "account:7",
  ]);
  expect(result.quarantined.find((candidate) => candidate.factId === "account:5")?.quotes).toEqual([
    expect.objectContaining({
      sourceId: choiceSources[2].id,
      exactMatch: false,
      text: "Choice Hotels EMEA announces long-term Africa growth plan with 100-hotel commitment by 2035",
    }),
  ]);
  expect(result.accepted.find((fact) => fact.id === "account:5")?.quotes).toHaveLength(2);
});
