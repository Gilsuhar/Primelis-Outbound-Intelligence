"use server";

import { assessAccountResearch } from "@/server/services/account-research-service";
import { enrichCompanyAndContacts } from "@/server/services/company-contact-enrichment-service";
import { researchCompanyWebsite } from "@/server/services/website-research-service";

export async function assessAccountResearchAction(input: unknown) {
  return assessAccountResearch(input);
}

export async function researchCompanyWebsiteAction(input: unknown) {
  return researchCompanyWebsite(input);
}

export async function enrichCompanyAndContactsAction(input: unknown) {
  return enrichCompanyAndContacts(input);
}
