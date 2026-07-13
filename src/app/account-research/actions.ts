"use server";

import { assessAccountResearch } from "@/server/services/account-research-service";

export async function assessAccountResearchAction(input: unknown) {
  return assessAccountResearch(input);
}
