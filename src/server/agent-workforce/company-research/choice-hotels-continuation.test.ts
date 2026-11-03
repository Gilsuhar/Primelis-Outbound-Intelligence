// @vitest-environment node
import { syntheticDocument } from "@/test/synthetic-company-documents";
import { expect, it, vi } from "vitest";
import { prepareChoiceHotelsContinuation } from "./choice-hotels-continuation";

const raw = JSON.stringify(syntheticDocument("d4eb59e6-8160-4d45-a8d2-44c0174b7b65"));
const actor = "local-development-agent-workforce";
const now = new Date("2026-10-21T10:00:00.000Z");

it("prepares only exact-cited Choice Hotels claims 4–6 and keeps bad citations quarantined", () => {
  const savedBefore = raw;
  const prepared = prepareChoiceHotelsContinuation(raw, actor, "Choice Hotels", now);
  expect(prepared.research.facts.map((fact) => fact.id)).toEqual([
    "account:4",
    "account:5",
    "account:6",
  ]);
  expect(prepared.research.facts[0].statement).toBe(
    "Choice Hotels serves the global lodging market, with explicit international activity in Europe, Africa, and Asia-Pacific in addition to the Americas.",
  );
  expect(prepared.research.facts[1].statement).toBe(
    "Choice Hotels is expanding internationally through franchising and property openings.",
  );
  expect(prepared.research.facts[2].statement).toBe(
    "Choice Hotels operates a media center and uses media-center pages for company news, international press releases, and financial press releases.",
  );
  expect(
    prepared.research.facts.every((fact) =>
      fact.quotes.every(
        (quote) =>
          fact.sourceIds.includes(quote.sourceId) &&
          prepared.research.sources
            .find((source) => source.id === quote.sourceId)
            ?.excerpt.includes(quote.text),
      ),
    ),
  ).toBe(true);
  expect(prepared.quarantined.map((candidate) => candidate.factId)).toEqual([
    "account:4",
    "account:5",
    "account:6",
  ]);
  expect(prepared.research.sources.every((source) => source.id.startsWith("web:"))).toBe(true);
  expect(prepared.source.automatic!.rejectedEvidence!.map((item) => item.factId)).toEqual([
    "account:1",
    "account:2",
    "account:3",
    "account:4",
    "account:5",
    "account:6",
    "account:7",
  ]);
  expect(raw).toBe(savedBefore);
});

it("fails closed for any changed saved record or stale source packet", () => {
  expect(() => prepareChoiceHotelsContinuation(raw + " ", actor, "Choice Hotels", now)).toThrow(
    "SAVED_CONTINUATION_CHANGED",
  );
  expect(() =>
    prepareChoiceHotelsContinuation(raw, actor, "Choice Hotels", new Date("2035-01-01T00:00:00Z")),
  ).toThrow("SAVED_CONTINUATION_EVIDENCE_FAILED");
});

vi.mock(
  "./continuation-binding",
  async () => (await import("@/test/synthetic-company-documents")).syntheticChoiceBinding,
);
