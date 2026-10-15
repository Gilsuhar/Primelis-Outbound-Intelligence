import "server-only";
import { createHash } from "node:crypto";
import { normalizeLinkedInUrl } from "@/features/build-sequence/prospect-memory";
import { normalizeDomain } from "@/features/connected-research/url-safety";
import {
  defaultGetLeadsProvider,
  type LinkedInEnrichmentRecord,
} from "@/server/services/linkedin-enrichment-service";
import { sourceSchema, type WorkforceIntake } from "@/features/agent-workforce/gate-a-contracts";
const same = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
/** Reuse the existing authorized GetLeads API only. Never call its public LinkedIn-preview fallback. */
export async function authorizedProspectSource(
  input: WorkforceIntake,
  now: Date,
  provider: (url: string) => Promise<LinkedInEnrichmentRecord | null> = defaultGetLeadsProvider,
) {
  if (!input.linkedinUrl) return null;
  const record = await provider(input.linkedinUrl);
  if (
    !record ||
    record.success === false ||
    (record.linkedin_url &&
      normalizeLinkedInUrl(record.linkedin_url) !== normalizeLinkedInUrl(input.linkedinUrl))
  )
    return null;
  const name = record.full_name || [record.first_name, record.last_name].filter(Boolean).join(" ");
  const domain = normalizeDomain(record.company_domain || record.company_website || "");
  if (
    !same(name, input.prospectName) ||
    !same(record.job_title ?? "", input.prospectTitle) ||
    domain !== input.companyDomain.replace(/^www\./, "") ||
    !same(record.company_name ?? "", input.companyName)
  )
    return null;
  const excerpt = `${name} is ${record.job_title} at ${record.company_name}. Company domain: ${domain}. This is a provider-supplied professional record, not independent employment, email or contact-history clearance.`;
  return sourceSchema.parse({
    id:
      "getleads:" +
      createHash("sha256")
        .update(input.linkedinUrl + excerpt)
        .digest("hex")
        .slice(0, 20),
    url: input.linkedinUrl,
    title: "GetLeads authorized professional record",
    observedAt: now.toISOString(),
    excerpt,
    sourceType: "AUTHORIZED_PROVIDER",
  });
}
