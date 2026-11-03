import "server-only";
import { PrismaIntegrationStore, type IntegrationStore } from "./store";
/** A fresh snapshot must not mask a newer permission/sync failure. Read at every live review gate. */
export async function integrationEligibilityBlockers(
  actor: string,
  now: Date,
  store: IntegrationStore = new PrismaIntegrationStore(),
): Promise<string[]> {
  try {
    const result = await Promise.all(
      (["HUBSPOT", "OUTREACH"] as const).map(async (provider) => {
        const { state } = await store.get(actor, provider);
        const checked = state.checkedAt ? Date.parse(state.checkedAt) : NaN;
        const synced = state.lastSuccessfulSync ? Date.parse(state.lastSuccessfulSync) : NaN;
        const fresh = (at: number) =>
          Number.isFinite(at) && at <= now.getTime() && now.getTime() - at <= 86400000;
        return state.status !== "CONNECTED" ||
          !fresh(checked) ||
          !fresh(synced) ||
          state.job?.status !== "COMPLETED" ||
          state.coverage !== "VISIBLE_RECORDS_ONLY"
          ? [
              `${provider} connection/history is unknown, stale, failed or synchronization is incomplete; HOLD until a successful authenticated check and complete fresh import`,
            ]
          : [];
      }),
    );
    return result.flat();
  } catch {
    return ["Integration diagnostics unavailable; connection/history UNKNOWN"];
  }
}

export async function integrationMissingPermissions(
  actor: string,
  store: IntegrationStore = new PrismaIntegrationStore(),
) {
  try {
    return (
      await Promise.all(
        (["HUBSPOT", "OUTREACH"] as const).map(async (provider) => {
          const { state } = await store.get(actor, provider);
          return state.missingScopes.map(
            (scope) => `${provider}: ${scope} (required scope / user visibility to review)`,
          );
        }),
      )
    ).flat();
  } catch {
    return ["Integration permissions could not be inspected"];
  }
}
