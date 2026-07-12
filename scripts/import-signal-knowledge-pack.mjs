import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PACK_PATH = path.join("data", "imports", "signal_knowledge_pack_v0_1.json");
const IMPORT_PREFIX = "signal-pack-v0-1";
const REQUIRED_STATUS = "NEEDS_REVIEW";
const dryRun = process.argv.includes("--dry-run");
const verifyOnly = process.argv.includes("--verify");

const sourceTypeMap = {
  PUBLIC_WEBSITE: "WEBSITE",
  SALES_DECK: "INTERNAL_DOCUMENT",
  SALES_CONVERSATIONS: "CUSTOMER_CONVERSATION",
};

const channelMap = {
  EMAIL: "EMAIL",
  LINKEDIN: "LINKEDIN",
  CALL: "CALL",
  INTERNAL: "INTERNAL",
};

const metricDirectionMap = {
  increase: "INCREASE",
  decrease: "DECREASE",
  neutral: "NEUTRAL",
  unknown: "UNKNOWN",
};

function stableId(category, value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 44);
  const hash = createHash("sha1").update(`${category}:${value}`).digest("hex").slice(0, 8);
  return `${IMPORT_PREFIX}-${category}-${slug || "item"}-${hash}`;
}

function parsePack() {
  return JSON.parse(fs.readFileSync(PACK_PATH, "utf8"));
}

function asArray(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value, field) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string when provided.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireNeedsReview(status, field) {
  if (status !== REQUIRED_STATUS) {
    throw new Error(`${field} must be ${REQUIRED_STATUS}.`);
  }
}

function mapChannels(channels, field) {
  return asArray(channels ?? [], field).map((channel) => {
    const mapped = channelMap[channel];
    if (!mapped) {
      throw new Error(`${field} contains unsupported channel ${channel}.`);
    }
    return mapped;
  });
}

function sourceIdsFor(sourceKeys) {
  return sourceKeys.map((sourceKey) => stableId("source", sourceKey));
}

function sourceConnect(sourceKeys) {
  return sourceIdsFor(sourceKeys).map((id) => ({ id }));
}

function sanitizeSourceDescription(description) {
  const value = optionalString(description, "source.description");
  if (!value) {
    return undefined;
  }
  if (/\b(pricing|poc|proof of concept)\b/i.test(value)) {
    return "Source metadata retained; commercial or POC details intentionally omitted from import.";
  }
  return value;
}

function sanitizeCaseStudyText(value) {
  const text = optionalString(value, "caseStudy.text");
  if (!text) {
    return undefined;
  }
  return text
    .replace(/\binitial\s+POC\b/gi, "Initial activation")
    .replace(/\binitial\s+proof of concept\b/gi, "Initial activation")
    .replace(/\bPOC\b/g, "initial activation")
    .replace(/\bproof of concept\b/gi, "initial activation");
}

function titleFromRule(rule) {
  return `Messaging rule: ${rule.slice(0, 72)}${rule.length > 72 ? "..." : ""}`;
}

function validatePack(pack) {
  const errors = [];
  const skipped = {
    caseStudies: [],
  };

  try {
    requireString(pack.version, "version");
    requireString(pack.created_at, "created_at");
    requireString(pack.product?.name, "product.name");
    requireString(pack.product?.scope, "product.scope");
    requireNeedsReview(pack.product?.default_import_status, "product.default_import_status");
  } catch (error) {
    errors.push(error.message);
  }

  const sources = asArray(pack.sources ?? [], "sources");
  const sourceKeys = new Set();
  for (const [index, source] of sources.entries()) {
    try {
      const key = requireString(source.source_key, `sources[${index}].source_key`);
      if (sourceKeys.has(key)) {
        throw new Error(`Duplicate source_key ${key}.`);
      }
      sourceKeys.add(key);
      requireString(source.title, `sources[${index}].title`);
      if (!sourceTypeMap[source.source_type]) {
        throw new Error(`sources[${index}].source_type is unsupported.`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  const groups = [
    ["knowledge_items", pack.knowledge_items ?? []],
    ["case_studies", pack.case_studies ?? []],
    ["objections", pack.objections ?? []],
    ["message_rules", pack.message_rules ?? []],
  ];

  for (const [groupName, items] of groups) {
    for (const [index, item] of asArray(items, groupName).entries()) {
      try {
        requireNeedsReview(item.status, `${groupName}[${index}].status`);
        const sourceKeysForItem = asArray(
          item.source_keys ?? [],
          `${groupName}[${index}].source_keys`,
        );
        if (sourceKeysForItem.length === 0) {
          throw new Error(`${groupName}[${index}] must have at least one source_key.`);
        }
        for (const sourceKey of sourceKeysForItem) {
          if (!sourceKeys.has(sourceKey)) {
            throw new Error(`${groupName}[${index}] references unknown source_key ${sourceKey}.`);
          }
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  for (const [index, item] of asArray(pack.knowledge_items ?? [], "knowledge_items").entries()) {
    try {
      if (item.knowledge_type !== "PRODUCT_TRUTH") {
        throw new Error(`knowledge_items[${index}].knowledge_type is unsupported.`);
      }
      requireString(item.title, `knowledge_items[${index}].title`);
      requireString(item.content, `knowledge_items[${index}].content`);
      mapChannels(item.channels, `knowledge_items[${index}].channels`);
    } catch (error) {
      errors.push(error.message);
    }
  }

  for (const [index, item] of asArray(pack.case_studies ?? [], "case_studies").entries()) {
    try {
      requireString(item.company_name, `case_studies[${index}].company_name`);
      requireString(item.title, `case_studies[${index}].title`);
      for (const [metricIndex, metric] of asArray(
        item.metrics ?? [],
        `case_studies[${index}].metrics`,
      ).entries()) {
        requireString(
          metric.metric_name,
          `case_studies[${index}].metrics[${metricIndex}].metric_name`,
        );
        if (!metricDirectionMap[String(metric.direction ?? "unknown").toLowerCase()]) {
          throw new Error(
            `case_studies[${index}].metrics[${metricIndex}].direction is unsupported.`,
          );
        }
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  for (const [index, item] of asArray(pack.objections ?? [], "objections").entries()) {
    try {
      requireString(item.title, `objections[${index}].title`);
      requireString(item.recommended_strategy, `objections[${index}].recommended_strategy`);
    } catch (error) {
      errors.push(error.message);
    }
  }

  for (const [index, item] of asArray(pack.message_rules ?? [], "message_rules").entries()) {
    try {
      requireString(item.rule, `message_rules[${index}].rule`);
    } catch (error) {
      errors.push(error.message);
    }
  }

  return { ok: errors.length === 0, errors, skipped };
}

async function exists(model, id) {
  const record = await model.findUnique({ where: { id }, select: { id: true } });
  return Boolean(record);
}

async function buildPlan(pack, validation) {
  const skippedCaseStudyIds = new Set(validation.skipped.caseStudies.map((item) => item.id));
  const counts = {
    sources: { create: 0, update: 0, skip: 0 },
    knowledgeItems: { create: 0, update: 0, skip: 0 },
    caseStudies: { create: 0, update: 0, skip: validation.skipped.caseStudies.length },
    caseStudyMetrics: { create: 0, update: 0, skip: 0 },
    objections: { create: 0, update: 0, skip: 0 },
    messageRules: { create: 0, update: 0, skip: 0 },
  };

  for (const source of pack.sources) {
    const id = stableId("source", source.source_key);
    counts.sources[(await exists(prisma.sourceDocument, id)) ? "update" : "create"] += 1;
  }

  for (const item of pack.knowledge_items) {
    const id = stableId("knowledge", item.title);
    counts.knowledgeItems[(await exists(prisma.knowledgeItem, id)) ? "update" : "create"] += 1;
  }

  for (const item of pack.case_studies) {
    const id = stableId("case-study", `${item.company_name}-${item.title}`);
    if (skippedCaseStudyIds.has(id)) {
      counts.caseStudyMetrics.skip += item.metrics?.length ?? 0;
      continue;
    }
    counts.caseStudies[(await exists(prisma.caseStudy, id)) ? "update" : "create"] += 1;
    for (const metric of item.metrics ?? []) {
      const metricId = stableId("case-study-metric", `${id}-${metric.metric_name}`);
      counts.caseStudyMetrics[
        (await exists(prisma.caseStudyMetric, metricId)) ? "update" : "create"
      ] += 1;
    }
  }

  for (const item of pack.objections) {
    const id = stableId("knowledge-objection", item.title);
    counts.objections[(await exists(prisma.knowledgeItem, id)) ? "update" : "create"] += 1;
  }

  for (const item of pack.message_rules) {
    const id = stableId("message-rule", item.rule);
    counts.messageRules[(await exists(prisma.knowledgeItem, id)) ? "update" : "create"] += 1;
  }

  return counts;
}

async function importPack(pack, validation) {
  const product = await prisma.product.upsert({
    where: { name: pack.product.name },
    update: {},
    create: { name: pack.product.name },
  });

  for (const source of pack.sources) {
    await prisma.sourceDocument.upsert({
      where: { id: stableId("source", source.source_key) },
      update: {
        title: source.title,
        sourceType: sourceTypeMap[source.source_type],
        externalUrl: optionalString(source.external_url, "source.external_url"),
        fileReference: optionalString(source.file_reference, "source.file_reference"),
        sourceDate: source.source_date ? new Date(source.source_date) : undefined,
        description: sanitizeSourceDescription(source.description),
        approvalStatus: REQUIRED_STATUS,
      },
      create: {
        id: stableId("source", source.source_key),
        title: source.title,
        sourceType: sourceTypeMap[source.source_type],
        externalUrl: optionalString(source.external_url, "source.external_url"),
        fileReference: optionalString(source.file_reference, "source.file_reference"),
        sourceDate: source.source_date ? new Date(source.source_date) : undefined,
        description: sanitizeSourceDescription(source.description),
        approvalStatus: REQUIRED_STATUS,
      },
    });
  }

  for (const item of pack.knowledge_items) {
    const id = stableId("knowledge", item.title);
    await prisma.knowledgeItem.upsert({
      where: { id },
      update: {
        type: "PRODUCT_TRUTH",
        title: item.title,
        summary: optionalString(item.summary, "knowledge.summary"),
        body: item.content,
        approvalStatus: REQUIRED_STATUS,
        productScope: pack.product.scope,
        productId: product.id,
        channels: mapChannels(item.channels, "knowledge.channels"),
        sources: { set: sourceConnect(item.source_keys) },
      },
      create: {
        id,
        type: "PRODUCT_TRUTH",
        title: item.title,
        summary: optionalString(item.summary, "knowledge.summary"),
        body: item.content,
        approvalStatus: REQUIRED_STATUS,
        productScope: pack.product.scope,
        productId: product.id,
        channels: mapChannels(item.channels, "knowledge.channels"),
        sources: { connect: sourceConnect(item.source_keys) },
      },
    });
  }

  const skippedCaseStudyIds = new Set(validation.skipped.caseStudies.map((item) => item.id));
  for (const item of pack.case_studies) {
    const id = stableId("case-study", `${item.company_name}-${item.title}`);
    if (skippedCaseStudyIds.has(id)) {
      continue;
    }
    const caseStudy = await prisma.caseStudy.upsert({
      where: { id },
      update: {
        companyName: item.company_name,
        title: sanitizeCaseStudyText(item.title),
        initialProblem: sanitizeCaseStudyText(item.initial_problem),
        signalApproach: sanitizeCaseStudyText(item.signal_approach),
        activationDuration: optionalString(
          item.activation_duration,
          "caseStudy.activation_duration",
        ),
        approvedExternalWording: optionalString(
          sanitizeCaseStudyText(item.approved_external_wording),
          "caseStudy.approved_external_wording",
        ),
        usageRestrictions: optionalString(item.usage_restrictions, "caseStudy.usage_restrictions"),
        approvalStatus: REQUIRED_STATUS,
        sources: { set: sourceConnect(item.source_keys) },
      },
      create: {
        id,
        companyName: item.company_name,
        title: sanitizeCaseStudyText(item.title),
        initialProblem: sanitizeCaseStudyText(item.initial_problem),
        signalApproach: sanitizeCaseStudyText(item.signal_approach),
        activationDuration: optionalString(
          item.activation_duration,
          "caseStudy.activation_duration",
        ),
        approvedExternalWording: optionalString(
          sanitizeCaseStudyText(item.approved_external_wording),
          "caseStudy.approved_external_wording",
        ),
        usageRestrictions: optionalString(item.usage_restrictions, "caseStudy.usage_restrictions"),
        approvalStatus: REQUIRED_STATUS,
        sources: { connect: sourceConnect(item.source_keys) },
      },
    });

    for (const metric of item.metrics ?? []) {
      await prisma.caseStudyMetric.upsert({
        where: { id: stableId("case-study-metric", `${id}-${metric.metric_name}`) },
        update: {
          metricName: metric.metric_name,
          value: String(metric.value),
          unit: optionalString(metric.unit, "metric.unit"),
          direction: metricDirectionMap[String(metric.direction ?? "unknown").toLowerCase()],
        },
        create: {
          id: stableId("case-study-metric", `${id}-${metric.metric_name}`),
          caseStudyId: caseStudy.id,
          metricName: metric.metric_name,
          value: String(metric.value),
          unit: optionalString(metric.unit, "metric.unit"),
          direction: metricDirectionMap[String(metric.direction ?? "unknown").toLowerCase()],
        },
      });
    }
  }

  for (const item of pack.objections) {
    const id = stableId("knowledge-objection", item.title);
    await prisma.knowledgeItem.upsert({
      where: { id },
      update: {
        type: "OBJECTION",
        title: item.title,
        summary: item.recommended_strategy,
        body: item.approved_candidate_response ?? item.recommended_strategy,
        approvalStatus: REQUIRED_STATUS,
        productScope: pack.product.scope,
        productId: product.id,
        channels: ["EMAIL", "LINKEDIN"],
        sources: { set: sourceConnect(item.source_keys) },
        objection: {
          upsert: {
            update: {
              objection: item.title,
              response: item.approved_candidate_response ?? item.recommended_strategy,
              approvalStatus: REQUIRED_STATUS,
            },
            create: {
              id: stableId("objection", item.title),
              objection: item.title,
              response: item.approved_candidate_response ?? item.recommended_strategy,
              approvalStatus: REQUIRED_STATUS,
            },
          },
        },
      },
      create: {
        id,
        type: "OBJECTION",
        title: item.title,
        summary: item.recommended_strategy,
        body: item.approved_candidate_response ?? item.recommended_strategy,
        approvalStatus: REQUIRED_STATUS,
        productScope: pack.product.scope,
        productId: product.id,
        channels: ["EMAIL", "LINKEDIN"],
        sources: { connect: sourceConnect(item.source_keys) },
        objection: {
          create: {
            id: stableId("objection", item.title),
            objection: item.title,
            response: item.approved_candidate_response ?? item.recommended_strategy,
            approvalStatus: REQUIRED_STATUS,
          },
        },
      },
    });
  }

  for (const item of pack.message_rules) {
    const title = titleFromRule(item.rule);
    const id = stableId("message-rule", item.rule);
    await prisma.knowledgeItem.upsert({
      where: { id },
      update: {
        type: "MESSAGE_EXAMPLE",
        title,
        summary: "Messaging rule pending review.",
        body: item.rule,
        approvalStatus: REQUIRED_STATUS,
        productScope: pack.product.scope,
        productId: product.id,
        channels: ["INTERNAL"],
        sources: { set: sourceConnect(item.source_keys) },
        messageExample: {
          upsert: {
            update: {
              title,
              body: item.rule,
              channel: "INTERNAL",
              approvalStatus: REQUIRED_STATUS,
            },
            create: {
              id: stableId("message-example", item.rule),
              title,
              body: item.rule,
              channel: "INTERNAL",
              approvalStatus: REQUIRED_STATUS,
            },
          },
        },
      },
      create: {
        id,
        type: "MESSAGE_EXAMPLE",
        title,
        summary: "Messaging rule pending review.",
        body: item.rule,
        approvalStatus: REQUIRED_STATUS,
        productScope: pack.product.scope,
        productId: product.id,
        channels: ["INTERNAL"],
        sources: { connect: sourceConnect(item.source_keys) },
        messageExample: {
          create: {
            id: stableId("message-example", item.rule),
            title,
            body: item.rule,
            channel: "INTERNAL",
            approvalStatus: REQUIRED_STATUS,
          },
        },
      },
    });
  }
}

async function verifyImport(pack, validation) {
  const skippedCaseStudyIds = new Set(validation.skipped.caseStudies.map((item) => item.id));
  const sourceIds = pack.sources.map((source) => stableId("source", source.source_key));
  const knowledgeIds = pack.knowledge_items.map((item) => stableId("knowledge", item.title));
  const caseStudyIds = pack.case_studies
    .map((item) => stableId("case-study", `${item.company_name}-${item.title}`))
    .filter((id) => !skippedCaseStudyIds.has(id));
  const caseStudyMetricIds = pack.case_studies
    .filter(
      (item) =>
        !skippedCaseStudyIds.has(stableId("case-study", `${item.company_name}-${item.title}`)),
    )
    .flatMap((item) => {
      const caseStudyId = stableId("case-study", `${item.company_name}-${item.title}`);
      return (item.metrics ?? []).map((metric) =>
        stableId("case-study-metric", `${caseStudyId}-${metric.metric_name}`),
      );
    });
  const objectionKnowledgeIds = pack.objections.map((item) =>
    stableId("knowledge-objection", item.title),
  );
  const messageRuleIds = pack.message_rules.map((item) => stableId("message-rule", item.rule));

  const [
    sources,
    knowledgeItems,
    caseStudies,
    caseStudyMetrics,
    objections,
    messageRules,
    approvedImported,
  ] = await Promise.all([
    prisma.sourceDocument.count({
      where: { id: { in: sourceIds }, approvalStatus: REQUIRED_STATUS },
    }),
    prisma.knowledgeItem.count({
      where: { id: { in: knowledgeIds }, approvalStatus: REQUIRED_STATUS },
    }),
    prisma.caseStudy.count({
      where: { id: { in: caseStudyIds }, approvalStatus: REQUIRED_STATUS },
    }),
    prisma.caseStudyMetric.count({
      where: { id: { in: caseStudyMetricIds } },
    }),
    prisma.objection.count({
      where: { knowledgeItemId: { in: objectionKnowledgeIds }, approvalStatus: REQUIRED_STATUS },
    }),
    prisma.messageExample.count({
      where: { knowledgeItemId: { in: messageRuleIds }, approvalStatus: REQUIRED_STATUS },
    }),
    prisma.knowledgeItem.count({
      where: {
        id: { in: [...knowledgeIds, ...objectionKnowledgeIds, ...messageRuleIds] },
        approvalStatus: { not: REQUIRED_STATUS },
      },
    }),
  ]);

  const relationChecks = [];
  for (const item of pack.knowledge_items) {
    const record = await prisma.knowledgeItem.findUnique({
      where: { id: stableId("knowledge", item.title) },
      select: { sources: { select: { id: true } } },
    });
    relationChecks.push(record?.sources.length === item.source_keys.length);
  }
  for (const item of pack.case_studies) {
    const id = stableId("case-study", `${item.company_name}-${item.title}`);
    if (skippedCaseStudyIds.has(id)) {
      continue;
    }
    const record = await prisma.caseStudy.findUnique({
      where: { id },
      select: { sources: { select: { id: true } }, metrics: { select: { id: true } } },
    });
    relationChecks.push(
      record?.sources.length === item.source_keys.length &&
        record?.metrics.length === (item.metrics?.length ?? 0),
    );
  }

  return {
    sources,
    knowledgeItems,
    caseStudies,
    caseStudyMetrics,
    objections,
    messageRules,
    approvedImported,
    sourceRelationshipsOk: relationChecks.every(Boolean),
  };
}

async function main() {
  const pack = parsePack();
  const validation = validatePack(pack);
  if (!validation.ok) {
    console.log(JSON.stringify({ validation: validation.ok, errors: validation.errors }, null, 2));
    process.exit(1);
  }

  const plan = await buildPlan(pack, validation);

  if (verifyOnly) {
    console.log(JSON.stringify({ verification: await verifyImport(pack, validation) }, null, 2));
    return;
  }

  if (!dryRun) {
    await importPack(pack, validation);
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "import",
        validation: true,
        plan,
        skipped: validation.skipped,
        verification: dryRun ? undefined : await verifyImport(pack, validation),
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error.message);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
