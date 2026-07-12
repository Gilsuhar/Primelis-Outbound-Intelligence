import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const salesUser = await prisma.user.upsert({
    where: { email: "development.sales@example.invalid" },
    update: {},
    create: {
      id: "seed-sales-user",
      email: "development.sales@example.invalid",
      name: "Development Sales User",
      role: "SALES_USER",
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "development.admin@example.invalid" },
    update: {},
    create: {
      id: "seed-admin-user",
      email: "development.admin@example.invalid",
      name: "Development Knowledge Admin",
      role: "KNOWLEDGE_ADMIN",
    },
  });

  const product = await prisma.product.upsert({
    where: { name: "Development Product" },
    update: {},
    create: {
      name: "Development Product",
    },
  });

  const sourceOverview = await prisma.sourceDocument.upsert({
    where: { id: "seed-source-overview" },
    update: {},
    create: {
      id: "seed-source-overview",
      title: "Development Fixture Source Overview",
      sourceType: "INTERNAL_DOCUMENT",
      fileReference: "fixtures/source-overview.md",
      sourceDate: new Date("2026-05-10"),
      description: "Generic source metadata for development seeding.",
      internalNotes: "No real Primelis, Signal, customer, pricing, or competitor data.",
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
      fileReference: "fixtures/example-saas-notes.md",
      sourceDate: new Date("2026-05-22"),
      description: "Neutral source-style fixture for development only.",
      internalNotes: "No real customer information.",
      approvalStatus: "APPROVED",
    },
  });

  await prisma.claim.upsert({
    where: { id: "seed-approved-claim" },
    update: {},
    create: {
      id: "seed-approved-claim",
      exactText: "Development fixture claim about a generic workflow.",
      approvedWording: "Approved development wording for a generic workflow.",
      approvalStatus: "APPROVED",
      productId: product.id,
      allowedChannels: ["EMAIL", "LINKEDIN"],
      reviewOwnerId: adminUser.id,
      lastReviewedAt: new Date("2026-06-18"),
      internalNotes: "Development fixture only.",
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
      exactText: "Development fixture claim intentionally missing a source.",
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
      exactText: "Restricted development fixture claim for internal review only.",
      approvedWording: "Restricted development wording for internal review only.",
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
      title: "Development Case Study Shell",
      approvalStatus: "APPROVED",
      approvedExternalWording: "Approved generic case-study shell for development only.",
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
      metricName: "Development Metric",
      value: "N/A",
      unit: "fixture",
      direction: "UNKNOWN",
      comparison: "No real result data.",
      timePeriod: "Development only",
      approvedWording: "Development metric placeholder.",
    },
  });

  await prisma.knowledgeSubmission.upsert({
    where: { id: "seed-submission-needs-review" },
    update: {},
    create: {
      id: "seed-submission-needs-review",
      authorId: salesUser.id,
      title: "Development Knowledge Submission",
      submittedText: "Neutral development fixture content submitted for review.",
      suggestedType: "CLAIM",
      approvalStatus: "NEEDS_REVIEW",
      sourceNotes: "Generic source notes.",
      sourceTitle: "Development Fixture Source Overview",
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
      reason: "Development fixture review history.",
      notes: "Development fixture review history.",
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
      draftContent: "Development generated draft placeholder content.",
      promptSnapshot: "Development fixture prompt snapshot. No AI integration.",
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
