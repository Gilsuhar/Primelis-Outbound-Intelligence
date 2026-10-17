import { configuredDatabaseUrl } from "@/lib/preview-isolation";
import "server-only";
import {
  knowledgeRecordSchema,
  type KnowledgeRecord,
} from "@/features/agent-workforce/gate-a-contracts";
import { isEligibleProof } from "@/features/proof/proof-policy";
import type { MinimalPrismaClient } from "@/lib/prisma";
import { WorkforceError } from "./openai";

/** Authoritative empty/revoked registry differs from a database outage. */
export class NoApprovedKnowledgeError extends WorkforceError {
  constructor() {
    super(
      "MISSING_KNOWLEDGE",
      "No externally approved, source-backed Signal product wording is available; generation is blocked",
    );
  }
}
export async function loadApprovedProductKnowledge(
  client?: MinimalPrismaClient,
): Promise<KnowledgeRecord[]> {
  if (!client && !configuredDatabaseUrl())
    throw new WorkforceError(
      "MISSING_KNOWLEDGE",
      "Approved product knowledge database is unavailable",
    );
  const db = client ?? (await import("@/lib/prisma")).prisma;
  // Join actual source relationships; never use the development fixture repository.
  const rows = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT k.id, k.title, k."approvedWording" AS text,
      CASE WHEN k.type::text = 'ICP' THEN 'ICP' ELSE 'PRODUCT' END AS kind,
      k."usageRestrictions" AS restrictions,
      COALESCE(array_agg(s.id) FILTER (WHERE s.id IS NOT NULL), '{}') AS "sourceIds",
      COALESCE(array_agg(s."externalUrl") FILTER (WHERE s."externalUrl" LIKE 'https://%'), '{}') AS "sourceUrls"
    FROM "KnowledgeItem" k
    JOIN "_KnowledgeItemSources" ks ON ks."A" = k.id
    JOIN "SourceDocument" s ON s.id = ks."B" AND s."approvalStatus" = 'APPROVED'
      AND COALESCE(s."usageRestrictions", '') !~* 'internal.only|confidential|do not use|restricted|reply.only|deck.only|needs review'
    WHERE k."approvalStatus" = 'APPROVED' AND k."productScope" = 'Signal'
      AND 'EMAIL' = ANY(k.channels) AND k."approvedWording" IS NOT NULL
      AND k.type::text IN ('PRODUCT_TRUTH', 'ICP')
    GROUP BY k.id
    UNION ALL
    SELECT c.id, 'Approved Signal claim' AS title, c."approvedWording" AS text, 'CLAIM' AS kind,
      c."usageRestrictions" AS restrictions, array_agg(s.id) AS "sourceIds",
      COALESCE(array_agg(s."externalUrl") FILTER (WHERE s."externalUrl" LIKE 'https://%'), '{}') AS "sourceUrls"
    FROM "Claim" c JOIN "Product" p ON p.id = c."productId" AND p.name = 'Signal'
    JOIN "_ClaimSources" cs ON cs."A" = c.id
    JOIN "SourceDocument" s ON s.id = cs."B" AND s."approvalStatus" = 'APPROVED'
      AND COALESCE(s."usageRestrictions", '') !~* 'internal.only|confidential|do not use|restricted|reply.only|deck.only|needs review'
    WHERE c."approvalStatus" = 'APPROVED' AND 'EMAIL' = ANY(c."allowedChannels") AND c."approvedWording" IS NOT NULL GROUP BY c.id
    LIMIT 24
  `;
  const records: KnowledgeRecord[] = rows.flatMap((row) => {
    if (
      /internal.only|confidential|do not use|restricted|reply.only|deck.only/i.test(
        String(row.restrictions ?? ""),
      )
    )
      return [];
    const parsed = knowledgeRecordSchema.safeParse({
      ...row,
      restrictions: row.restrictions ?? "",
    });
    return parsed.success ? [parsed.data] : [];
  });
  const cases = await db.caseStudy.findMany({
    where: {
      approvalStatus: "APPROVED",
      usageScope: { in: ["EMAIL_AND_LINKEDIN", "PUBLIC_MARKETING"] },
    },
    include: { sources: true },
    take: 16,
  });
  for (const raw of cases) {
    const c = raw as Record<string, unknown>;
    const sources = Array.isArray(c.sources)
      ? (c.sources as {
          id: string;
          externalUrl?: string;
          approvalStatus: string;
          usageRestrictions?: string;
        }[])
      : [];
    const sourceIds = sources
      .filter(
        (s) =>
          s.approvalStatus === "APPROVED" &&
          !/internal.only|confidential|do not use|restricted|reply.only|deck.only|needs review/i.test(
            s.usageRestrictions ?? "",
          ),
      )
      .map((s) => s.id);
    const proof = {
      id: String(c.id),
      title: String(c.title),
      type: "CASE_STUDY",
      approvalStatus: String(c.approvalStatus),
      approvedText: String(c.approvedExternalWording ?? ""),
      usageScope: String(c.usageScope),
      usageRestrictions: String(c.usageRestrictions ?? ""),
      sourceIds,
    };
    if (
      !isEligibleProof(proof) ||
      !["EMAIL_AND_LINKEDIN", "PUBLIC_MARKETING"].includes(proof.usageScope) ||
      /internal.only|confidential|do not use|restricted|reply.only|deck.only|needs review/i.test(
        proof.usageRestrictions,
      )
    )
      continue;
    const parsed = knowledgeRecordSchema.safeParse({
      id: proof.id,
      title: proof.title,
      kind: "CASE_STUDY",
      text: proof.approvedText,
      restrictions: proof.usageRestrictions,
      sourceIds,
      sourceUrls: sources
        .filter(
          (s) =>
            s.approvalStatus === "APPROVED" &&
            !/internal.only|confidential|do not use|restricted|reply.only|deck.only|needs review/i.test(
              s.usageRestrictions ?? "",
            ) &&
            s.externalUrl?.startsWith("https://"),
        )
        .map((s) => s.externalUrl),
    });
    if (parsed.success) records.push(parsed.data);
  }
  if (!records.some((r) => r.kind === "PRODUCT")) throw new NoApprovedKnowledgeError();
  return records;
}
