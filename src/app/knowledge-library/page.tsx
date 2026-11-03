import { KnowledgeLibraryClient } from "@/features/knowledge/knowledge-library-client";
import { requireRole } from "@/lib/auth/server";
import { getPersistenceAdapter } from "@/server/repositories/adapter-factory";

export default async function KnowledgeLibraryPage() {
  await requireRole("KNOWLEDGE_ADMIN");
  const repositories = getPersistenceAdapter();
  const items = await repositories.knowledge.getReviewableKnowledgeItems();

  return <KnowledgeLibraryClient adapterMode={repositories.mode} initialItems={items} />;
}
