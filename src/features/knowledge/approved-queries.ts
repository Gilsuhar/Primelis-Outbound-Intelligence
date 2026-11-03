import type {
  CaseStudyFixture,
  ClaimFixture,
  KnowledgeItemFixture,
  KnowledgeType,
} from "@/features/knowledge/types";

export type Approved<T extends { approvalStatus: string }> = T & {
  approvalStatus: "APPROVED";
};

export type ApprovedKnowledgeAdapter = {
  claims: ClaimFixture[];
  knowledgeItems: KnowledgeItemFixture[];
  caseStudies: CaseStudyFixture[];
};

function onlyApproved<T extends { approvalStatus: string }>(records: T[]): Array<Approved<T>> {
  return records.filter((record): record is Approved<T> => record.approvalStatus === "APPROVED");
}

export function getApprovedClaims(adapter: ApprovedKnowledgeAdapter) {
  return onlyApproved(adapter.claims);
}

export function getApprovedKnowledgeItems(adapter: ApprovedKnowledgeAdapter) {
  return onlyApproved(adapter.knowledgeItems);
}

export function getApprovedCaseStudies(adapter: ApprovedKnowledgeAdapter) {
  return onlyApproved(adapter.caseStudies);
}

export function getApprovedMessageExamples(adapter: ApprovedKnowledgeAdapter) {
  return onlyApproved(
    adapter.knowledgeItems.filter((item) => item.knowledgeType === "MESSAGE_EXAMPLE"),
  );
}

export function getApprovedCompetitorMaterial(adapter: ApprovedKnowledgeAdapter) {
  const competitorTypes: KnowledgeType[] = ["COMPETITOR", "COMPETITOR_CLAIM"];

  return onlyApproved(
    adapter.knowledgeItems.filter((item) => competitorTypes.includes(item.knowledgeType)),
  );
}
