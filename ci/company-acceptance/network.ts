import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
/** Install after the fixed GitHub metadata check and before loading any fixture executor.
 * PostgreSQL uses its TLS transport; all research/provider HTTP transports are denied. */
export function blockProviderNetwork() {
  let attempts = 0;
  const deny = () => {
    attempts++;
    throw new Error("CI_NETWORK_FORBIDDEN");
  };
  globalThis.fetch = (async () => deny()) as typeof fetch;
  http.request = deny as typeof http.request;
  http.get = deny as typeof http.get;
  https.request = deny as typeof https.request;
  https.get = deny as typeof https.get;
  syncBuiltinESMExports();
  return () => attempts;
}
