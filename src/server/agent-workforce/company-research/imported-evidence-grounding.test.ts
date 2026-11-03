// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localDevelopmentUser } from "@/lib/auth/local-development";
import { internalDocumentSchema } from "@/features/agent-workforce/company-research/internal-review";
import { buildAlicePublicEvidenceImport } from "./alice-evidence-import";
import type { WorkforceModel } from "../openai";
import { MemoryDailyStore } from "../daily/test-store";
import { fictionalCompanyEnv } from "./test-fixtures";
import {
  adaptImportedEvidenceToWorkforceRun,
  groundImportedEvidenceOnce,
} from "./imported-evidence-grounding";

let folder: string;
const capturedAt = new Date("2026-10-22T10:08:51.000Z");
const packetId = "ec54e002-a422-4c75-a8df-dc61b786fd1d";
const actor = localDevelopmentUser.id;

beforeEach(async () => {
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
  vi.stubEnv("LOCAL_INTERNAL_SALES_ENABLED", "true");
  folder = await mkdtemp(join(tmpdir(), "imported-grounding-test-"));
  const packet = internalDocumentSchema.parse({
    version: 1,
    id: packetId,
    owner: actor,
    company: "Swarovski",
    createdAt: capturedAt.toISOString(),
    image: null,
    review: null,
    importedEvidence: buildAlicePublicEvidenceImport(capturedAt),
  });
  await writeFile(join(folder, `${packetId}.json`), JSON.stringify(packet), { flag: "wx" });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});

function acceptedReview(factIds: string[]) {
  return { supportedFactIds: factIds, rejectedFactIds: [], identityMatches: true, concerns: [] };
}
function rejectingReview(factIds: string[], sourceId: string) {
  return {
    supportedFactIds: factIds.slice(1),
    rejectedFactIds: [factIds[0]],
    identityMatches: true,
    concerns: [
      {
        severity: "BLOCKING",
        code: "NUMERIC_OR_PERIOD_CONTEXT",
        scope: "FACT",
        reason: "Reported figures are not independently established.",
        factIds: [factIds[0]],
        sourceIds: [sourceId],
      },
    ],
  };
}
function fakeModel(review: unknown) {
  return {
    structured: vi.fn(async (_stage: string, schema: { parse: (value: unknown) => unknown }) =>
      schema.parse(review),
    ),
    discover: vi.fn(),
  };
}

it("maps exact source reports without turning profile or performance statements into verified facts", async () => {
  const packet = JSON.parse(await readFile(join(folder, `${packetId}.json`), "utf8"));
  const parsed = internalDocumentSchema.parse(packet);
  const run = adaptImportedEvidenceToWorkforceRun(parsed, "swarovski.com", capturedAt);
  expect(run.stage).toBe("EVIDENCE_VALIDATION");
  expect(run.intake.prospectName).toBe("Generic fictional recipient");
  expect(run.research.sources.map((source) => source.id)).toEqual(
    parsed.importedEvidence!.sources.map((source) => source.id),
  );
  expect(run.research.sources.map((source) => source.url)).toEqual(
    parsed.importedEvidence!.sources.map((source) => source.resolvedUrl ?? source.originalUrl),
  );
  expect(run.research.facts).toHaveLength(parsed.importedEvidence!.sourceReports.length);
  expect(run.research.facts.map((fact) => fact.subject)).toEqual([
    "PROSPECT",
    "ACCOUNT",
    "ACCOUNT",
    "ACCOUNT",
  ]);
  expect(run.research.facts.every((fact) => fact.confidence === "MEDIUM")).toBe(true);
  expect(run.research.facts.every((fact) => fact.limitations.length === 2)).toBe(true);
  expect(
    run.research.facts.every((fact) =>
      run.research.sources
        .find((source) => source.id === fact.quotes[0].sourceId)
        ?.excerpt.includes(fact.quotes[0].text),
    ),
  ).toBe(true);
});

it("fails closed for changed source hashes and incomplete source-to-claim coverage", async () => {
  const parsed = internalDocumentSchema.parse(
    JSON.parse(await readFile(join(folder, `${packetId}.json`), "utf8")),
  );
  const badHash = structuredClone(parsed);
  badHash.importedEvidence!.sources[0].excerpt += " tampered";
  expect(() => adaptImportedEvidenceToWorkforceRun(badHash, "swarovski.com", capturedAt)).toThrow(
    "GROUNDING_INPUT_INVALID",
  );
  const incomplete = structuredClone(parsed);
  incomplete.importedEvidence!.sourceReports = incomplete.importedEvidence!.sourceReports.filter(
    (report) => report.sourceId !== incomplete.importedEvidence!.sources[0].id,
  );
  expect(() =>
    adaptImportedEvidenceToWorkforceRun(incomplete, "swarovski.com", capturedAt),
  ).toThrow("GROUNDING_INPUT_INVALID");
});

it("persists accepted or rejected grounding separately and returns the same record on duplicate submission", async () => {
  const source = JSON.parse(await readFile(join(folder, `${packetId}.json`), "utf8"));
  const originalHash = JSON.stringify(source);
  const mapped = adaptImportedEvidenceToWorkforceRun(
    internalDocumentSchema.parse(source),
    "swarovski.com",
    capturedAt,
  );
  const model = fakeModel(acceptedReview(mapped.research.facts.map((fact) => fact.id)));
  const args = {
    packetId,
    companyDomain: "swarovski.com",
    paidAiAuthorized: true,
  } as const;
  const first = await groundImportedEvidenceOnce(actor, "localhost:3000", args, {
    directory: folder,
    now: () => capturedAt,
    model: () => model as unknown as WorkforceModel,
    budgetStore: new MemoryDailyStore(),
  });
  const second = await groundImportedEvidenceOnce(actor, "localhost:3000", args, {
    directory: folder,
    now: () => capturedAt,
    model: () => model as unknown as WorkforceModel,
    budgetStore: new MemoryDailyStore(),
  });
  expect(first).toMatchObject({ status: "COMPLETED", modelCalls: 1 });
  expect(first.groundingAudit?.status).toBe("ACCEPTED");
  expect(first.groundingAudit?.candidates.every((candidate) => candidate.verified === false)).toBe(
    true,
  );
  expect(first.id).toBe(second.id);
  expect(model.structured).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(source)).toBe(originalHash);
  const saved = await readFile(join(folder, "grounding-versions", `${first.id}.json`), "utf8");
  expect(JSON.parse(saved).sourceEvidence.sources[0].sha256).toBe(
    source.importedEvidence.sources[0].sha256,
  );
});

it("retains a rejected claim in the separate audit without treating the whole packet as accepted", async () => {
  const source = JSON.parse(await readFile(join(folder, `${packetId}.json`), "utf8"));
  const mapped = adaptImportedEvidenceToWorkforceRun(
    internalDocumentSchema.parse(source),
    "swarovski.com",
    capturedAt,
  );
  const model = fakeModel(
    rejectingReview(
      mapped.research.facts.map((fact) => fact.id),
      mapped.research.facts[0].sourceIds[0],
    ),
  );
  const result = await groundImportedEvidenceOnce(
    actor,
    "localhost:3000",
    { packetId, companyDomain: "swarovski.com", paidAiAuthorized: true },
    {
      directory: folder,
      now: () => capturedAt,
      model: () => model as unknown as WorkforceModel,
      budgetStore: new MemoryDailyStore(),
    },
  );
  expect(result.status).toBe("COMPLETED");
  expect(result.groundingAudit?.status).toBe("REJECTED");
  expect(result.groundingAudit?.reasonCodes).toContain("REJECTED_FACTS");
  expect(result.groundingAudit?.candidates[0]).toMatchObject({
    reviewerDecision: "REJECTED",
    sourceIds: [mapped.research.facts[0].sourceIds[0]],
    quotes: [{ exactMatch: true }],
  });
});

it("requires the explicit paid authorization and leaves no version or model call when absent", async () => {
  const model = fakeModel({});
  await expect(
    groundImportedEvidenceOnce(
      actor,
      "localhost:3000",
      { packetId, companyDomain: "swarovski.com", paidAiAuthorized: false },
      { directory: folder, model: () => model as unknown as WorkforceModel },
    ),
  ).rejects.toThrow("PAID_AUTHORIZATION_REQUIRED");
  await expect(readFile(join(folder, "grounding-versions"))).rejects.toThrow();
  expect(model.structured).not.toHaveBeenCalled();
});

it("preserves the local operator and host guard before reading imported packets", async () => {
  const model = fakeModel({});
  await expect(
    groundImportedEvidenceOnce(
      "different-actor",
      "localhost:3000",
      { packetId, companyDomain: "swarovski.com", paidAiAuthorized: true },
      { directory: folder, model: () => model as unknown as WorkforceModel },
    ),
  ).rejects.toThrow("LOCAL_COMPANY_ONLY");
  await expect(
    groundImportedEvidenceOnce(
      actor,
      "external.example",
      { packetId, companyDomain: "swarovski.com", paidAiAuthorized: true },
      { directory: folder, model: () => model as unknown as WorkforceModel },
    ),
  ).rejects.toThrow("LOCAL_COMPANY_ONLY");
  expect(model.structured).not.toHaveBeenCalled();
});
