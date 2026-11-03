import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  companyRequestSchema,
  internalContactDraftContextSchema,
  internalDocumentSchema,
  type InternalContactDraftContext,
  type InternalProfileDraftContext,
} from "@/features/agent-workforce/company-research/internal-review";
import { requireLocalCompanyAccess } from "./config";
import { localDevelopmentHost } from "@/lib/auth/local-development";
import { executeInternalResearch } from "./internal-execution";
import { buildAlicePublicEvidenceImport } from "./alice-evidence-import";
import {
  automaticCompanyConfig,
  executeAutomaticCompany,
  verifyReusableCompanyResearch,
} from "./automatic-execution";
import {
  choiceHotelsContinuationReference,
  prepareChoiceHotelsContinuation,
} from "./choice-hotels-continuation";

const directory = () => join(process.cwd(), "outputs", "product-demonstration", "company-reviews");
const MAX_BYTES = 2_000_000;
let executing = false;
function access(actor: string, host: string | null) {
  requireLocalCompanyAccess(actor);
  if (!localDevelopmentHost(host)) throw new Error("LOCAL_COMPANY_ONLY");
}

/** Bounded local evidence image; no provider, DB, CRM, or worker is invoked. */
export function inspectReviewImage(raw: { mime: "image/png" | "image/jpeg"; base64: string }) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.base64))
    throw new Error("INVALID_IMAGE");
  const bytes = Buffer.from(raw.base64, "base64");
  if (bytes.length > MAX_BYTES || bytes.length < 24) throw new Error("INVALID_IMAGE");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  if ((raw.mime === "image/png" && !png) || (raw.mime === "image/jpeg" && !jpeg))
    throw new Error("INVALID_IMAGE");
  // No SVG, HTML, remote image fetch, OCR guesses, or upload-time metadata inference.
  return { ...raw, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function listInternalReviews(actor: string, host: string | null) {
  access(actor, host);
  let names: string[];
  try {
    names = await readdir(directory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const documents = [];
  for (const name of names
    .filter((n) => /^[a-f0-9-]{36}\.json$/.test(n))
    .sort()
    .slice(0, 25)) {
    try {
      const path = join(directory(), name);
      if ((await stat(path)).size > 3_000_000) continue;
      const raw = await readFile(path, "utf8");
      if (Buffer.byteLength(raw) > 3_000_000) continue;
      const doc = internalDocumentSchema.parse(JSON.parse(raw));
      if (doc.owner !== actor || name !== `${doc.id}.json`) continue;
      if (doc.image && inspectReviewImage(doc.image).sha256 !== doc.image.sha256) continue;
      if (
        doc.suppliedProfile &&
        createHash("sha256").update(doc.suppliedProfile.value).digest("hex") !==
          doc.suppliedProfile.sha256
      )
        continue;
      if (
        doc.execution?.sources.some(
          (source) => createHash("sha256").update(source.text).digest("hex") !== source.sha256,
        )
      )
        continue;
      if (
        doc.importedEvidence?.sources.some(
          (source) => createHash("sha256").update(source.excerpt).digest("hex") !== source.sha256,
        )
      )
        continue;
      documents.push(doc);
    } catch {
      /* Incomplete/invalid local reports never become approved evidence. */
    }
  }
  return documents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Persist the exact Alice/Swarovski public captures as pending evidence, never as grounded facts. */
export async function persistAlicePublicEvidenceImport(
  actor: string,
  host: string | null,
  now = new Date(),
) {
  access(actor, host);
  const candidate = buildAlicePublicEvidenceImport(now);
  const sourceUrls = new Set(candidate.sources.map((source) => source.originalUrl));
  const existing = (await listInternalReviews(actor, host)).find(
    (document) =>
      document.company === "Swarovski" &&
      document.importedEvidence?.kind === "PUBLIC_EVIDENCE_IMPORT" &&
      document.importedEvidence.sources.length === sourceUrls.size &&
      document.importedEvidence.sources.every((source) => sourceUrls.has(source.originalUrl)),
  );
  if (existing) return existing;
  await mkdir(directory(), { recursive: true });
  if ((await readdir(directory())).filter((name) => name.endsWith(".json")).length >= 25)
    throw new Error("REVIEW_LIMIT");
  const id = randomUUID();
  const importedEvidence = candidate;
  const document = internalDocumentSchema.parse({
    version: 1,
    id,
    owner: actor,
    company: "Swarovski",
    createdAt: now.toISOString(),
    image: null,
    review: null,
    importedEvidence,
  });
  const path = join(directory(), `${id}.json`);
  await writeFile(path, JSON.stringify(document), { flag: "wx" });
  return document;
}

export async function createInternalReview(
  actor: string,
  host: string | null,
  raw: unknown,
  execute = false,
  options: {
    maxModelCalls?: 5;
    contactDraft?: InternalContactDraftContext;
    profileDraft?: InternalProfileDraftContext;
  } = {},
) {
  access(actor, host);
  const input = companyRequestSchema.parse(raw);
  const image = input.image ? inspectReviewImage(input.image) : null;
  const automatic = execute && process.env.LOCAL_INTERNAL_SALES_ENABLED === "true";
  if (automatic) automaticCompanyConfig(actor);
  if (input.continueContactId && !input.continueResearchId)
    throw new Error("CONTINUATION_CONTACT_REQUIRES_SAVED_RESEARCH");
  if (input.profile && (input.continueContactId || input.continueResearchId))
    throw new Error("PROFILE_CONTINUATION_NOT_SUPPORTED");
  if (input.profile && options.contactDraft) throw new Error("PROFILE_CRM_CONTACT_CONFLICT");
  if (
    input.continueResearchId &&
    ((input.continueContactId && options.contactDraft?.contactId !== input.continueContactId) ||
      (options.contactDraft && !input.continueContactId))
  )
    throw new Error("CONTINUATION_CONTACT_IDENTITY_UNVERIFIED");
  if (
    input.continueResearchId &&
    options.contactDraft &&
    !["choicehotels", "choicehotelsinternational", "choicehotelsinternationalinc"].includes(
      options.contactDraft.companyName.toLowerCase().replace(/[^a-z0-9]/g, ""),
    )
  )
    throw new Error("CONTINUATION_CONTACT_COMPANY_MISMATCH");
  const reuse = input.reuseResearchId
    ? (await listInternalReviews(actor, host)).find((doc) => doc.id === input.reuseResearchId)
    : undefined;
  if (input.reuseResearchId) {
    if (!automatic || !reuse || image) throw new Error("SAVED_RESEARCH_NOT_VERIFIED");
    verifyReusableCompanyResearch(reuse, actor, input.company);
  }
  let continuation: ReturnType<typeof prepareChoiceHotelsContinuation> | undefined;
  if (input.continueResearchId) {
    if (
      !automatic ||
      image ||
      input.reuseResearchId ||
      input.continueResearchId !== choiceHotelsContinuationReference.documentId
    )
      throw new Error("SAVED_CONTINUATION_NOT_ELIGIBLE");
    const raw = await readFile(join(directory(), `${input.continueResearchId}.json`), "utf8");
    continuation = prepareChoiceHotelsContinuation(raw, actor, input.company, new Date());
  }
  if (execute && executing) throw new Error("RESEARCH_BUSY");
  if (execute) executing = true;
  try {
    await mkdir(directory(), { recursive: true });
    if ((await readdir(directory())).filter((n) => n.endsWith(".json")).length >= 25)
      throw new Error("REVIEW_LIMIT");
    const doc = internalDocumentSchema.parse({
      version: 1,
      id: randomUUID(),
      owner: actor,
      company: input.company,
      createdAt: new Date().toISOString(),
      image,
      ...(input.profile
        ? {
            suppliedProfile: {
              name: input.profile.name,
              source: input.profile.linkedinUrl ? "LINKEDIN_URL" : "PASTED_TEXT",
              value: input.profile.linkedinUrl ?? input.profile.text!,
              sha256: createHash("sha256")
                .update(input.profile.linkedinUrl ?? input.profile.text!)
                .digest("hex"),
              suppliedAt: new Date().toISOString(),
              status: "USER_SUPPLIED_UNVERIFIED",
            },
          }
        : {}),
      review: null,
      ...(execute && !automatic
        ? { execution: await executeInternalResearch(input.company, !!image) }
        : {}),
    });
    const path = join(directory(), `${doc.id}.json`);
    await writeFile(path, JSON.stringify(doc), { flag: "wx" });
    if (automatic) {
      await executeAutomaticCompany(actor, input.company, image, {
        reuse,
        continuation,
        contactDraft: options.contactDraft
          ? internalContactDraftContextSchema.parse(options.contactDraft)
          : undefined,
        profileDraft: input.profile
          ? {
              name: input.profile.name,
              linkedInUrl: input.profile.linkedinUrl ?? null,
              suppliedMaterialStatus: "USER_SUPPLIED_UNVERIFIED" as const,
            }
          : undefined,
        suppliedProfile: doc.suppliedProfile,
        maxModelCalls: options.maxModelCalls,
        checkpoint: async (automaticResult) => {
          doc.automatic = automaticResult;
          // Atomic replacement only of this newly created report; historical files are untouched.
          const temporary = join(directory(), `${doc.id}.pending`);
          await writeFile(temporary, JSON.stringify(internalDocumentSchema.parse(doc)));
          await rename(temporary, path);
        },
      });
    }
    return doc;
  } finally {
    if (execute) executing = false;
  }
}
