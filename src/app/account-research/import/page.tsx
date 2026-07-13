import { CompanyContactImportClient } from "@/features/company-contact-enrichment/company-contact-import-client";
import { getTrustedRoleContext } from "@/lib/role-context";

export default function AccountResearchImportPage() {
  const viewer = getTrustedRoleContext();
  return <CompanyContactImportClient role={viewer.role} />;
}
