import "server-only";
import { getHubSpotPrivateAppToken } from "../../lib/hubspot-config";
import { localDevelopmentConfig, localDevelopmentUser } from "../../lib/auth/local-development";
import { SIGNAL_HUBSPOT_OWNER_ID } from "../../features/sales-agent/qualification";
import { IntegrationError, ReadTransport } from "../integrations/http";
import { OutreachTokens } from "../integrations/outreach";
import { assertLocalOutreach, localOutreachVault } from "../integrations/local-outreach-vault";
import { outreachCallbackUrl } from "../integrations/outreach-oauth";
import { PrismaIntegrationStore } from "../integrations/store";
import { HubSpotRecyclerReader } from "./hubspot";
import { OutreachRecyclerReader } from "./outreach";
import { boundedClient } from "./shared";

/** Reuses existing authentication and HTTP allowlists. Constructing readers makes no requests. */
export function createRecyclerReaders(config: {
  asOf: string;
  hubspotOwnerId: string;
  hubspotToken: () => Promise<string>;
  outreachTokens: Pick<OutreachTokens, "access">;
  outreachIdProperty?: string;
  fetcher?: typeof fetch;
  maxRequestsPerProvider?: number;
  maxPages?: number;
}) {
  const options = { fetcher: config.fetcher, attempts: 1, deadline: Date.now() + 60_000 };
  return {
    HUBSPOT: new HubSpotRecyclerReader(
      boundedClient(
        new ReadTransport(
          "https://api.hubapi.com",
          async () => {
            const token = await config.hubspotToken();
            if (!token) throw new IntegrationError("CONFIGURATION");
            return token;
          },
          options,
        ),
        config.maxRequestsPerProvider ?? 100,
      ),
      {
        asOf: config.asOf,
        ownerId: config.hubspotOwnerId,
        outreachIdProperty: config.outreachIdProperty,
        maxPages: config.maxPages,
      },
    ),
    OUTREACH: new OutreachRecyclerReader(
      boundedClient(
        new ReadTransport(
          "https://api.outreach.io",
          () => config.outreachTokens.access(false),
          options,
        ),
        config.maxRequestsPerProvider ?? 100,
      ),
      config.asOf,
      config.maxPages,
    ),
  };
}

/** Existing launcher supplies HubSpot credentials; existing DPAPI/AES storage supplies Outreach.
 * No IntegrationSync, OAuth exchange, refresh, state updates, evidence saves or worker scheduling.
 */
export function createLocalRecyclerReaders(
  actor: string,
  asOf: string,
  limits: Pick<
    Parameters<typeof createRecyclerReaders>[0],
    "fetcher" | "maxPages" | "maxRequestsPerProvider"
  > = {},
) {
  if (
    !localDevelopmentConfig() ||
    actor !== localDevelopmentUser.id ||
    process.env.INTEGRATION_OPERATOR_USER_ID !== actor
  )
    throw new IntegrationError("CONFIGURATION");
  const outreachTokens = new OutreachTokens(actor, new PrismaIntegrationStore(), async () => {
    assertLocalOutreach(actor);
    const config = await localOutreachVault();
    if (!config) throw new IntegrationError("CONFIGURATION");
    return { ...config, redirectUri: outreachCallbackUrl, requireExactScopes: true };
  });
  return createRecyclerReaders({
    ...limits,
    asOf,
    hubspotOwnerId: SIGNAL_HUBSPOT_OWNER_ID,
    hubspotToken: async () => getHubSpotPrivateAppToken() ?? "",
    outreachTokens,
    outreachIdProperty: process.env.HUBSPOT_OUTREACH_ID_PROPERTY,
  });
}
