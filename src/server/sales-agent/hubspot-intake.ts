import "server-only";

import { z } from "zod";
import {
  getHubSpotPrivateAppToken,
  HUBSPOT_API_BASE_URL,
  HUBSPOT_REQUEST_TIMEOUT_MS,
} from "@/lib/hubspot-config";

import type { EvidenceObservation, IntakeContact } from "@/features/sales-agent/evidence";
import { SIGNAL_HUBSPOT_OWNER_ID } from "@/features/sales-agent/qualification";
import type { ContactIntakeAdapter, IntakeBatch } from "./providers";

const properties = z.record(z.string().nullable());
const objectSchema = z.object({
  id: z.string().min(1),
  properties,
  propertiesWithHistory: z
    .record(z.array(z.object({ timestamp: z.string(), value: z.string().optional() })))
    .optional(),
  associations: z
    .object({
      companies: z
        .object({ results: z.array(z.object({ id: z.string(), type: z.string() })) })
        .optional(),
    })
    .optional(),
});
const searchSchema = z.object({
  results: z.array(objectSchema).max(100),
  paging: z
    .object({ next: z.object({ after: z.union([z.string(), z.number()]) }).optional() })
    .optional(),
});

type HubSpotObject = z.infer<typeof objectSchema>;
/** Strict numeric values only; ranges, unknowns and locale ambiguity remain missing. */
export function normalizeHubSpotNumber(value: string | null | undefined): number | undefined {
  if (!value || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim())) return undefined;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Same private-app binding, API host and timeout convention as the existing HubSpot integration.
 * Only the exact read endpoints below are callable. No creation/update/enrollment methods exist.
 */
export class HubSpotReadOnlyIntake implements ContactIntakeAdapter {
  constructor(
    private readonly token = getHubSpotPrivateAppToken(),
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock = () => new Date(),
    private readonly revenueCurrency = process.env.HUBSPOT_COMPANY_REVENUE_CURRENCY,
  ) {}

  private async read(path: string, searchBody?: unknown): Promise<unknown> {
    if (!this.token)
      throw new Error("HubSpot intake is not configured: set HUBSPOT_PRIVATE_APP_TOKEN securely");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HUBSPOT_REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(`${HUBSPOT_API_BASE_URL}${path}`, {
        method: searchBody ? "POST" : "GET",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        ...(searchBody ? { body: JSON.stringify(searchBody) } : {}),
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) {
        // HTTP status and endpoint are safe diagnostics; never log tokens or response bodies.
        console.error("[hubspot-intake] request_failed", { status: response.status, endpoint: path.split("?")[0].replace(/\/\d+$/, "/:id") });
        throw new Error(`HubSpot read failed (HTTP ${response.status}); check read scopes, network access or rate limit`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async listOwnedContacts(after?: string): Promise<IntakeBatch> {
    const data = searchSchema.parse(
      await this.read("/crm/v3/objects/contacts/search", {
        filterGroups: [
          {
            filters: [
              { propertyName: "hubspot_owner_id", operator: "EQ", value: SIGNAL_HUBSPOT_OWNER_ID },
            ],
          },
        ],
        properties: ["hubspot_owner_id"],
        limit: 100,
        sorts: ["hs_object_id"],
        ...(after ? { after } : {}),
      }),
    );
    const warnings: string[] = [];
    const seen = new Map<string, HubSpotObject>();
    const excluded = new Set<string>();
    for (const record of data.results) {
      if (record.properties.hubspot_owner_id !== SIGNAL_HUBSPOT_OWNER_ID) {
        excluded.add(record.id);
        warnings.push("Excluded contact with unauthorized or ambiguous owner");
        continue;
      }
      seen.set(record.id, record);
    }
    const records = [...seen.values()].filter((record) => !excluded.has(record.id));
    const contacts: IntakeContact[] = [];
    let complete = true;
    // Four workers bound provider pressure; each invocation reads one page, with an explicit cursor.
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, records.length) }, async () => {
        while (index < records.length) {
          const record = records[index++];
          try {
            const contact = await this.readContact(record.id);
            if (contact) contacts.push(contact);
            else warnings.push("Excluded contact whose owner changed during collection");
          } catch {
            complete = false;
            warnings.push(`Unable to read HubSpot contact ${record.id}; retry this page`);
          }
        }
      }),
    );
    const nextCursor = data.paging?.next ? String(data.paging.next.after) : undefined;
    if (nextCursor) warnings.push("More owned contacts are available; collect the next page");
    return {
      contacts: contacts.sort((a, b) => a.hubspotRecordId.localeCompare(b.hubspotRecordId)),
      complete: complete && !nextCursor,
      warnings,
      nextCursor: complete ? nextCursor : undefined,
    };
  }

  private async readContact(id: string): Promise<IntakeContact | null> {
    const detail = objectSchema.parse(
      await this.read(
        `/crm/v3/objects/contacts/${encodeURIComponent(id)}?properties=firstname,lastname,email,jobtitle,hubspot_owner_id,hs_email_optout,hs_email_hard_bounce_reason&propertiesWithHistory=email&associations=companies`,
      ),
    );
    if (detail.id !== id) throw new Error("HubSpot contact identity mismatch");
    if (detail.properties.hubspot_owner_id !== SIGNAL_HUBSPOT_OWNER_ID) return null;
    const observedAt = this.clock().toISOString();
    const p = detail.properties;
    const observations: EvidenceObservation[] = [];
    const add = (field: EvidenceObservation["field"], value: unknown, sourceRecordId: string) => {
      observations.push({
        hubspotRecordId: id,
        field,
        value,
        provider: "HUBSPOT",
        sourceRecordId,
        observedAt: this.clock().toISOString(),
        verifiedAt: null,
        independent: false,
        supportingEvidence: [],
      });
    };
    if (p.jobtitle?.trim()) add("role", p.jobtitle, `contact:${id}:jobtitle`);
    if (p.hs_email_optout === "true" || p.hs_email_optout === "false")
      add("unsubscribed", p.hs_email_optout === "true", `contact:${id}:hs_email_optout`);
    if (p.hs_email_hard_bounce_reason?.trim())
      add("hardBounced", true, `contact:${id}:hs_email_hard_bounce_reason`);
    const warnings: string[] = [];
    const associations = detail.associations?.companies?.results ?? [];
    const primaries = associations.filter((item) => item.type === "contact_to_company");
    const companyIds = [
      ...new Set((primaries.length ? primaries : associations).map((item) => item.id)),
    ];
    let company: HubSpotObject | undefined;
    if (companyIds.length === 1) {
      try {
        company = objectSchema.parse(
          await this.read(
            `/crm/v3/objects/companies/${encodeURIComponent(companyIds[0])}?properties=name,domain,numberofemployees,annualrevenue`,
          ),
        );
        if (company.id !== companyIds[0]) throw new Error("Company identity mismatch");
      } catch {
        company = undefined;
        warnings.push("Company read failed; verify primary company and retry collection");
      }
    } else warnings.push("Missing or ambiguous primary company association");
    if (company) {
      const employees = normalizeHubSpotNumber(company.properties.numberofemployees);
      const revenue = normalizeHubSpotNumber(company.properties.annualrevenue);
      if (employees !== undefined)
        add("employeeCount", employees, `company:${company.id}:numberofemployees`);
      if (revenue !== undefined)
        add(
          "annualRevenueUsd",
          this.revenueCurrency === "USD" ? revenue : { amount: revenue, currency: "UNKNOWN" },
          `company:${company.id}:annualrevenue`,
        );
      if (revenue !== undefined && this.revenueCurrency !== "USD")
        warnings.push("Confirm company revenue currency; no automatic USD conversion");
    }
    const emailHistory = detail.propertiesWithHistory?.email ?? [];
    const timestamps = emailHistory
      .map((item) => item.timestamp)
      .filter((item) => Number.isFinite(Date.parse(item)))
      .sort((a, b) => Date.parse(b) - Date.parse(a));
    return {
      hubspotRecordId: id,
      ownerId: p.hubspot_owner_id!,
      fullName: [p.firstname, p.lastname].filter(Boolean).join(" ") || `HubSpot contact ${id}`,
      email: p.email || undefined,
      companyName: company?.properties.name || undefined,
      companyDomain: company?.properties.domain?.toLowerCase() || undefined,
      emailModifiedAt: timestamps[0],
      observedAt,
      observations,
      warnings,
    };
  }
}
