import { fixtureKnowledgeAdapter } from "@/data/adapters/fixture-knowledge-adapter";
import {
  getApprovedCaseStudies,
  getApprovedClaims,
  getApprovedCompetitorMaterial,
  getApprovedKnowledgeItems,
  getApprovedMessageExamples,
} from "@/features/knowledge/approved-queries";

import { ok } from "./result";

export function retrieveApprovedKnowledge() {
  return ok({
    claims: getApprovedClaims(fixtureKnowledgeAdapter),
    knowledgeItems: getApprovedKnowledgeItems(fixtureKnowledgeAdapter),
    caseStudies: getApprovedCaseStudies(fixtureKnowledgeAdapter),
    messageExamples: getApprovedMessageExamples(fixtureKnowledgeAdapter),
    competitorMaterial: getApprovedCompetitorMaterial(fixtureKnowledgeAdapter),
  });
}
