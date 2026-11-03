// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  prepareComparison,
  prepareNutrafolContinuation,
} from "@/experiments/commercial-ab/experiment";
import { prepareChoiceHotelsContinuation } from "@/server/agent-workforce/company-research/choice-hotels-continuation";
import { syntheticActor, syntheticChoiceRaw } from "./synthetic-company-documents";
import { writeSyntheticExperiment } from "./synthetic-experiment-artifacts";

// No metadata mocks here: production must never accept the offline fixtures as approved artifacts.
it("rejects synthetic company evidence with the unmodified production hash binding", () => {
  expect(() =>
    prepareChoiceHotelsContinuation(
      syntheticChoiceRaw,
      syntheticActor,
      "Choice Hotels",
      new Date("2026-10-21T10:00:00Z"),
    ),
  ).toThrow("SAVED_CONTINUATION_CHANGED");
});
it("rejects synthetic experiment packets and checkpoints with production hash bindings", () => {
  const root = mkdtempSync(join(tmpdir(), "synthetic-production-boundary-"));
  try {
    writeSyntheticExperiment(root, "continuation");
    expect(() => prepareComparison(root)).toThrow("EXPERIMENT_EVIDENCE_CHANGED");
    expect(() => prepareNutrafolContinuation(root)).toThrow("EXPERIMENT_CHECKPOINT_CHANGED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
