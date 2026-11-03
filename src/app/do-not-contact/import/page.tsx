import { SuppressionImportClient } from "@/features/do-not-contact/suppression-import-client";
import { requireRole } from "@/lib/auth/server";

export default async function SuppressionImportPage() {
  const viewer = await requireRole("KNOWLEDGE_ADMIN");
  return <SuppressionImportClient role={viewer.role} />;
}
