"use server";

import { generateBuildSequence } from "@/server/services/build-sequence-service";
import { pushSequenceToHubSpot } from "@/server/services/hubspot-push-service";
import { enrichLinkedInProspect } from "@/server/services/linkedin-enrichment-service";
import { normalizeOpenAiModel, shouldUseOpenAiProvider } from "@/server/services/ai-provider";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";

export async function generateBuildSequenceAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return generateBuildSequence(authenticated.input);
}

export async function enrichLinkedInProspectAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return enrichLinkedInProspect(authenticated.input);
}

export async function getBuildSequenceProviderDiagnosticsAction() {
  await withAuthenticatedCreator({});
  const configuredProvider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const configuredModel = process.env.OPENAI_MODEL?.trim();
  const openAiApiKey = process.env.OPENAI_API_KEY ? "available" as const : "missing" as const;
  return {
    ok: true as const,
    data: {
      aiProvider: configuredProvider || "missing",
      openAiApiKey,
      openAiModel: configuredModel ? normalizeOpenAiModel(configuredModel) : "missing",
      openAiEnabled: shouldUseOpenAiProvider(process.env),
    },
  };
}

export async function pushSequenceToHubSpotAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return pushSequenceToHubSpot(authenticated.input);
}
