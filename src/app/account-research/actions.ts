"use server";

import { assessAccountResearch } from "@/server/services/account-research-service";
import { researchCompanyWebsite } from "@/server/services/website-research-service";

export async function assessAccountResearchAction(input: unknown) {
  return assessAccountResearch(input);
}

export async function researchCompanyWebsiteAction(input: unknown) {
  return researchCompanyWebsite(input);
}
