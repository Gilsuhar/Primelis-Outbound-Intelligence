import "server-only";
import type { z } from "zod";
import type { sourceDiagnosticSchema } from "@/features/agent-workforce/company-research/internal-review";
import { createHash } from "node:crypto";
import { allowedSourceUrl } from "./public-sources";

export type SourceDiagnostic = z.infer<typeof sourceDiagnosticSchema>;
export type SourceDiagnosticSink = (event: SourceDiagnostic) => void | Promise<void>;
/** No credentials, queries, fragments, raw paths, headers, content or provider errors. */
export function sourceDiagnosticUrl(raw: string) {
  if (!allowedSourceUrl(raw)) return "[redacted]";
  const url = new URL(raw);
  return (
    url.origin +
    (url.pathname === "/"
      ? "/"
      : "/[path-sha256:" +
        createHash("sha256").update(url.pathname).digest("hex").slice(0, 16) +
        "]")
  );
}
export function sourceFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^(?:SOURCE_(?:UNAVAILABLE|DNS_TIMEOUT|DNS_FAILED|DNS_NOT_PUBLIC|TIMEOUT|TOO_LARGE|REDIRECT|CONTENT_TYPE|CONTENT_REJECTED|NETWORK|TLS)|PUBLIC_SOURCE_PROXY_UNSUPPORTED|SOURCE_HTTP_[1-5][0-9]{2})$/.test(
    message,
  )
    ? message
    : "SOURCE_UNAVAILABLE";
}
export const logCompanySourceDiagnostic: SourceDiagnosticSink = (event) => {
  console.info("[local-company-source]", event);
};
