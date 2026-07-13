import { getTrustedRoleContext } from "@/lib/role-context";
import { SuppressionImportClient } from "@/features/do-not-contact/suppression-import-client";

export default function SuppressionImportPage() {
  const viewer = getTrustedRoleContext();
  return <SuppressionImportClient role={viewer.role} />;
}
