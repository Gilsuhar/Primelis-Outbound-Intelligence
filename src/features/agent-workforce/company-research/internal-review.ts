import { z } from "zod";
import { criticSchema, researchSchema, runSchema } from "../gate-a-contracts";
import { groundingAuditSchema } from "./grounding-audit";

export const choiceHotelsContinuationId = "d4eb59e6-8160-4d45-a8d2-44c0174b7b65";

/** Company research never confers contact clearance. These documents are not WorkforceRuns. */
const companyLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !/[\u0000-\u001f<>]/.test(value), "Enter a company name or public domain");
export const companyRequestSchema = z
  .object({
    company: companyLabelSchema,
    image: z
      .object({
        mime: z.enum(["image/png", "image/jpeg"]),
        base64: z.string().min(16).max(2_800_000),
      })
      .strict()
      .optional(),
    reuseResearchId: z.string().uuid().optional(),
    continueResearchId: z.string().uuid().optional(),
    /** A HubSpot record id only; the server resolves all contact facts from its owned snapshot. */
    continueContactId: z.string().min(1).max(200).optional(),
    profile: z
      .object({
        name: z.string().trim().min(1).max(180),
        linkedinUrl: z
          .string()
          .url()
          .max(500)
          .refine((value) => {
            try {
              const url = new URL(value);
              return (
                url.protocol === "https:" &&
                ["linkedin.com", "www.linkedin.com"].includes(url.hostname) &&
                /^\/in\/[A-Za-z0-9%_-]+\/?$/.test(url.pathname) &&
                !url.username &&
                !url.password &&
                !url.search &&
                !url.hash
              );
            } catch {
              return false;
            }
          })
          .optional(),
        text: z
          .string()
          .min(80)
          .max(12_000)
          .refine((value) => value.trim().length >= 80)
          .optional(),
      })
      .strict()
      .superRefine((profile, ctx) => {
        if (Boolean(profile.linkedinUrl) === Boolean(profile.text))
          ctx.addIssue({ code: "custom", message: "Provide one profile URL or profile text" });
      })
      .optional(),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (request.profile && (request.continueContactId || request.continueResearchId))
      ctx.addIssue({
        code: "custom",
        message: "Profile intake cannot be combined with a saved-contact continuation",
      });
  });

export const suppliedProfileEvidenceSchema = z
  .object({
    name: z.string().min(1).max(180),
    source: z.enum(["LINKEDIN_URL", "PASTED_TEXT"]),
    value: z.string().min(1).max(12_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    suppliedAt: z.string().datetime(),
    status: z.literal("USER_SUPPLIED_UNVERIFIED"),
  })
  .strict();

const note = z.string().min(1).max(1800);
const id = z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/);
const publicUrl = z
  .string()
  .url()
  .max(1500)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });
const context = z
  .object({
    value: z.string().max(200).nullable(),
    basis: z.enum(["VISIBLE_IN_IMAGE", "CAPTURE_RECEIPT", "USER_REPORTED", "UNKNOWN"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.basis === "UNKNOWN") !== (value.value === null))
      ctx.addIssue({ code: "custom", message: "Unknown context must remain null" });
  });
export const internalAnalysisSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("AGENT_ASSISTED_INTERNAL_REVIEW"),
    company: z.string().min(1).max(240),
    companyDomain: z.string().max(240).nullable(),
    preparedAt: z.string().datetime(),
    recipient: z.literal("Generic Paid Search team — not a verified contact"),
    conclusion: z.enum(["RESEARCH_LEAD", "INSUFFICIENT_EVIDENCE", "NO_OPPORTUNITY"]),
    summary: note,
    evidence: z
      .array(
        z
          .object({
            id,
            statement: note,
            url: publicUrl,
            quote: z.string().min(1).max(1200),
            observedAt: z.string().datetime(),
            limitation: note,
          })
          .strict(),
      )
      .max(12),
    screenshot: z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        query: context,
        market: context,
        device: context,
        capturedAt: context,
        missingContext: z.array(z.enum(["query", "market", "device", "capturedAt"])).max(4),
        advertisers: z
          .array(
            z
              .object({
                displayName: z.string().min(1).max(160),
                placement: z.enum(["SPONSORED_TEXT", "SHOPPING", "ORGANIC", "UNCLEAR"]),
                relationship: z.enum([
                  "BRAND",
                  "CATEGORY_COMPETITOR",
                  "RETAILER",
                  "MARKETPLACE",
                  "UNRELATED",
                  "UNVERIFIED",
                ]),
                evidence: note,
                identitySource: publicUrl.nullable(),
              })
              .strict(),
          )
          .max(20),
        brandPresence: z.enum([
          "PAID_VISIBLE",
          "ORGANIC_VISIBLE",
          "NOT_VISIBLE_IN_CROP",
          "UNCLEAR",
        ]),
        limitation: note,
      })
      .strict()
      .superRefine((shot, ctx) => {
        const missing = (["query", "market", "device", "capturedAt"] as const).filter(
          (key) => shot[key].value === null,
        );
        if (JSON.stringify([...missing].sort()) !== JSON.stringify([...shot.missingContext].sort()))
          ctx.addIssue({ code: "custom", message: "Missing screenshot context must be explicit" });
      })
      .nullable(),
    angles: z
      .array(
        z
          .object({
            id,
            title: z.string().min(1).max(160),
            evidenceIds: z.array(id).min(1).max(12),
            hypothesis: note,
            limitations: note,
            decision: z.enum(["SELECTED", "RESERVE", "REJECT"]),
            reason: note,
          })
          .strict(),
      )
      .min(2)
      .max(5),
    emails: z
      .array(
        z
          .object({
            subject: z.string().min(1).max(180),
            body: z.string().min(1).max(2500),
            evidenceIds: z.array(id).max(12),
            intent: z.string().min(1).max(240),
          })
          .strict(),
      )
      .max(4),
    productClaims: z.literal("NO_UNAPPROVED_CAPABILITY_OR_CUSTOMER_PROOF_CLAIMS"),
    grounding: z.literal("NOT_RUN"),
    independentQuality: z.literal("NOT_RUN"),
    writerAssessment: note,
    blockers: z.array(note).max(15),
    outboundEligibility: z.literal("HOLD"),
    approved: z.literal(false),
    canSend: z.literal(false),
    canEnroll: z.literal(false),
  })
  .strict()
  .superRefine((review, ctx) => {
    const ids = new Set(review.evidence.map((e) => e.id));
    if (ids.size !== review.evidence.length)
      ctx.addIssue({ code: "custom", message: "Duplicate evidence" });
    if (review.screenshot) ids.add("screenshot");
    for (const entry of [...review.angles, ...review.emails])
      if (entry.evidenceIds.some((key) => !ids.has(key)))
        ctx.addIssue({ code: "custom", message: "Unknown evidence reference" });
    const selected = review.angles.filter((a) => a.decision === "SELECTED");
    if (
      selected.length > 1 ||
      (review.emails.length && (review.emails.length !== 4 || selected.length !== 1))
    )
      ctx.addIssue({
        code: "custom",
        message: "Drafts require one selected hypothesis and four messages",
      });
  });

export const internalExecutionSchema = z
  .object({
    mode: z.literal("PUBLIC_RETRIEVAL_ONLY"),
    status: z.literal("BLOCKED"),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    sources: z
      .array(
        z
          .object({
            url: publicUrl,
            title: z.string().max(300),
            text: z.string().min(80).max(18000),
            retrievedAt: z.string().datetime(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(1),
    stages: z
      .array(
        z
          .object({
            stage: z.enum([
              "COMPANY_RESOLUTION",
              "PUBLIC_RETRIEVAL",
              "SCREENSHOT_ANALYSIS",
              "ANGLES_AND_DRAFTS",
              "INDEPENDENT_REVIEW",
            ]),
            status: z.enum(["COMPLETED", "BLOCKED", "NOT_RUN"]),
            code: z.string().regex(/^[A-Z0-9_]{1,100}$/),
            detail: note,
          })
          .strict(),
      )
      .min(4)
      .max(5),
    grounding: z.literal("NOT_RUN"),
    independentQuality: z.literal("NOT_RUN"),
    approved: z.literal(false),
    canSend: z.literal(false),
    canEnroll: z.literal(false),
  })
  .strict();
export type InternalExecution = z.infer<typeof internalExecutionSchema>;

/** Imported excerpts are provenance records, not accepted research facts or writer clearance. */
export const importedPublicEvidenceSchema = z
  .object({
    kind: z.literal("PUBLIC_EVIDENCE_IMPORT"),
    status: z.literal("PENDING_INDEPENDENT_GROUNDING"),
    capturedAt: z.string().datetime(),
    captureMethod: z.literal("CONNECTED_WEB_READ_ONLY"),
    sources: z
      .array(
        z
          .object({
            id,
            originalUrl: publicUrl,
            resolvedUrl: publicUrl.nullable(),
            title: z.string().min(1).max(300),
            publisher: z.string().min(1).max(160),
            publicationDate: z.string().datetime().nullable(),
            displayedDate: z.string().min(1).max(100),
            temporalScope: z.enum([
              "HISTORICAL",
              "RECENT_RELATIVE_DATE",
              "UNDATED_UNVERIFIED_LISTING",
            ]),
            retrievedAt: z.string().datetime(),
            excerpt: z.string().min(40).max(18000),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    sourceReports: z
      .array(
        z
          .object({
            id,
            statement: note,
            sourceId: id,
            exactQuote: z.string().min(1).max(1200),
            status: z.literal("SOURCE_REPORTED_UNVERIFIED"),
          })
          .strict(),
      )
      .max(8),
    unavailableSources: z
      .array(
        z
          .object({
            url: publicUrl,
            checkedAt: z.string().datetime(),
            code: z.enum(["HTTP_429", "SOURCE_UNAVAILABLE", "SOURCE_REDIRECT"]),
          })
          .strict(),
      )
      .max(4),
    aliceCurrentEmployment: z.literal("UNKNOWN"),
    aliceCurrentTitle: z.literal("UNKNOWN"),
    aliceCurrentResponsibilities: z.literal("UNKNOWN"),
  })
  .strict()
  .superRefine((packet, ctx) => {
    const sources = new Map(packet.sources.map((source) => [source.id, source]));
    if (sources.size !== packet.sources.length)
      ctx.addIssue({ code: "custom", message: "Duplicate imported source id" });
    for (const report of packet.sourceReports) {
      const source = sources.get(report.sourceId);
      if (!source || !source.excerpt.includes(report.exactQuote))
        ctx.addIssue({
          code: "custom",
          message: "Source report must bind to an exact imported quote",
        });
    }
  });

/** Explicit one-call action; false authorization can never start a grounding request. */
export const importedEvidenceGroundingRequestSchema = z
  .object({
    action: z.literal("GROUND_IMPORTED_EVIDENCE"),
    packetId: z.string().uuid(),
    companyDomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
      .max(240),
    paidAiAuthorized: z.boolean(),
  })
  .strict();

/** Immutable result snapshot. Each source packet/hash gets one non-replayable attempt record. */
export const importedEvidenceGroundingVersionSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("IMPORTED_EVIDENCE_GROUNDING"),
    id: z.string().regex(/^grounding-[a-f0-9-]{36}-[a-f0-9]{16}$/),
    owner: z.string().min(1).max(200),
    sourcePacketId: z.string().uuid(),
    sourcePacketSha256: z.string().regex(/^[a-f0-9]{64}$/),
    companyDomain: z.string().min(3).max(240),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    status: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
    modelCalls: z.number().int().min(0).max(1),
    failureCode: z
      .enum([
        "GROUNDING_INPUT_INVALID",
        "GROUNDING_VALIDATION_FAILED",
        "GROUNDING_UNAVAILABLE",
        "BUDGET_OR_PROVIDER_BLOCKED",
        "GROUNDING_RESULT_INVALID",
      ])
      .nullable(),
    sourceEvidence: importedPublicEvidenceSchema,
    research: researchSchema,
    groundingAudit: groundingAuditSchema.nullable(),
    usage: z.array(runSchema.shape.usage.element).max(1),
  })
  .strict()
  .superRefine((record, ctx) => {
    if ((record.status === "RUNNING") !== (record.completedAt === null))
      ctx.addIssue({ code: "custom", message: "Grounding record completion state mismatch" });
    if (record.status === "COMPLETED" && (!record.groundingAudit || record.modelCalls !== 1))
      ctx.addIssue({ code: "custom", message: "Completed grounding requires one reviewed call" });
    if (record.status === "FAILED" && !record.failureCode)
      ctx.addIssue({ code: "custom", message: "Failed grounding requires a sanitized code" });
  });
export type ImportedEvidenceGroundingVersion = z.infer<
  typeof importedEvidenceGroundingVersionSchema
>;

/** Internal copy only: the writer does not construct an outbound assertion ledger. */
export const internalEmailDraftsSchema = z
  .object({
    approach: z.string().trim().min(1).max(1600),
    limitations: z.array(z.string().min(1).max(1000)).max(10),
    emails: z
      .array(
        z
          .object({
            subject: z.string().trim().min(1).max(160),
            body: z.string().trim().min(1).max(2500),
          })
          .strict(),
      )
      .length(4),
  })
  .strict();
// Reuse the existing independent critic's factual/commercial checks; no outbound OIQ ledger.
export const internalEmailReviewSchema = criticSchema.omit({ oiq: true });

/** Contact facts admitted to internal drafting only; never conveys outbound clearance. */
export const internalContactDraftContextSchema = z
  .object({
    contactId: z.string().min(1).max(200),
    displayName: z.string().min(1).max(180),
    companyName: z.string().min(1).max(180),
    companyDomain: z.string().min(1).max(240),
    verifiedPersonalizationFacts: z
      .array(
        z
          .object({
            evidenceId: z.string().min(1).max(300),
            field: z.enum(["role", "paidSearchResponsibility"]),
            statement: z.string().min(1).max(500),
            source: z.string().min(1).max(80),
            observedAt: z.string().min(1).max(80),
            supportingEvidence: z.array(z.string().min(1).max(1000)).max(20),
          })
          .strict(),
      )
      .max(6),
    unresolved: z.array(z.string().min(1).max(300)).max(12),
    eligibility: z.literal("HOLD"),
    outboundReady: z.literal(false),
  })
  .strict();
export type InternalContactDraftContext = z.infer<typeof internalContactDraftContextSchema>;

export const internalProfileFactSchema = z
  .object({
    evidenceId: z.string().min(1).max(300),
    field: z.enum(["currentRole", "responsibility"]),
    statement: z.string().min(1).max(500),
    sourceUrl: publicUrl,
    observedAt: z.string().datetime(),
    supportingQuote: z.string().min(1).max(1000),
  })
  .strict();
export const internalProfileDraftContextSchema = z
  .object({
    name: z.string().min(1).max(180),
    linkedInUrl: publicUrl.nullable(),
    suppliedMaterialStatus: z.literal("USER_SUPPLIED_UNVERIFIED"),
  })
  .strict();
export type InternalProfileDraftContext = z.infer<typeof internalProfileDraftContextSchema>;

export const sourceDiagnosticSchema = z
  .object({
    stage: z.enum([
      "DISCOVERY",
      "CANDIDATE",
      "RETRIEVAL",
      "PARSING",
      "EXTRACTION",
      "VALIDATION",
      "PIPELINE",
    ]),
    outcome: z.string().min(1).max(80),
    sourceUrl: z.string().max(300).optional(),
    sourceCount: z.number().int().min(0).max(100).optional(),
    factCount: z.number().int().min(0).max(100).optional(),
    issueCount: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export const automaticCompanySchema = z
  .object({
    status: z.enum(["RUNNING", "BLOCKED", "NO_PITCH", "REVIEW_REQUIRED", "FAILED"]),
    stage: z.string().max(100),
    // Safe, bounded per-source checkpoints; sourceDiagnosticUrl strips path and query data.
    sourceDiagnostics: z.array(sourceDiagnosticSchema).max(160).optional(),
    run: runSchema.nullable(),
    directDrafts: internalEmailDraftsSchema.optional(),
    directReview: internalEmailReviewSchema.optional(),
    internalContact: z
      .object({
        contactId: z.string().min(1).max(200),
        displayName: z.string().min(1).max(180),
        label: z.literal("INTERNAL REVIEW ONLY"),
        eligibility: z.literal("HOLD"),
        outboundReady: z.literal(false),
        unresolved: z.array(z.string().min(1).max(300)).max(12),
      })
      .strict()
      .optional(),
    internalProfile: z
      .object({
        name: z.string().min(1).max(180),
        label: z.literal("INTERNAL ONLY · NOT OUTBOUND READY"),
        verification: z.enum(["VERIFIED", "PARTIAL", "UNVERIFIED"]),
        verifiedFacts: z.array(internalProfileFactSchema).max(8),
        unresolved: z.array(z.string().min(1).max(300)).max(12),
        eligibility: z.literal("HOLD"),
        outboundReady: z.literal(false),
      })
      .strict()
      .optional(),
    reusedResearch: z
      .object({
        documentId: z.string().uuid(),
        createdAt: z.string().datetime(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
    continuedResearch: z
      .object({
        documentId: z.string().uuid(),
        runId: z.string().min(1).max(100),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        startingStage: z.literal("EVIDENCE_VALIDATION"),
        candidateFactIds: z.tuple([
          z.literal("account:4"),
          z.literal("account:5"),
          z.literal("account:6"),
        ]),
      })
      .strict()
      .optional(),
    groundingAudit: groundingAuditSchema.nullable(),
    // Original review is retained when an independently supported subset survives.
    candidateGroundingAudit: groundingAuditSchema.optional(),
    rejectedEvidence: z
      .array(
        z
          .object({
            factId: z.string().max(160),
            statement: z.string().max(800),
            sourceIds: z.array(z.string().max(160)).max(8),
            quotes: z
              .array(
                z
                  .object({
                    sourceId: z.string().max(160),
                    text: z.string().max(1000),
                    exactMatch: z.boolean(),
                  })
                  .strict(),
              )
              .max(4),
            reasons: z.array(z.string().max(300)).max(10),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    quarantinedEvidence: z
      .array(
        z
          .object({
            factId: z.string().max(160),
            statement: z.string().max(800),
            sourceIds: z.array(z.string().max(160)).max(8),
            quotes: z
              .array(
                z
                  .object({
                    sourceId: z.string().max(160),
                    text: z.string().max(1000),
                    exactMatch: z.literal(false),
                  })
                  .strict(),
              )
              .max(4),
            reasons: z.array(z.string().max(300)).max(10),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    screenshot: internalAnalysisSchema.innerType().shape.screenshot,
    screenshotReview: z.enum(["NOT_RUN", "PASSED", "REJECTED"]),
    issues: z.array(z.string().max(1800)).max(30),
    modelCalls: z.number().int().min(0).max(10),
    usage: runSchema.shape.usage,
    contactEligibility: z.literal("HOLD"),
    mode: z.literal("INTERNAL_ONLY"),
  })
  .strict()
  .superRefine((result, ctx) => {
    const run = result.run;
    if (
      run &&
      (run.intake.hubspotRecordId ||
        (result.internalProfile
          ? run.intake.prospectName !== result.internalProfile.name
          : run.intake.prospectName !== "Generic fictional recipient") ||
        run.eligibility.status !== "HOLD" ||
        run.approved ||
        run.canSend ||
        run.canEnroll)
    )
      ctx.addIssue({
        code: "custom",
        message: "Company-only work cannot confer contact clearance",
      });
    if (
      result.status === "REVIEW_REQUIRED" &&
      ((!result.directDrafts && !run?.sequence) ||
        (result.directDrafts ? !result.directReview : !run?.critic) ||
        result.groundingAudit?.status !== "ACCEPTED")
    )
      ctx.addIssue({
        code: "custom",
        message: "Completion requires actual grounding, writing and review",
      });
    if (result.directDrafts && (!run || run.sequence))
      ctx.addIssue({
        code: "custom",
        message: "Internal drafts cannot substitute an outbound sequence",
      });
    if (
      result.directReview &&
      (!result.directDrafts ||
        new Set(result.directReview.checkedSteps).size !== 4 ||
        (result.directReview.verdict === "PASS" &&
          (!Object.values(result.directReview.checks).every(Boolean) ||
            result.directReview.concerns.length ||
            result.directReview.unsupportedAssertions.length)))
    )
      ctx.addIssue({ code: "custom", message: "Incomplete or contradictory independent review" });
    if (result.internalProfile) {
      if (
        !run ||
        run.intake.hubspotRecordId ||
        run.intake.prospectName !== result.internalProfile.name ||
        run.eligibility.status !== "HOLD" ||
        run.approved ||
        run.canSend ||
        run.canEnroll ||
        (result.directDrafts && result.internalProfile.verification !== "VERIFIED")
      )
        ctx.addIssue({
          code: "custom",
          message: "Profile drafts must remain non-CRM and not outbound ready",
        });
      const facts = new Map(run?.research.facts.map((fact) => [fact.id, fact]) ?? []);
      const sources = new Map(run?.research.sources.map((source) => [source.id, source]) ?? []);
      for (const profileFact of result.internalProfile.verifiedFacts) {
        const fact = facts.get(profileFact.evidenceId);
        const supportedSource = fact?.sourceIds
          .map((id) => sources.get(id))
          .find((source) => source?.url === profileFact.sourceUrl);
        if (
          !fact ||
          fact.subject !== "PROSPECT" ||
          (profileFact.field === "currentRole" && fact.category !== "POSITION") ||
          (profileFact.field === "responsibility" && fact.category !== "RESPONSIBILITY") ||
          !fact.quotes.some(
            (quote) =>
              quote.sourceId === supportedSource?.id && quote.text === profileFact.supportingQuote,
          ) ||
          !supportedSource ||
          !supportedSource.excerpt.includes(profileFact.supportingQuote)
        )
          ctx.addIssue({
            code: "custom",
            message: "Profile details must use supported, exact source evidence",
          });
      }
    }
  });
export type AutomaticCompanyResult = z.infer<typeof automaticCompanySchema>;

export const internalDocumentSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    owner: z.string().min(1).max(100),
    company: companyLabelSchema,
    createdAt: z.string().datetime(),
    image: z
      .object({
        mime: z.enum(["image/png", "image/jpeg"]),
        base64: z.string().max(2_800_000),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .nullable(),
    suppliedProfile: suppliedProfileEvidenceSchema.optional(),
    importedEvidence: importedPublicEvidenceSchema.optional(),
    review: internalAnalysisSchema.nullable(),
    execution: internalExecutionSchema.optional(),
    automatic: automaticCompanySchema.optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if (doc.execution && doc.review)
      ctx.addIssue({ code: "custom", message: "Automatic execution cannot claim a manual review" });
    if (doc.automatic && (doc.review || doc.execution))
      ctx.addIssue({
        code: "custom",
        message: "Automatic results cannot substitute historical reviews",
      });
    if (doc.review && doc.review.company !== doc.company)
      ctx.addIssue({ code: "custom", message: "Company identity mismatch" });
    if (doc.review?.screenshot && doc.review.screenshot.sha256 !== doc.image?.sha256)
      ctx.addIssue({ code: "custom", message: "Screenshot identity mismatch" });
    if (doc.automatic?.screenshot && doc.automatic.screenshot.sha256 !== doc.image?.sha256)
      ctx.addIssue({ code: "custom", message: "Automatic screenshot identity mismatch" });
    if (
      doc.suppliedProfile &&
      doc.automatic?.internalProfile &&
      doc.automatic.internalProfile.name !== doc.suppliedProfile.name
    )
      ctx.addIssue({ code: "custom", message: "Profile recipient identity mismatch" });
    if (doc.automatic?.internalProfile && !doc.suppliedProfile)
      ctx.addIssue({
        code: "custom",
        message: "Profile drafts require preserved input provenance",
      });
    if (
      doc.suppliedProfile?.source === "LINKEDIN_URL" &&
      doc.automatic?.run?.intake.linkedinUrl !== doc.suppliedProfile.value
    )
      ctx.addIssue({
        code: "custom",
        message: "Profile URL provenance does not match the research input",
      });
    if (doc.automatic?.internalProfile) {
      const facts = new Map(doc.automatic.run?.research.facts.map((fact) => [fact.id, fact]) ?? []);
      const sources = new Map(
        doc.automatic.run?.research.sources.map((source) => [source.id, source]) ?? [],
      );
      for (const fact of doc.automatic.internalProfile.verifiedFacts) {
        const sourceFact = facts.get(fact.evidenceId);
        const source = sourceFact?.sourceIds
          .map((id) => sources.get(id))
          .find((candidate) => candidate?.url === fact.sourceUrl);
        if (
          !sourceFact ||
          sourceFact.subject !== "PROSPECT" ||
          !sourceFact.quotes.some(
            (quote) => quote.sourceId === source?.id && quote.text === fact.supportingQuote,
          ) ||
          !source ||
          source.url !== fact.sourceUrl ||
          !source.excerpt.includes(fact.supportingQuote)
        )
          ctx.addIssue({
            code: "custom",
            message: "Profile facts must bind to grounded research evidence",
          });
      }
    }
  });
export type InternalCompanyDocument = z.infer<typeof internalDocumentSchema>;
export type InternalAnalysis = z.infer<typeof internalAnalysisSchema>;
