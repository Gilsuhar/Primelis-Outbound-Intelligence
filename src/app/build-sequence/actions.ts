"use server";

import { generateBuildSequence } from "@/server/services/build-sequence-service";

export async function generateBuildSequenceAction(input: unknown) {
  return generateBuildSequence(input);
}
