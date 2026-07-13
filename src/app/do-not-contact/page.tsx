import { DoNotContactClient } from "@/features/do-not-contact/do-not-contact-client";
import { emptySuppressionRecords } from "@/features/do-not-contact/do-not-contact-policy";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function DoNotContactPage() {
  await requireCurrentUser();
  return <DoNotContactClient records={emptySuppressionRecords} />;
}
