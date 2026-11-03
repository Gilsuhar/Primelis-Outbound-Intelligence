import "server-only";
import { localDevelopmentUser } from "@/lib/auth/local-development";
import { SIGNAL_HUBSPOT_OWNER_ID } from "@/features/sales-agent/qualification";
import {
  assertLocalOutreach,
  localOutreachVault,
} from "@/server/integrations/local-outreach-vault";
import { OutreachConnector, OutreachTokens } from "@/server/integrations/outreach";
import { outreachCallbackUrl } from "@/server/integrations/outreach-oauth";
import { PrismaIntegrationStore } from "@/server/integrations/store";
import type { ProspectEvidenceAdapter } from "./providers";

/** Reuses the OAuth reader only: no sync jobs, checks, grants, refreshes or CRM mutations. */
export function localOutreachEvidence(actor: string): ProspectEvidenceAdapter {
  assertLocalOutreach(actor);
  const tokens = new OutreachTokens(actor, new PrismaIntegrationStore(), async () => {
    const config = await localOutreachVault();
    if (!config) throw new Error("OUTREACH_CONFIGURATION_UNAVAILABLE");
    return { ...config, redirectUri: outreachCallbackUrl, requireExactScopes: true };
  });
  const reader = new OutreachConnector(() => tokens.access(false), {
    attempts: 1,
    deadline: Date.now() + 45000,
  });
  return {
    provider: "OUTREACH",
    async collect(contact) {
      assertLocalOutreach(actor);
      if (actor !== localDevelopmentUser.id || contact.ownerId !== SIGNAL_HUBSPOT_OWNER_ID)
        throw new Error("OUTREACH_OWNER_DENIED");
      try {
        // The existing connector requires a mapped ID or independently verified email;
        // an unverified CRM email alone never causes an identity search or clears history.
        return await reader.collect(contact, contact.observations);
      } catch {
        return {
          observations: [],
          blockers: [
            "Outreach read unavailable: check existing connection and verified identity. No token refresh or automatic retry performed; history remains HOLD.",
          ],
        };
      }
    },
  };
}
