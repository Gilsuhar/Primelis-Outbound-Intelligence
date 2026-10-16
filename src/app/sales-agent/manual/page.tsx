import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/server";
import { WorkforceClient } from "@/features/agent-workforce/workforce-client";
import { getWorkforceDashboard } from "@/server/agent-workforce/dashboard/service";
export default async function ManualResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const viewer = await requireCurrentUser();
  const { contactId } = await searchParams;
  const prospect = contactId
    ? (await getWorkforceDashboard(viewer.id)).prospects.find(
        (p) => p.contact.hubspotRecordId === contactId,
      )
    : undefined;
  const role = prospect?.provenance.find(
    (p) => p.field === "role" && typeof p.value === "string",
  )?.value;
  const intake = prospect
    ? {
        hubspotRecordId: prospect.contact.hubspotRecordId,
        companyName: prospect.contact.companyName ?? "",
        companyDomain: prospect.contact.companyDomain ?? "",
        prospectName: prospect.contact.fullName,
        prospectTitle: typeof role === "string" ? role : "",
      }
    : undefined;
  return (
    <div className="space-y-4">
      <Link
        className="inline-flex min-h-11 items-center text-sm font-semibold text-signal underline"
        href="/sales-agent"
      >
        ← Agent Workforce dashboard
      </Link>
      <p className="text-sm text-stone-600">
        Manual Research · research can proceed with missing information, but Draft Studio requires
        every mandatory contact gate. Intake values are not verified facts.
      </p>
      {contactId && !prospect ? (
        <p role="alert">
          This contact is outside your authorized queue or its evidence is unavailable. No contact
          was substituted.
        </p>
      ) : (
        <WorkforceClient key={contactId ?? "manual"} initialIntake={intake} />
      )}
    </div>
  );
}
