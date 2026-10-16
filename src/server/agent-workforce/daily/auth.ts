import "server-only";
import { timingSafeEqual } from "node:crypto";
export function dailyWorkerAuthorized(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const secret = env.INTEGRATION_WORKER_SECRET;
  if (
    env.VERCEL_ENV === "production" ||
    !env.INTEGRATION_OPERATOR_USER_ID ||
    !secret ||
    secret.length < 32
  )
    return false;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
