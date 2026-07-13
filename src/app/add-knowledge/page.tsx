import { AddKnowledgeForm } from "@/features/knowledge/add-knowledge-form";
import { requireRole } from "@/lib/auth/server";

export default async function AddKnowledgePage() {
  await requireRole("KNOWLEDGE_ADMIN");
  return <AddKnowledgeForm />;
}
