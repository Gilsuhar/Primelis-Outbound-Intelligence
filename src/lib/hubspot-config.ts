/** Shared binding and transport settings for the existing HubSpot integration and read-only intake. */
export const HUBSPOT_API_BASE_URL = "https://api.hubapi.com";
export const HUBSPOT_REQUEST_TIMEOUT_MS = 10_000;
export function getHubSpotPrivateAppToken() {
  return process.env.HUBSPOT_PRIVATE_APP_TOKEN;
}
