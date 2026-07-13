import { DoNotContactClient } from "@/features/do-not-contact/do-not-contact-client";
import { emptySuppressionRecords } from "@/features/do-not-contact/do-not-contact-policy";

export default function DoNotContactPage() {
  return <DoNotContactClient records={emptySuppressionRecords} />;
}
