"use server";

import { assessAccountResearch } from "@/server/services/account-research-service";
import { enrichCompanyAndContacts } from "@/server/services/company-contact-enrichment-service";
import { researchCompanyWebsite } from "@/server/services/website-research-service";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";

export async function assessAccountResearchAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return assessAccountResearch(authenticated.input);
}

export async function researchCompanyWebsiteAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return researchCompanyWebsite(authenticated.input);
}

export async function enrichCompanyAndContactsAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return enrichCompanyAndContacts(authenticated.input);
}
