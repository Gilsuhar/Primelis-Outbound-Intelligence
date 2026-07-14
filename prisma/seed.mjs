import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const salesUser = await prisma.user.upsert({
    where: { email: "development.sales@example.invalid" },
    update: {},
    create: {
      id: "seed-sales-user",
      email: "development.sales@example.invalid",
      name: "Sales User",
      role: "SALES_USER",
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "development.admin@example.invalid" },
    update: {},
    create: {
      id: "seed-admin-user",
      email: "development.admin@example.invalid",
      name: "Knowledge Admin",
      role: "KNOWLEDGE_ADMIN",
    },
  });

  const product = await prisma.product.upsert({
    where: { name: "Signal" },
    update: {},
    create: {
      name: "Signal",
    },
  });

  const sourceOverview = await prisma.sourceDocument.upsert({
    where: { id: "seed-source-overview" },
    update: {},
    create: {
      id: "seed-source-overview",
      title: "Signal Product Overview",
      sourceType: "INTERNAL_DOCUMENT",
      fileReference: "sources/signal-product-overview.md",
      sourceDate: new Date("2026-05-10"),
      description: "Source metadata for approved Signal product knowledge.",
      internalNotes: "Internal review source.",
      approvalStatus: "APPROVED",
    },
  });

  const sourceNotes = await prisma.sourceDocument.upsert({
    where: { id: "seed-source-notes" },
    update: {},
    create: {
      id: "seed-source-notes",
      title: "Example SaaS Company Discovery Notes",
      sourceType: "CUSTOMER_CONVERSATION",
      fileReference: "sources/example-saas-notes.md",
      sourceDate: new Date("2026-05-22"),
      description: "Example customer-discovery style source for review workflows.",
      internalNotes: "No real customer information.",
      approvalStatus: "APPROVED",
    },
  });

  await prisma.claim.upsert({
    where: { id: "seed-approved-claim" },
    update: {},
    create: {
      id: "seed-approved-claim",
      exactText: "Signal helps structure outbound decisions around approved product knowledge and review status.",
      approvedWording: "Signal helps sellers use approved product knowledge when preparing outbound messages.",
      approvalStatus: "APPROVED",
      productId: product.id,
      allowedChannels: ["EMAIL", "LINKEDIN"],
      reviewOwnerId: adminUser.id,
      lastReviewedAt: new Date("2026-06-18"),
      internalNotes: "Approved internal workflow claim.",
      sources: {
        connect: [{ id: sourceOverview.id }, { id: sourceNotes.id }],
      },
    },
  });

  await prisma.claim.upsert({
    where: { id: "seed-missing-source-claim" },
    update: {},
    create: {
      id: "seed-missing-source-claim",
      exactText: "Claim awaiting source support before approval.",
      approvalStatus: "NEEDS_REVIEW",
      productId: product.id,
      allowedChannels: ["INTERNAL"],
      reviewOwnerId: adminUser.id,
      usageRestrictions: "Cannot be approved until a source is attached.",
    },
  });

  await prisma.claim.upsert({
    where: { id: "seed-restricted-claim" },
    update: {},
    create: {
      id: "seed-restricted-claim",
      exactText: "Restricted claim for internal review only.",
      approvedWording: "Restricted wording for internal review only.",
      approvalStatus: "RESTRICTED",
      productId: product.id,
      allowedChannels: ["INTERNAL"],
      reviewOwnerId: adminUser.id,
      usageRestrictions: "Restricted from standard generation workflows.",
      sources: {
        connect: [{ id: sourceOverview.id }],
      },
    },
  });

  const caseStudy = await prisma.caseStudy.upsert({
    where: { id: "seed-case-study" },
    update: {},
    create: {
      id: "seed-case-study",
      companyName: "Example SaaS Company",
      title: "Case Study Shell",
      approvalStatus: "APPROVED",
      approvedExternalWording: "Approved case-study shell for internal demonstration only.",
      usageRestrictions: "No real metrics or customer claims.",
      sources: {
        connect: [{ id: sourceOverview.id }],
      },
    },
  });

  await prisma.caseStudyMetric.upsert({
    where: { id: "seed-case-study-metric" },
    update: {},
    create: {
      id: "seed-case-study-metric",
      caseStudyId: caseStudy.id,
      metricName: "Example Metric",
      value: "N/A",
      unit: "example",
      direction: "UNKNOWN",
      comparison: "No real result data.",
      timePeriod: "Example period",
      approvedWording: "Example metric placeholder.",
    },
  });

  await prisma.knowledgeSubmission.upsert({
    where: { id: "seed-submission-needs-review" },
    update: {},
    create: {
      id: "seed-submission-needs-review",
      authorId: salesUser.id,
      title: "Knowledge Submission",
      submittedText: "Neutral content submitted for review.",
      suggestedType: "CLAIM",
      approvalStatus: "NEEDS_REVIEW",
      sourceNotes: "Generic source notes.",
      sourceTitle: "Signal Product Overview",
      sourceType: "INTERNAL_DOCUMENT",
      channels: ["EMAIL"],
      originType: "MANUAL",
      sources: {
        connect: [{ id: sourceOverview.id }],
      },
    },
  });

  await prisma.reviewDecision.upsert({
    where: { id: "seed-review-history" },
    update: {},
    create: {
      id: "seed-review-history",
      actorId: adminUser.id,
      decisionType: "APPROVED",
      action: "Approved",
      fromStatus: "NEEDS_REVIEW",
      toStatus: "APPROVED",
      reason: "Review history.",
      notes: "Review history.",
      claimId: "seed-approved-claim",
    },
  });

  await prisma.generatedDraft.upsert({
    where: { id: "seed-generated-draft" },
    update: {},
    create: {
      id: "seed-generated-draft",
      userId: salesUser.id,
      workflow: "CREATE_OUTREACH",
      draftContent: "Generated draft placeholder content.",
      promptSnapshot: "Draft prompt snapshot.",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
