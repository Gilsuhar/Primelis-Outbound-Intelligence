import type { IntakeContact } from "./evidence";
import { parseTimestamp, SIGNAL_HUBSPOT_OWNER_ID } from "./qualification";

/** Keep pending contacts admitted by a dated owner-scoped intake; never infer assignment from CRM activity. */
export function isInOwnedIntakeScope(contact: IntakeContact) {
  if (contact.ownerId !== SIGNAL_HUBSPOT_OWNER_ID) return false;
  const since = contact.intakeSince ? parseTimestamp(contact.intakeSince) : null;
  const observed = parseTimestamp(contact.observedAt);
  if (since === null || observed === null || since > observed) return false;
  return [contact.hubspotCreatedAt, contact.ownerAssignedAt].some((value) => {
    const at = value ? parseTimestamp(value) : null;
    return at !== null && at >= since && at <= observed;
  });
}
