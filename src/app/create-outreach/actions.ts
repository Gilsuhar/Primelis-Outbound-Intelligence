"use server";

import { generateCreateOutreach } from "@/server/services/create-outreach-service";

export async function generateCreateOutreachAction(input: unknown) {
  return generateCreateOutreach(input);
}
