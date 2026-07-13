import { CompanyContactImportClient } from "@/features/company-contact-enrichment/company-contact-import-client";
import { requireRole } from "@/lib/auth/server";

export default async function AccountResearchImportPage() {
  const viewer = await requireRole("KNOWLEDGE_ADMIN");
  return <CompanyContactImportClient role={viewer.role} />;
}
