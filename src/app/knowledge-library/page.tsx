import { KnowledgeLibraryClient } from "@/features/knowledge/knowledge-library-client";
import { getPersistenceAdapter } from "@/server/repositories/adapter-factory";

export default async function KnowledgeLibraryPage() {
  const repositories = getPersistenceAdapter();
  const items = await repositories.knowledge.getReviewableKnowledgeItems();

  return <KnowledgeLibraryClient adapterMode={repositories.mode} initialItems={items} />;
}
