import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  buildAccountAssessment,
  classifyFacts,
} from "@/features/account-research/account-research-policy";
import {
  companyTypes,
  factStatuses,
  yesNoUnknownOptions,
  type AccountAssessmentResult,
  type AccountResearchInput,
} from "@/features/account-research/types";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { err, ok } from "./result";

const factStatusSchema = z.record(z.enum(factStatuses));

const accountResearchInputSchema = z.object({
  companyName: z.string().trim().min(1).max(180),
  companyDomain: z.string().trim().max(240).optional(),
  industry: z.string().trim().max(160).optional(),
  headquartersOrMainMarket: z.string().trim().max(160).optional(),
  marketsOrCountries: z.string().trim().max(240).optional(),
  revenueContext: z.string().trim().max(240).optional(),
  employeeContext: z.string().trim().max(240).optional(),
  companyType: z.enum(companyTypes),
  brandedSearchAdsActive: z.enum(yesNoUnknownOptions),
  strongOrganicBrandVisibility: z.enum(yesNoUnknownOptions),
  meaningfulBrandedSearchDemand: z.enum(yesNoUnknownOptions),
  multiMarketOrBrandComplexity: z.enum(yesNoUnknownOptions),
  dedicatedPaidSearchOrPerformanceTeam: z.enum(yesNoUnknownOptions),
  knownPaidSearchOwner: z.string().trim().max(160).optional(),
  knownCurrentToolOrVendor: z.string().trim().max(160).optional(),
  meaningfulPaidSearchInvestment: z.enum(yesNoUnknownOptions),
  observedTrigger: z.string().trim().max(700).optional(),
  knownPain: z.string().trim().max(700).optional(),
  accountOwner: z.string().trim().max(160).optional(),
  lastContactDate: z.string().trim().max(80).optional(),
  existingCustomer: z.enum(yesNoUnknownOptions),
  activeOpportunity: z.enum(yesNoUnknownOptions),
  ownedByAnotherRep: z.enum(yesNoUnknownOptions),
  doNotContactStatus: z.enum(yesNoUnknownOptions),
  internalNotes: z.string().trim().max(1600).optional(),
  factStatuses: factStatusSchema.default({}),
  adminEvidenceRequested: z.boolean().optional(),
  creatorId: z.string().trim().min(1).optional(),
});

type Row = Record<string, unknown>;

export type AccountResearchPersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  getSuppressionRecords(): Promise<DoNotContactRecord[]>;
  persistAssessment(input: {
    creatorId: string;
    request: AccountResearchInput;
    result: Omit<AccountAssessmentResult, "assessmentId">;
  }): Promise<string>;
};

export type AccountResearchDependencies = {
  persistence?: AccountResearchPersistence;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export class PrismaAccountResearchPersistence implements AccountResearchPersistence {
  constructor(private readonly client: MinimalPrismaClient = prisma) {}

  async getActor(actorId: string) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, role
      FROM "User"
      WHERE id = ${actorId}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? { id: asString(row.id), role: asString(row.role) } : null;
  }

  async getSuppressionRecords() {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "companyName", domain, status, "accountOwner", reason, notes, "lastContactDate"::text AS "lastContactDate"
      FROM "SuppressionRecord"
    `;
    return rows.map((row) => ({
      id: asString(row.id),
      companyName: asString(row.companyName),
      domain: asString(row.domain) || undefined,
      status: asString(row.status) as DoNotContactRecord["status"],
      owner: asString(row.accountOwner) || undefined,
      reason: asString(row.reason) || undefined,
      notes: asString(row.notes) || undefined,
      lastContactDate: asString(row.lastContactDate) || undefined,
    }));
  }

  async persistAssessment({
    creatorId,
    request,
    result,
  }: {
    creatorId: string;
    request: AccountResearchInput;
    result: Omit<AccountAssessmentResult, "assessmentId">;
  }) {
    const id = randomUUID();
    await this.client.$executeRaw`
      INSERT INTO "AccountAssessment" (
        id,
        "userId",
        "companyName",
        domain,
        "inputSnapshot",
        "factStatuses",
        "qualificationResult",
        confidence,
        "verifiedSignals",
        assumptions,
        "missingInformation",
        "suppressionResult",
        "personaRecommendation",
        "angleRecommendation",
        "recommendedNextAction",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${creatorId},
        ${request.companyName},
        ${request.companyDomain ?? null},
        ${JSON.stringify(request)}::jsonb,
        ${JSON.stringify(result.factClassifications)}::jsonb,
        ${result.qualificationResult},
        ${result.confidence},
        ${result.verifiedSignals}::text[],
        ${result.assumptions}::text[],
        ${result.missingInformation}::text[],
        ${JSON.stringify(result.suppression)}::jsonb,
        ${JSON.stringify(result.personaRecommendation)}::jsonb,
        ${JSON.stringify(result.angleRecommendation)}::jsonb,
        ${result.recommendedNextAction},
        NOW(),
        NOW()
      )
    `;
    return id;
  }
}

export async function assessAccountResearch(
  rawInput: unknown,
  dependencies: AccountResearchDependencies = {},
) {
  const parsed = accountResearchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Account Research input is malformed.");
  }

  const input = parsed.data;
  const creatorId = input.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaAccountResearchPersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || !["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role)) {
    return err("FORBIDDEN", "Only authorized sales or knowledge users can assess accounts.");
  }
  if (input.adminEvidenceRequested && actor.role !== "KNOWLEDGE_ADMIN") {
    return err("FORBIDDEN", "Only knowledge admins can inspect assessment evidence.");
  }

  const suppressionRecords = await persistence.getSuppressionRecords();
  const built = buildAccountAssessment(input, suppressionRecords);
  const resultWithoutId: Omit<AccountAssessmentResult, "assessmentId"> = {
    qualificationResult: built.qualification.result,
    confidence: built.qualification.confidence,
    industryEvidence: built.industryEvidence,
    factClassifications: classifyFacts(input),
    verifiedSignals: built.verifiedSignals,
    assumptions: built.assumptions,
    unknowns: built.unknowns,
    missingInformation: built.qualification.missing,
    disqualificationRisks: built.qualification.risks,
    suppression: built.suppression,
    personaRecommendation: built.personaRecommendation,
    angleRecommendation: built.angleRecommendation,
    recommendedNextAction: built.qualification.nextStep,
    researchChecklist: built.researchChecklist,
    workflowLinks: built.workflowLinks,
    internalNotes: input.internalNotes,
  };

  const assessmentId = await persistence.persistAssessment({
    creatorId,
    request: input,
    result: resultWithoutId,
  });

  return ok<AccountAssessmentResult>({
    assessmentId,
    ...resultWithoutId,
  });
}
