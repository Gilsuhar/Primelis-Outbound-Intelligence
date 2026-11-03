"use server";

import { withAuthenticatedCreator } from "@/lib/auth/action-actor";
import { checkAccountStatus } from "@/server/services/account-status-service";

export async function checkAccountStatusAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return checkAccountStatus(authenticated.input);
}
