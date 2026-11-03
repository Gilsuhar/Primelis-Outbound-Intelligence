import type {
  ClaimFixture,
  KnowledgeItemFixture,
  KnowledgeSubmissionFixture,
} from "@/features/knowledge/types";

export type AdminKnowledgeAdapter = {
  claims: ClaimFixture[];
  knowledgeItems: KnowledgeItemFixture[];
  submissions: KnowledgeSubmissionFixture[];
};

export function getAdminReviewableClaims(adapter: AdminKnowledgeAdapter) {
  return adapter.claims.filter((claim) => claim.approvalStatus !== "APPROVED");
}

export function getAdminReviewableKnowledgeItems(adapter: AdminKnowledgeAdapter) {
  return adapter.knowledgeItems.filter((item) => item.approvalStatus !== "APPROVED");
}

export function getAdminReviewableSubmissions(adapter: AdminKnowledgeAdapter) {
  return adapter.submissions;
}
