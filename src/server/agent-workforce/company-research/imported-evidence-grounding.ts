import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type WorkforceRun, intakeSchema } from "@/features/agent-workforce/gate-a-contracts";
import {
  importedEvidenceGroundingVersionSchema,
  internalDocumentSchema,
  type ImportedEvidenceGroundingVersion,
} from "@/features/agent-workforce/company-research/internal-review";
import { requireLocalCompanyAccess } from "./config";
import { automaticCompanyConfig } from "./automatic-execution";
import { localDevelopmentHost } from "@/lib/auth/local-development";
import { initialRun } from "../store";
import { validateResearch } from "../evidence-validation";
import { validateCompanyGroundingWithAi } from "./grounding-review";
import { buildGroundingAudit } from "./grounding-audit";
import { LocalCompanyBudgetStore } from "./store";
import { withBudgetContext, BudgetError } from "../daily/budget";
import type { DailyStore } from "../daily/state";
import { OpenAiWorkforceModel, WorkforceError, type WorkforceModel } from "../openai";

const packetDirectory = () =>
  join(process.cwd(), "outputs", "product-demonstration", "company-reviews");
const versionDirectory = () => join(packetDirectory(), "grounding-versions");
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function adaptImportedEvidenceToWorkforceRun(
  packet: ReturnType<typeof internalDocumentSchema.parse>,
  companyDomain: string,
  now = new Date(),
): WorkforceRun {
  const imported = packet.importedEvidence;
  if (!imported || imported.kind !== "PUBLIC_EVIDENCE_IMPORT" || !imported.sourceReports.length)
    throw new Error("GROUNDING_INPUT_INVALID");

  const sourceById = new Map(imported.sources.map((source) => [source.id, source]));
  if (
    sourceById.size !== imported.sources.length ||
    new Set(imported.sourceReports.map((report) => report.id)).size !==
      imported.sourceReports.length
  )
    throw new Error("GROUNDING_INPUT_INVALID");

  for (const source of imported.sources) {
    if (
      sha256(source.excerpt) !== source.sha256 ||
      !source.id.startsWith("import:") ||
      new URL(source.originalUrl).protocol !== "https:"
    )
      throw new Error("GROUNDING_INPUT_INVALID");
  }
  const reportSourceIds = new Set<string>();
  for (const report of imported.sourceReports) {
    const source = sourceById.get(report.sourceId);
    if (
      report.status !== "SOURCE_REPORTED_UNVERIFIED" ||
      !source ||
      !source.excerpt.includes(report.exactQuote)
    )
      throw new Error("GROUNDING_INPUT_INVALID");
    reportSourceIds.add(report.sourceId);
  }
  // Each captured document must contribute at least one exact-quote-bound candidate.
  if (imported.sources.some((source) => !reportSourceIds.has(source.id)))
    throw new Error("GROUNDING_INPUT_INVALID");

  const intake = intakeSchema.parse({
    companyName: packet.company,
    companyDomain,
    prospectName: "Generic fictional recipient",
    prospectTitle: "Fictional Paid Search buyer",
  });
  const run = initialRun(
    packet.owner,
    `imported-grounding:${packet.id}:${packet.createdAt}`,
    intake,
    now,
  );
  const sources = imported.sources.map((source) => ({
    id: source.id,
    // Ground the URL from which the excerpt was actually captured; originalUrl
    // and redirect resolution remain preserved verbatim in sourceEvidence.
    url: source.resolvedUrl ?? source.originalUrl,
    title: source.title,
    observedAt: source.retrievedAt,
    excerpt: source.excerpt,
    sourceType: "PUBLIC_WEB" as const,
  }));
  const sourceUrlAllowlist = new Map(
    imported.sources.map((source) => [source.id, source.resolvedUrl ?? source.originalUrl]),
  );
  const facts = imported.sourceReports.map((report) => {
    const source = sourceById.get(report.sourceId)!;
    const profileListing = /\b(?:profile|listing|employment|responsibilities)\b/i.test(
      report.statement,
    );
    return {
      id: `account:imported:${report.id}`,
      statement: report.statement,
      // Keep source meta-claims about an individual in the prospect lane; never
      // convert them into company evidence or a verified-current role assertion.
      subject: profileListing ? ("PROSPECT" as const) : ("ACCOUNT" as const),
      category: profileListing ? ("POSITION" as const) : ("DEVELOPMENT" as const),
      sourceIds: [report.sourceId],
      confidence: "MEDIUM" as const,
      limitations: [
        `Source-reported only; temporal scope: ${source.temporalScope}. ${source.displayedDate}`,
        "This candidate does not independently establish the underlying performance result or Alice's current role.",
      ],
      quotes: [{ sourceId: report.sourceId, text: report.exactQuote }],
    };
  });
  if (
    !sources.some(
      (source) =>
        normalize(source.excerpt).includes(normalize(packet.company)) ||
        normalize(source.url).includes(normalize(packet.company)),
    )
  )
    throw new Error("GROUNDING_INPUT_INVALID");

  run.research = {
    accountDomain: companyDomain,
    prospectId: run.id,
    researchedAt: imported.capturedAt,
    sources,
    facts,
    gaps: [
      "Imported claims remain source-reported until independently grounded.",
      "Alice's current employment, title, and responsibilities are UNKNOWN.",
      ...imported.unavailableSources.map((source) => `Source unavailable: ${source.code}`),
    ],
    assumptions: [],
  };
  run.stage = "EVIDENCE_VALIDATION";
  run.events = [{ stage: "EVIDENCE_VALIDATION", state: "STARTED", at: now.toISOString() }];
  const issues = validateResearch(
    run,
    now,
    { company: false, prospect: false },
    sourceUrlAllowlist,
  );
  if (issues.length) throw new Error("GROUNDING_VALIDATION_FAILED");
  return run;
}

type GroundImportedRequest = {
  packetId: string;
  companyDomain: string;
  paidAiAuthorized: boolean;
};
type Dependencies = {
  model?: () => WorkforceModel;
  budgetStore?: DailyStore;
  directory?: string;
  now?: () => Date;
};

function sanitizedFailure(error: unknown): ImportedEvidenceGroundingVersion["failureCode"] {
  if (
    error instanceof BudgetError ||
    (error instanceof WorkforceError && error.code === "NOT_CONFIGURED")
  )
    return "BUDGET_OR_PROVIDER_BLOCKED";
  if (error instanceof Error && error.message === "GROUNDING_VALIDATION_FAILED")
    return "GROUNDING_VALIDATION_FAILED";
  if (error instanceof Error && error.message === "GROUNDING_INPUT_INVALID")
    return "GROUNDING_INPUT_INVALID";
  if (error instanceof WorkforceError && error.code === "INVALID_MODEL_OUTPUT")
    return "GROUNDING_RESULT_INVALID";
  return "GROUNDING_UNAVAILABLE";
}

export async function groundImportedEvidenceOnce(
  actor: string,
  host: string | null,
  request: GroundImportedRequest,
  deps: Dependencies = {},
) {
  requireLocalCompanyAccess(actor);
  if (!localDevelopmentHost(host)) throw new Error("LOCAL_COMPANY_ONLY");
  if (!request.paidAiAuthorized) throw new Error("PAID_AUTHORIZATION_REQUIRED");
  // This existing opt-in config is also the server-side AI, pricing, retry, and daily/monthly gate.
  const config = automaticCompanyConfig(actor);
  const base = deps.directory ?? packetDirectory();
  const raw = await readFile(join(base, `${request.packetId}.json`), "utf8");
  const packet = internalDocumentSchema.parse(JSON.parse(raw));
  if (packet.id !== request.packetId || packet.owner !== actor || !packet.importedEvidence)
    throw new Error("GROUNDING_INPUT_INVALID");
  const packetHash = sha256(raw);
  const run = adaptImportedEvidenceToWorkforceRun(
    packet,
    request.companyDomain,
    (deps.now ?? (() => new Date()))(),
  );
  const versionId = `grounding-${packet.id}-${packetHash.slice(0, 16)}`;
  const folder = deps.directory ? join(deps.directory, "grounding-versions") : versionDirectory();
  const path = join(folder, `${versionId}.json`);
  await mkdir(folder, { recursive: true });
  const startedAt = (deps.now ?? (() => new Date()))().toISOString();
  let version: ImportedEvidenceGroundingVersion = importedEvidenceGroundingVersionSchema.parse({
    version: 1,
    kind: "IMPORTED_EVIDENCE_GROUNDING",
    id: versionId,
    owner: actor,
    sourcePacketId: packet.id,
    sourcePacketSha256: packetHash,
    companyDomain: request.companyDomain,
    startedAt,
    completedAt: null,
    status: "RUNNING",
    modelCalls: 0,
    failureCode: null,
    sourceEvidence: packet.importedEvidence,
    research: run.research,
    groundingAudit: null,
    usage: [],
  });
  try {
    await writeFile(path, JSON.stringify(version), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const saved = importedEvidenceGroundingVersionSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
    if (saved.owner !== actor || saved.sourcePacketSha256 !== packetHash)
      throw new Error("GROUNDING_INPUT_INVALID");
    return saved;
  }

  const save = async () => {
    const temporary = `${path}.pending`;
    await writeFile(
      temporary,
      JSON.stringify(importedEvidenceGroundingVersionSchema.parse(version)),
    );
    await rename(temporary, path);
  };
  try {
    version.modelCalls = 1;
    await save();
    await withBudgetContext(
      {
        actor,
        runId: run.id,
        config: config.budget,
        store: deps.budgetStore ?? new LocalCompanyBudgetStore(),
      },
      async () => {
        const model = deps.model
          ? deps.model()
          : new OpenAiWorkforceModel(config.providerEnv, undefined, config.modelOptions);
        const review = await validateCompanyGroundingWithAi(run, model);
        run.events[0] = {
          stage: "EVIDENCE_VALIDATION",
          state: "COMPLETED",
          at: (deps.now ?? (() => new Date()))().toISOString(),
        };
        version = importedEvidenceGroundingVersionSchema.parse({
          ...version,
          completedAt: (deps.now ?? (() => new Date()))().toISOString(),
          status: "COMPLETED",
          failureCode: null,
          research: run.research,
          groundingAudit: buildGroundingAudit(run.research, review),
          usage: run.usage,
        });
        await save();
      },
    );
    return version;
  } catch (error) {
    version = importedEvidenceGroundingVersionSchema.parse({
      ...version,
      completedAt: (deps.now ?? (() => new Date()))().toISOString(),
      status: "FAILED",
      modelCalls: error instanceof BudgetError ? 0 : version.modelCalls,
      failureCode: sanitizedFailure(error),
      usage: run.usage,
    });
    await save();
    return version;
  }
}
