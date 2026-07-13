import { AccountResearchClient } from "@/features/account-research/account-research-client";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function AccountResearchPage() {
  await requireCurrentUser();
  return <AccountResearchClient />;
}
