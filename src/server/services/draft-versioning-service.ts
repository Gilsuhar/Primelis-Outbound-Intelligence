import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  refinementCommands,
  refinementWorkflows,
  type AiProviderStatus,
  type DraftRefinementResult,
  type DraftSafetyFlag,
  type DraftVersionView,
  type RefinementCommand,
  type RefinementWorkflow,
} from "@/features/draft-refinement/types";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import {
  applySafetyFix,
  compactApprovedContext,
  stripPromptInjection,
  validateDraftSafety,
} from "./approved-context-service";
import { createAiProvider, mapAiProviderError, type AiProvider } from "./ai-provider";
import { err, ok } from "./result";

type Row = Record<string, unknown>;

const refineDraftSchema = z.object({
  generatedDraftId: z.string().trim().min(1),
  workflow: z.enum(refinementWorkflows),
  command: z.enum(refinementCommands),
  selectedText: z.string().trim().max(2000).optional(),
  customFeedback: z.string().trim().max(1200).optional(),
  targetPersona: z.string().trim().max(160).optional(),
  targetAngle: z.string().trim().max(160).optional(),
  desiredLength: z.string().trim().max(80).optional(),
  tone: z.string().trim().max(80).optional(),
  creatorId: z.string().trim().min(1).optional(),
});

const manualEditSchema = z.object({
  generatedDraftId: z.string().trim().min(1),
  workflow: z.enum(refinementWorkflows),
  editedContent: z.string().trim().min(1).max(8000),
  creatorId: z.string().trim().min(1).optional(),
});

const restoreSchema = z.object({
  generatedDraftId: z.string().trim().min(1),
  versionId: z.string().trim().min(1),
  creatorId: z.string().trim().min(1).optional(),
});

export type DraftVersionPersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  getDraft(draftId: string): Promise<{
    id: string;
    userId: string;
    workflow: RefinementWorkflow;
    draftContent: string;
    alternativeContent?: string;
    inputSnapshot?: unknown;
    sourceIds: string[];
    retrievedKnowledgeIds: string[];
    providerName?: string;
    modelName?: string;
  } | null>;
  getVersions(draftId: string): Promise<DraftVersionView[]>;
  createVersion(input: {
    generatedDraftId: string;
    draftFamilyId: string;
    parentVersionId?: string;
    workflow: RefinementWorkflow;
    actionType: string;
    refinementCommand?: RefinementCommand;
    userInstruction?: string;
    generatedContent: string;
    alternativeContent?: string;
    sourceReferences: Array<{ id: string; title?: string; sourceDate?: string }>;
    knowledgeReferences: string[];
    providerName: string;
    modelName: string;
    providerStatus: AiProviderStatus;
    safetyFlags: DraftSafetyFlag[];
    createdBy: string;
    manualEdit?: boolean;
  }): Promise<DraftVersionView>;
  setPreferred(versionId: string, draftId: string): Promise<void>;
};

export type DraftVersioningDependencies = {
  persistence?: DraftVersionPersistence;
  provider?: AiProvider;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asSafetyFlags(value: unknown): DraftSafetyFlag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DraftSafetyFlag => {
    const flag = item as Partial<DraftSafetyFlag>;
    return typeof flag.flaggedWording === "string" && typeof flag.reason === "string";
  });
}

function asSources(value: unknown): Array<{ id: string; title?: string; sourceDate?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item as { id?: unknown; title?: unknown; sourceDate?: unknown })
    .filter((item) => typeof item.id === "string")
    .map((item) => ({
      id: item.id as string,
      title: typeof item.title === "string" ? item.title : undefined,
      sourceDate: typeof item.sourceDate === "string" ? item.sourceDate : undefined,
    }));
}

function mapVersion(row: Row): DraftVersionView {
  return {
    id: asString(row.id),
    generatedDraftId: asString(row.generatedDraftId),
    draftFamilyId: asString(row.draftFamilyId),
    parentVersionId: asOptionalString(row.parentVersionId),
    versionNumber: Number(row.versionNumber),
    workflow: asString(row.workflow) as RefinementWorkflow,
    actionType: asString(row.actionType),
    refinementCommand: asOptionalString(row.refinementCommand) as RefinementCommand | undefined,
    userInstruction: asOptionalString(row.userInstruction),
    generatedContent: asString(row.generatedContent),
    alternativeContent: asOptionalString(row.alternativeContent),
    sourceReferences: asSources(row.sourceReferences),
    knowledgeReferences: asStringArray(row.knowledgeReferences),
    providerName: asString(row.providerName),
    modelName: asString(row.modelName),
    providerStatus: asString(row.providerStatus) as AiProviderStatus,
    safetyFlags: asSafetyFlags(row.safetyFlags),
    createdBy: asString(row.createdBy),
    createdAt: asString(row.createdAt),
    isCurrent: Boolean(row.isCurrent),
    isPreferred: Boolean(row.isPreferred),
    manualEdit: Boolean(row.manualEdit),
  };
}

export class PrismaDraftVersionPersistence implements DraftVersionPersistence {
  constructor(private readonly client: MinimalPrismaClient = prisma) {}

  async getActor(actorId: string) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, role FROM "User" WHERE id = ${actorId} LIMIT 1
    `;
    const row = rows[0];
    return row ? { id: asString(row.id), role: asString(row.role) } : null;
  }

  async getDraft(draftId: string) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "userId", workflow, "draftContent", "alternativeContent", "inputSnapshot", "sourceIds", "retrievedKnowledgeIds", "providerName", "modelName"
      FROM "GeneratedDraft"
      WHERE id = ${draftId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: asString(row.id),
      userId: asString(row.userId),
      workflow: asString(row.workflow) as RefinementWorkflow,
      draftContent: asString(row.draftContent),
      alternativeContent: asOptionalString(row.alternativeContent),
      inputSnapshot: row.inputSnapshot,
      sourceIds: asStringArray(row.sourceIds),
      retrievedKnowledgeIds: asStringArray(row.retrievedKnowledgeIds),
      providerName: asOptionalString(row.providerName),
      modelName: asOptionalString(row.modelName),
    };
  }

  async getVersions(draftId: string) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "generatedDraftId", "draftFamilyId", "parentVersionId", "versionNumber", workflow, "actionType", "refinementCommand", "userInstruction",
             "generatedContent", "alternativeContent", "sourceReferences", "knowledgeReferences", "providerName", "modelName", "providerStatus",
             "safetyFlags", "createdBy", "createdAt"::text AS "createdAt", "isCurrent", "isPreferred", "manualEdit"
      FROM "DraftVersion"
      WHERE "generatedDraftId" = ${draftId}
      ORDER BY "versionNumber" ASC
    `;
    return rows.map(mapVersion);
  }

  async createVersion(input: {
    generatedDraftId: string;
    draftFamilyId: string;
    parentVersionId?: string;
    workflow: RefinementWorkflow;
    actionType: string;
    refinementCommand?: RefinementCommand;
    userInstruction?: string;
    generatedContent: string;
    alternativeContent?: string;
    sourceReferences: Array<{ id: string; title?: string; sourceDate?: string }>;
    knowledgeReferences: string[];
    providerName: string;
    modelName: string;
    providerStatus: AiProviderStatus;
    safetyFlags: DraftSafetyFlag[];
    createdBy: string;
    manualEdit?: boolean;
  }) {
    const existing = await this.getVersions(input.generatedDraftId);
    const id = randomUUID();
    const versionNumber = existing.length + 1;
    await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "DraftVersion" SET "isCurrent" = false WHERE "generatedDraftId" = ${input.generatedDraftId}
      `;
      await tx.$executeRaw`
        INSERT INTO "DraftVersion" (
          id, "generatedDraftId", "draftFamilyId", "parentVersionId", "versionNumber", workflow, "actionType", "refinementCommand", "userInstruction",
          "generatedContent", "alternativeContent", "sourceReferences", "knowledgeReferences", "providerName", "modelName", "providerStatus",
          "safetyFlags", "createdBy", "createdAt", "isCurrent", "isPreferred", "manualEdit"
        )
        VALUES (
          ${id}, ${input.generatedDraftId}, ${input.draftFamilyId}, ${input.parentVersionId ?? null}, ${versionNumber}, ${input.workflow}, ${input.actionType},
          ${input.refinementCommand ?? null}, ${input.userInstruction ?? null}, ${input.generatedContent}, ${input.alternativeContent ?? null},
          ${JSON.stringify(input.sourceReferences)}::jsonb, ${input.knowledgeReferences}::text[], ${input.providerName}, ${input.modelName}, ${input.providerStatus},
          ${JSON.stringify(input.safetyFlags)}::jsonb, ${input.createdBy}, NOW(), true, ${existing.length === 0}, ${input.manualEdit ?? false}
        )
      `;
      await tx.$executeRaw`
        UPDATE "GeneratedDraft"
        SET "draftContent" = ${input.generatedContent}, "alternativeContent" = ${input.alternativeContent ?? null}, "updatedAt" = NOW()
        WHERE id = ${input.generatedDraftId}
      `;
    });
    const versions = await this.getVersions(input.generatedDraftId);
    return versions.find((version) => version.id === id) ?? versions.at(-1)!;
  }

  async setPreferred(versionId: string, draftId: string) {
    await this.client.$executeRaw`
      UPDATE "DraftVersion"
      SET "isPreferred" = (id = ${versionId})
      WHERE "generatedDraftId" = ${draftId}
    `;
  }
}

function safetyStatus(flags: DraftSafetyFlag[]) {
  if (flags.some((flag) => flag.status === "Restricted")) return "Restricted";
  if (flags.some((flag) => flag.status === "Unsupported")) return "Unsupported";
  if (flags.some((flag) => flag.status === "Needs revision")) return "Needs revision";
  return "Safe";
}

async function authorize(creatorId: string, persistence: DraftVersionPersistence) {
  const actor = await persistence.getActor(creatorId);
  return Boolean(actor && ["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role));
}

async function ensureInitialVersion(
  draftId: string,
  creatorId: string,
  persistence: DraftVersionPersistence,
) {
  const draft = await persistence.getDraft(draftId);
  if (!draft) return null;
  const versions = await persistence.getVersions(draftId);
  if (versions.length > 0) return { draft, versions };
  const flags = validateDraftSafety(draft.draftContent);
  const version = await persistence.createVersion({
    generatedDraftId: draft.id,
    draftFamilyId: draft.id,
    workflow: draft.workflow,
    actionType: "GENERATE",
    generatedContent: draft.draftContent,
    alternativeContent: draft.alternativeContent,
    sourceReferences: draft.sourceIds.map((id) => ({ id })),
    knowledgeReferences: draft.retrievedKnowledgeIds,
    providerName: draft.providerName ?? "unknown",
    modelName: draft.modelName ?? "unknown",
    providerStatus: "CONFIGURED",
    safetyFlags: flags,
    createdBy: creatorId,
  });
  return { draft, versions: [version] };
}

export async function createInitialDraftVersion(
  input: {
    generatedDraftId: string;
    creatorId: string;
  },
  dependencies: DraftVersioningDependencies = {},
) {
  const persistence = dependencies.persistence ?? new PrismaDraftVersionPersistence();
  const initialized = await ensureInitialVersion(
    input.generatedDraftId,
    input.creatorId,
    persistence,
  );
  if (!initialized) return err("DRAFT_NOT_FOUND", "Generated draft was not found.");
  return ok(initialized.versions.at(-1)!);
}

export async function refineDraftVersion(
  rawInput: unknown,
  dependencies: DraftVersioningDependencies = {},
) {
  const parsed = refineDraftSchema.safeParse(rawInput);
  if (!parsed.success) return err("VALIDATION_ERROR", "Draft refinement input is malformed.");
  const creatorId = parsed.data.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaDraftVersionPersistence();
  if (!(await authorize(creatorId, persistence))) {
    return err("FORBIDDEN", "Only authorized sales or knowledge users can refine drafts.");
  }
  const initialized = await ensureInitialVersion(
    parsed.data.generatedDraftId,
    creatorId,
    persistence,
  );
  if (!initialized) return err("DRAFT_NOT_FOUND", "Generated draft was not found.");
  const current =
    initialized.versions.find((version) => version.isCurrent) ?? initialized.versions.at(-1)!;
  const provider = dependencies.provider ?? createAiProvider();
  const providerStatus = await provider.getProviderStatus();
  const safeInstruction = stripPromptInjection(
    [
      parsed.data.customFeedback,
      parsed.data.targetPersona,
      parsed.data.targetAngle,
      parsed.data.desiredLength,
      parsed.data.tone,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const currentContent =
    parsed.data.command === "FIX_SAFETY"
      ? applySafetyFix(current.generatedContent)
      : current.generatedContent;
  let content = currentContent;
  let alternative = current.alternativeContent;
  let providerState = providerStatus;
  try {
    const context = compactApprovedContext({
      approvedFacts: current.knowledgeReferences,
      sourceReferences: current.sourceReferences,
      userContext: [safeInstruction],
    });
    const aiResult = await provider.refineDraft({
      workflow: parsed.data.workflow,
      command: parsed.data.command,
      currentDraft: currentContent,
      selectedText: parsed.data.selectedText,
      userInstruction: safeInstruction,
      context,
    });
    content = aiResult.primaryContent;
    alternative = aiResult.shorterAlternative ?? alternative;
  } catch (error) {
    providerState = mapAiProviderError(error);
  }
  const safetyFlags = validateDraftSafety(content);
  const version = await persistence.createVersion({
    generatedDraftId: initialized.draft.id,
    draftFamilyId: current.draftFamilyId,
    parentVersionId: current.id,
    workflow: parsed.data.workflow,
    actionType: "REFINE",
    refinementCommand: parsed.data.command,
    userInstruction: safeInstruction || undefined,
    generatedContent: content,
    alternativeContent: alternative,
    sourceReferences: current.sourceReferences,
    knowledgeReferences: current.knowledgeReferences,
    providerName: providerState.providerName,
    modelName: providerState.modelName,
    providerStatus: providerState.status,
    safetyFlags,
    createdBy: creatorId,
  });
  const versions = await persistence.getVersions(initialized.draft.id);
  return ok<DraftRefinementResult>({
    providerStatus: providerState,
    currentVersion: version,
    versions,
    safetyStatus: safetyStatus(safetyFlags),
  });
}

export async function saveManualDraftEdit(
  rawInput: unknown,
  dependencies: DraftVersioningDependencies = {},
) {
  const parsed = manualEditSchema.safeParse(rawInput);
  if (!parsed.success) return err("VALIDATION_ERROR", "Manual draft edit input is malformed.");
  const creatorId = parsed.data.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaDraftVersionPersistence();
  if (!(await authorize(creatorId, persistence)))
    return err("FORBIDDEN", "Only authorized users can edit drafts.");
  const initialized = await ensureInitialVersion(
    parsed.data.generatedDraftId,
    creatorId,
    persistence,
  );
  if (!initialized) return err("DRAFT_NOT_FOUND", "Generated draft was not found.");
  const current =
    initialized.versions.find((version) => version.isCurrent) ?? initialized.versions.at(-1)!;
  const content = stripPromptInjection(parsed.data.editedContent);
  const flags = validateDraftSafety(content);
  const version = await persistence.createVersion({
    generatedDraftId: initialized.draft.id,
    draftFamilyId: current.draftFamilyId,
    parentVersionId: current.id,
    workflow: parsed.data.workflow,
    actionType: "MANUAL_EDIT",
    generatedContent: content,
    alternativeContent: current.alternativeContent,
    sourceReferences: current.sourceReferences,
    knowledgeReferences: current.knowledgeReferences,
    providerName: "manual-edit",
    modelName: "manual",
    providerStatus: "CONFIGURED",
    safetyFlags: flags,
    createdBy: creatorId,
    manualEdit: true,
  });
  return ok({
    currentVersion: version,
    versions: await persistence.getVersions(initialized.draft.id),
    safetyStatus: safetyStatus(flags),
  });
}

export async function restoreDraftVersion(
  rawInput: unknown,
  dependencies: DraftVersioningDependencies = {},
) {
  const parsed = restoreSchema.safeParse(rawInput);
  if (!parsed.success) return err("VALIDATION_ERROR", "Restore input is malformed.");
  const creatorId = parsed.data.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaDraftVersionPersistence();
  if (!(await authorize(creatorId, persistence)))
    return err("FORBIDDEN", "Only authorized users can restore drafts.");
  const initialized = await ensureInitialVersion(
    parsed.data.generatedDraftId,
    creatorId,
    persistence,
  );
  if (!initialized) return err("DRAFT_NOT_FOUND", "Generated draft was not found.");
  const target = initialized.versions.find((version) => version.id === parsed.data.versionId);
  const current =
    initialized.versions.find((version) => version.isCurrent) ?? initialized.versions.at(-1)!;
  if (!target) return err("VERSION_NOT_FOUND", "Draft version was not found.");
  const version = await persistence.createVersion({
    generatedDraftId: initialized.draft.id,
    draftFamilyId: current.draftFamilyId,
    parentVersionId: target.id,
    workflow: target.workflow,
    actionType: "RESTORE",
    generatedContent: target.generatedContent,
    alternativeContent: target.alternativeContent,
    sourceReferences: target.sourceReferences,
    knowledgeReferences: target.knowledgeReferences,
    providerName: "restore",
    modelName: "restore",
    providerStatus: "CONFIGURED",
    safetyFlags: validateDraftSafety(target.generatedContent),
    createdBy: creatorId,
  });
  await persistence.setPreferred(version.id, initialized.draft.id);
  return ok({
    currentVersion: version,
    versions: await persistence.getVersions(initialized.draft.id),
    safetyStatus: safetyStatus(version.safetyFlags),
  });
}
