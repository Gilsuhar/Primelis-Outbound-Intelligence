import "server-only";
import { createHash } from "node:crypto";
import {
  choiceHotelsContinuationId,
  internalDocumentSchema,
  type InternalCompanyDocument,
} from "@/features/agent-workforce/company-research/internal-review";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { partitionCompanyEvidence } from "./evidence-partition";

const sourceDocumentId = choiceHotelsContinuationId;
import { sourceDocumentSha256, sourceRunId } from "./continuation-binding";
const categoryById = {
  "account:4": "MARKETS",
  "account:5": "DEVELOPMENT",
  "account:6": "DEVELOPMENT",
} as const;
const selectedIds = Object.keys(categoryById);

export type PreparedChoiceHotelsContinuation = {
  source: InternalCompanyDocument;
  sourceSha256: string;
  research: WorkforceRun["research"];
  quarantined: ReturnType<typeof partitionCompanyEvidence>["quarantined"];
};

/** One saved, exact-hash-bound continuation. It never repairs source IDs or grants semantic acceptance. */
export function prepareChoiceHotelsContinuation(
  raw: string,
  actor: string,
  company: string,
  now: Date,
): PreparedChoiceHotelsContinuation {
  const sourceSha256 = createHash("sha256").update(raw, "utf8").digest("hex");
  if (sourceSha256 !== sourceDocumentSha256) throw new Error("SAVED_CONTINUATION_CHANGED");
  let source: InternalCompanyDocument;
  try {
    source = internalDocumentSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("SAVED_CONTINUATION_INVALID");
  }
  const previous = source.automatic;
  const priorRun = previous?.run;
  const rejected = previous?.rejectedEvidence;
  if (
    source.id !== sourceDocumentId ||
    source.owner !== actor ||
    source.company !== "Choice Hotels" ||
    previous?.status !== "NO_PITCH" ||
    previous.stage !== "ACCOUNT_RESEARCH" ||
    previous.modelCalls !== 4 ||
    previous.directDrafts ||
    previous.directReview ||
    previous.groundingAudit !== null ||
    priorRun?.id !== sourceRunId ||
    priorRun.intake.companyName !== "Choice Hotels International, Inc." ||
    priorRun.intake.companyDomain !== "media.choicehotels.com" ||
    priorRun.research.facts.length !== 0 ||
    priorRun.research.sources.length !== 3 ||
    priorRun.eligibility.status !== "HOLD" ||
    priorRun.approved ||
    priorRun.canSend ||
    priorRun.canEnroll ||
    !["Choice Hotels", "media.choicehotels.com", "Choice Hotels International, Inc."].includes(
      company.trim(),
    ) ||
    !rejected ||
    rejected.length !== 7 ||
    selectedIds.some((id) => !rejected.some((candidate) => candidate.factId === id))
  )
    throw new Error("SAVED_CONTINUATION_NOT_ELIGIBLE");

  const sourceIds = new Set<string>();
  for (const sourceItem of priorRun.research.sources) {
    const expectedId =
      "web:" +
      createHash("sha256")
        .update(sourceItem.url + sourceItem.excerpt)
        .digest("hex")
        .slice(0, 20);
    if (sourceItem.id !== expectedId || sourceIds.has(sourceItem.id))
      throw new Error("SAVED_CONTINUATION_SOURCE_INVALID");
    sourceIds.add(sourceItem.id);
  }

  const sourceMap = new Map(priorRun.research.sources.map((item) => [item.id, item]));
  const candidates: WorkforceRun["research"]["facts"] = selectedIds.map((factId) => {
    const candidate = rejected.find((item) => item.factId === factId)!;
    const exactQuotes = candidate.quotes
      .filter(
        (quote) =>
          candidate.sourceIds.includes(quote.sourceId) &&
          sourceMap.get(quote.sourceId)?.excerpt.includes(quote.text),
      )
      .map(({ sourceId, text }) => ({ sourceId, text }));
    const exactSourceIds = candidate.sourceIds.filter((id) =>
      exactQuotes.some((quote) => quote.sourceId === id),
    );
    if (!exactQuotes.length || !exactSourceIds.length)
      throw new Error("SAVED_CONTINUATION_CITATION_MISSING");
    return {
      id: candidate.factId,
      subject: "ACCOUNT",
      category: categoryById[candidate.factId as keyof typeof categoryById],
      statement: candidate.statement,
      confidence: "HIGH",
      // Let the shared partitioner quarantine the original invalid citation entries;
      // it will retain only these verified exact quotes without rewriting the statement.
      sourceIds: candidate.sourceIds,
      quotes: candidate.quotes.map(({ sourceId, text }) => ({ sourceId, text })),
      limitations: [
        "Reconstructed from the saved audit; semantic acceptance requires new independent grounding.",
      ],
    };
  });
  const run = structuredClone(priorRun);
  run.id = "choice-hotels-continuation-preflight";
  run.research = {
    ...run.research,
    prospectId: run.id,
    facts: candidates,
    gaps: run.research.gaps.filter(
      (gap) => gap !== "Company identity and business context are not supported",
    ),
  };
  const partition = partitionCompanyEvidence(run, now);
  if (
    partition.globalIssues.length ||
    partition.gaps.length ||
    partition.accepted.map((fact) => fact.id).join(",") !== selectedIds.join(",")
  )
    throw new Error("SAVED_CONTINUATION_EVIDENCE_FAILED");

  return {
    source,
    sourceSha256,
    research: { ...run.research, facts: partition.accepted },
    quarantined: partition.quarantined,
  };
}

export const choiceHotelsContinuationReference = {
  documentId: sourceDocumentId,
  runId: sourceRunId,
  startingStage: "EVIDENCE_VALIDATION" as const,
  candidateFactIds: selectedIds,
};
