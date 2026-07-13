import { ReplyToProspectClient } from "@/features/reply-to-prospect/reply-to-prospect-client";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function ReplyToProspectPage() {
  await requireCurrentUser();
  return <ReplyToProspectClient />;
}
