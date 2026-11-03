import "server-only";
import { timingSafeEqual } from "node:crypto";
import { companyPilotConfig } from "@/lib/company-pilot-isolation";
export const requirePilotConfig = companyPilotConfig;
export function requirePilotRequest(
  request: Request,
  actor?: string,
  worker = false,
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = requirePilotConfig(env);
  const url = new URL(request.url);
  if (
    url.origin !== config.origin ||
    request.headers.get("host") !== url.host ||
    (request.headers.has("x-forwarded-host") &&
      request.headers.get("x-forwarded-host") !== url.host) ||
    (request.headers.has("x-forwarded-proto") &&
      request.headers.get("x-forwarded-proto") !== "https")
  )
    throw new Error("PILOT_FORBIDDEN");
  if (worker) {
    const secret = env.COMPANY_PILOT_WORKER_SECRET;
    const actual = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret ?? ""}`);
    if (
      request.method !== "POST" ||
      !secret ||
      secret.length < 32 ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new Error("PILOT_FORBIDDEN");
  } else if (
    actor !== config.actor ||
    (request.method !== "GET" && request.headers.get("origin") !== config.origin) ||
    (request.headers.has("origin") && request.headers.get("origin") !== config.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new Error("PILOT_FORBIDDEN");
  return config;
}
