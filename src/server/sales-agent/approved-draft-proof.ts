import { configuredDatabaseUrl } from "@/lib/preview-isolation";
import "server-only";
import { z } from "zod";
import { isEligibleProof } from "@/features/proof/proof-policy";
import type { DraftResearch } from "@/features/sales-agent/draft-engine";
import type { MinimalPrismaClient } from "@/lib/prisma";

const approvedCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  approvalStatus: z.literal("APPROVED"),
  approvedExternalWording: z.string().min(1),
  usageScope: z.enum(["EMAIL_AND_LINKEDIN", "PUBLIC_MARKETING"]),
  usageRestrictions: z.string().nullable(),
  sources: z.array(
    z.object({ id: z.string(), externalUrl: z.string().nullable(), approvalStatus: z.string() }),
  ),
});
/** No fixture fallback: use the actual approved library and its linked sources. */
export async function verifyApprovedDraftProof(
  entry: DraftResearch,
  client?: Pick<MinimalPrismaClient, "caseStudy">,
) {
  if (entry.kind !== "CASE_STUDY" || !entry.caseStudyId || !entry.approvedForOutbound) return false;
  if (!client && !configuredDatabaseUrl()) return false;
  try {
    const db = client ?? (await import("@/lib/prisma")).prisma;
    const parsed = approvedCaseSchema.safeParse(
      await db.caseStudy.findUnique({
        where: { id: entry.caseStudyId },
        include: { sources: true },
      }),
    );
    if (!parsed.success) return false;
    const record = parsed.data;
    return (
      record.id === entry.caseStudyId &&
      record.approvedExternalWording.trim() === entry.text &&
      record.sources.some(
        (source) => source.approvalStatus === "APPROVED" && source.externalUrl === entry.sourceUrl,
      ) &&
      isEligibleProof({
        id: record.id,
        title: record.title,
        type: "CASE_STUDY",
        approvalStatus: record.approvalStatus,
        approvedText: record.approvedExternalWording,
        sourceIds: record.sources.map((source) => source.id),
        usageScope: record.usageScope,
        usageRestrictions: record.usageRestrictions ?? undefined,
      })
    );
  } catch {
    return false;
  }
}
export async function recheckDraftProofs(
  research: DraftResearch[] = [],
  verify = verifyApprovedDraftProof,
) {
  return Promise.all(
    research.map(async (entry) => {
      if (entry.kind !== "CASE_STUDY") return entry;
      try {
        return { ...entry, approvedForOutbound: await verify(entry) };
      } catch {
        return { ...entry, approvedForOutbound: false };
      }
    }),
  );
}
