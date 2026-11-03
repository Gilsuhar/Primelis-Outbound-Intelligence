import "server-only";
import {
  localDevelopmentConfig,
  localDevelopmentHost,
  localDevelopmentOrigin,
} from "@/lib/auth/local-development";

/** Never derive authorization from forwarded headers. Next normalizes loopback request URLs. */
export function workforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  if (!localDevelopmentConfig()) return origin === url.origin;

  const host = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedPort = request.headers.get("x-forwarded-port");
  const protocol = process.env.LOCAL_DEV_HTTPS === "true" ? "https:" : "http:";
  const allowed =
    localDevelopmentHost(host) &&
    url.protocol === protocol &&
    localDevelopmentHost(url.host) &&
    !url.username &&
    !url.password &&
    origin === localDevelopmentOrigin(host) &&
    (forwardedHost === null || forwardedHost === host) &&
    (forwardedProto === null || `${forwardedProto}:` === protocol) &&
    (forwardedPort === null || forwardedPort === "3000") &&
    !request.headers.has("forwarded");

  if (process.env.LOCAL_DEV_ORIGIN_DIAGNOSTICS === "true") {
    // Allowlisted, bounded scalar fields only. No raw URL/path/query or header enumeration.
    const safeHost = (value: string | null) =>
      value === null ? null : localDevelopmentHost(value) ? value : "<unexpected>";
    console.info("[local-origin]", {
      requestUrlOrigin:
        url.protocol === protocol && localDevelopmentHost(url.host) ? url.origin : "<unexpected>",
      origin:
        origin === null
          ? null
          : [`${protocol}//127.0.0.1:3000`, `${protocol}//localhost:3000`].includes(origin)
            ? origin
            : "<unexpected>",
      host: safeHost(host),
      forwardedHost: safeHost(forwardedHost),
      forwardedProto:
        forwardedProto === null
          ? null
          : `${forwardedProto}:` === protocol
            ? forwardedProto
            : "<unexpected>",
      forwardedPort:
        forwardedPort === null ? null : forwardedPort === "3000" ? "3000" : "<unexpected>",
      forwardedHeaderPresent: request.headers.has("forwarded"),
      allowed,
    });
  }
  return allowed;
}
