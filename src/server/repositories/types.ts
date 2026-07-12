import type {
  CaseStudyFixture,
  ClaimFixture,
  FixtureUser,
  GeneratedDraft,
  KnowledgeItemFixture,
  KnowledgeSubmissionFixture,
  ReviewHistoryEntry,
  SourceDocumentFixture,
} from "@/features/knowledge/types";
import type { ReviewAction } from "@/features/review/status-transition";
import type { AddKnowledgeInput } from "@/lib/validation/add-knowledge";

export type RepositoryMode = "fixture" | "prisma";

export type ApprovedKnowledgeResult = {
  claims: ClaimFixture[];
  knowledgeItems: KnowledgeItemFixture[];
  caseStudies: CaseStudyFixture[];
  messageExamples: KnowledgeItemFixture[];
  competitorMaterial: KnowledgeItemFixture[];
};

export type TransitionStatusInput = {
  actor: FixtureUser;
  submissionId: string;
  action: ReviewAction;
  reason?: string;
  internalNote?: string;
};

export type CreateSubmissionInput = AddKnowledgeInput & {
  authorId?: string;
};

export type GeneratedDraftSubmissionInput = {
  generatedDraftId: string;
  title: string;
  suggestedType: KnowledgeSubmissionFixture["knowledgeType"];
  submitterRole: FixtureUser["role"];
  sourceIds?: string[];
};

export interface KnowledgeRepository {
  getApprovedKnowledge(): Promise<ApprovedKnowledgeResult>;
  getApprovedKnowledgeItems(): Promise<KnowledgeItemFixture[]>;
  getReviewableKnowledgeItems(): Promise<KnowledgeItemFixture[]>;
}

export interface ClaimRepository {
  getApprovedClaims(): Promise<ClaimFixture[]>;
  getClaimById(claimId: string): Promise<ClaimFixture | null>;
  removeSourceFromApprovedClaim(claimId: string, sourceId: string): Promise<ClaimFixture>;
}

export interface SourceRepository {
  getSourcesByIds(sourceIds: string[]): Promise<SourceDocumentFixture[]>;
}

export interface ReviewRepository {
  transitionStatus(input: TransitionStatusInput): Promise<KnowledgeSubmissionFixture>;
  createReviewHistory(entry: ReviewHistoryEntry): Promise<ReviewHistoryEntry>;
}

export interface SubmissionRepository {
  getReviewableSubmissions(): Promise<KnowledgeSubmissionFixture[]>;
  createSubmission(input: CreateSubmissionInput): Promise<KnowledgeSubmissionFixture>;
}

export interface CaseStudyRepository {
  getApprovedCaseStudies(): Promise<CaseStudyFixture[]>;
}

export interface GeneratedDraftRepository {
  getGeneratedDraftById(draftId: string): Promise<GeneratedDraft | null>;
  submitGeneratedDraftForReview(
    input: GeneratedDraftSubmissionInput,
  ): Promise<KnowledgeSubmissionFixture>;
}

export type PersistenceRepositories = {
  mode: RepositoryMode;
  knowledge: KnowledgeRepository;
  claims: ClaimRepository;
  sources: SourceRepository;
  reviews: ReviewRepository;
  submissions: SubmissionRepository;
  caseStudies: CaseStudyRepository;
  generatedDrafts: GeneratedDraftRepository;
};
