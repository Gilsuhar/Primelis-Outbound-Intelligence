import { CreateOutreachClient } from "@/features/create-outreach/create-outreach-client";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function CreateOutreachPage() {
  await requireCurrentUser();
  return <CreateOutreachClient />;
}
