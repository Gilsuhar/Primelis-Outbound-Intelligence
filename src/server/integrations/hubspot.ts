import "server-only";
import { z } from "zod";
import { SIGNAL_HUBSPOT_OWNER_ID } from "@/features/sales-agent/qualification";
import type { EvidenceObservation, IntakeContact } from "@/features/sales-agent/evidence";
import { HubSpotReadOnlyIntake, normalizeHubSpotNumber } from "@/server/sales-agent/hubspot-intake";
import { IntegrationError, ReadTransport, type TransportOptions } from "./http";
const record = z.object({ id: z.string(), properties: z.record(z.string().nullable()) });
const associations = z.object({
  results: z.array(
    z.object({
      toObjectId: z.union([z.string(), z.number()]),
      associationTypes: z
        .array(z.object({ typeId: z.number(), label: z.string().nullable().optional() }))
        .optional(),
    }),
  ),
  paging: z
    .object({ next: z.object({ after: z.union([z.string(), z.number()]) }).optional() })
    .optional(),
});
export class HubSpotConnector {
  readonly transport: ReadTransport;
  private readonly intake: HubSpotReadOnlyIntake;
  constructor(
    private readonly config: {
      token: string;
      portalId: string;
      revenueCurrency?: string;
      outreachIdProperty?: string;
    },
    options: TransportOptions = {},
    private readonly clock = () => new Date(),
  ) {
    if (
      !config.token ||
      !/^\d+$/.test(config.portalId) ||
      (config.outreachIdProperty && !/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(config.outreachIdProperty))
    )
      throw new IntegrationError("CONFIGURATION");
    this.transport = new ReadTransport("https://api.hubapi.com", async () => config.token, options);
    // The established intake remains the authority for creation/assignment eligibility.
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const data = await this.transport.read(
        url.pathname + url.search,
        init?.body ? JSON.parse(String(init.body)) : undefined,
      );
      return Response.json(data);
    };
    this.intake = new HubSpotReadOnlyIntake(config.token, fetcher, clock, config.revenueCurrency);
  }
  async check() {
    // Every required resource is authenticated. No "Connected" from an environment variable.
    z.object({ results: z.array(record) }).parse(
      await this.transport.read("/crm/v3/objects/contacts/search", {
        filterGroups: [
          {
            filters: [
              { propertyName: "hubspot_owner_id", operator: "EQ", value: SIGNAL_HUBSPOT_OWNER_ID },
            ],
          },
        ],
        properties: ["hubspot_owner_id"],
        limit: 1,
      }),
    );
    z.object({ results: z.array(record) }).parse(
      await this.transport.read("/crm/v3/objects/companies?limit=1"),
    );
    z.object({ results: z.array(record) }).parse(
      await this.transport.read("/crm/v3/objects/deals?limit=1"),
    );
    z.object({ results: z.array(record) }).parse(
      await this.transport.read("/crm/v3/objects/emails?limit=1&properties=hs_timestamp"),
    );
    z.object({ results: z.array(z.object({ id: z.string() })) }).parse(
      await this.transport.read("/crm/v3/pipelines/deals"),
    );
  }
  async discover(since: string, until: string, cursor?: string) {
    const filters = [
      { propertyName: "hubspot_owner_id", operator: "EQ", value: SIGNAL_HUBSPOT_OWNER_ID },
      {
        propertyName: "lastmodifieddate",
        operator: "BETWEEN",
        value: String(Date.parse(since)),
        highValue: String(Date.parse(until)),
      },
      ...(cursor ? [{ propertyName: "hs_object_id", operator: "GT", value: cursor }] : []),
    ];
    const data = z.object({ results: z.array(record).max(100) }).parse(
      await this.transport.read("/crm/v3/objects/contacts/search", {
        filterGroups: [{ filters }],
        sorts: ["hs_object_id"],
        properties: ["hubspot_owner_id"],
        limit: 100,
      }),
    );
    // ID keyset pagination avoids the search API's 10,000-result offset ceiling.
    const ids = [
      ...new Set(
        data.results
          .filter((item) => item.properties.hubspot_owner_id === SIGNAL_HUBSPOT_OWNER_ID)
          .map((item) => item.id),
      ),
    ];
    if (
      data.results.some(
        (item) => !/^\d+$/.test(item.id) || (cursor && BigInt(item.id) <= BigInt(cursor)),
      )
    )
      throw new IntegrationError("INVALID_RESPONSE");
    return { ids, next: data.results.length === 100 ? data.results.at(-1)!.id : undefined };
  }
  private async associated(
    type: "contacts" | "companies",
    id: string,
    target: "companies" | "deals" | "emails",
  ) {
    const items: z.infer<typeof associations>["results"] = [],
      seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const data = associations.parse(
        await this.transport.read(
          `/crm/v4/objects/${type}/${encodeURIComponent(id)}/associations/${target}?limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`,
        ),
      );
      items.push(...data.results);
      const next = data.paging?.next?.after;
      cursor = next === undefined ? undefined : String(next);
      if (cursor && seen.has(cursor)) throw new IntegrationError("INVALID_RESPONSE");
      if (cursor) seen.add(cursor);
      // Bound a worker unit; never call a truncated association list complete.
      if (seen.size > 20) throw new IntegrationError("UNAVAILABLE");
    } while (cursor);
    return items;
  }
  async contact(id: string, intakeSince: string): Promise<IntakeContact | null> {
    const contact = await this.intake.readContact(id, intakeSince);
    if (!contact) return null;
    contact.hubspotRecordUrl = `https://app.hubspot.com/contacts/${this.config.portalId}/record/0-1/${encodeURIComponent(id)}`;
    contact.warnings = contact.warnings.filter(
      (warning) => !/company|revenue currency/i.test(warning),
    );
    contact.observations = contact.observations.filter(
      (item) => !["employeeCount", "annualRevenueUsd"].includes(item.field),
    );
    const now = this.clock().toISOString();
    const add = (field: EvidenceObservation["field"], value: unknown, source: string) =>
      contact.observations.push({
        hubspotRecordId: id,
        field,
        value,
        provider: "HUBSPOT",
        sourceRecordId: source,
        sourceUrl: contact.hubspotRecordUrl,
        observedAt: now,
        verifiedAt: now,
        independent: false,
        supportingEvidence: [source],
      });
    const companies = await this.associated("contacts", id, "companies");
    const primary = companies.filter((item) =>
      item.associationTypes?.some((association) => association.typeId === 1),
    );
    const companyIds = [
      ...new Set((primary.length ? primary : companies).map((item) => String(item.toObjectId))),
    ];
    let companyId: string | undefined;
    if (companyIds.length === 1) {
      companyId = companyIds[0];
      const company = record.parse(
        await this.transport.read(
          `/crm/v3/objects/companies/${encodeURIComponent(companyId)}?properties=name,domain,numberofemployees,annualrevenue`,
        ),
      );
      if (company.id !== companyId) throw new IntegrationError("INVALID_RESPONSE");
      contact.companyName = company.properties.name ?? undefined;
      contact.companyDomain = company.properties.domain?.toLowerCase() ?? undefined;
      // CRM firmographics are observations, not independent validation.
      const employees = normalizeHubSpotNumber(company.properties.numberofemployees),
        revenue = normalizeHubSpotNumber(company.properties.annualrevenue);
      if (employees !== undefined)
        add("employeeCount", employees, `company:${companyId}:numberofemployees`);
      if (revenue !== undefined && this.config.revenueCurrency === "USD")
        add("annualRevenueUsd", revenue, `company:${companyId}:annualrevenue`);
      else contact.warnings.push("Revenue missing or currency not explicitly confirmed as USD");
    } else {
      contact.companyName = undefined;
      contact.companyDomain = undefined;
      contact.warnings.push("Missing or ambiguous primary company association");
    }
    if (this.config.outreachIdProperty) {
      const detail = record.parse(
        await this.transport.read(
          `/crm/v3/objects/contacts/${encodeURIComponent(id)}?properties=${this.config.outreachIdProperty}`,
        ),
      );
      if (detail.id !== id) throw new IntegrationError("INVALID_RESPONSE");
      const external = detail.properties[this.config.outreachIdProperty];
      if (external && /^\d+$/.test(external)) contact.outreachProspectId = external;
      else if (external) contact.warnings.push("Invalid explicit Outreach ID");
    }
    const deals = [
      ...(await this.associated("contacts", id, "deals")),
      ...(companyId ? await this.associated("companies", companyId, "deals") : []),
    ];
    const pipelines = z
      .object({
        results: z.array(
          z.object({
            id: z.string(),
            stages: z.array(
              z.object({
                id: z.string(),
                metadata: z
                  .object({ isClosed: z.union([z.boolean(), z.string()]).optional() })
                  .passthrough(),
              }),
            ),
          }),
        ),
      })
      .parse(await this.transport.read("/crm/v3/pipelines/deals"));
    let active = false,
      unknown = false;
    for (const dealId of [...new Set(deals.map((deal) => String(deal.toObjectId)))]) {
      const deal = record.parse(
        await this.transport.read(
          `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=dealstage,pipeline`,
        ),
      );
      if (deal.id !== dealId) throw new IntegrationError("INVALID_RESPONSE");
      const stage = pipelines.results
        .find((pipeline) => pipeline.id === deal.properties.pipeline)
        ?.stages.find((item) => item.id === deal.properties.dealstage);
      const closed = stage?.metadata.isClosed;
      if (closed === false || closed === "false") active = true;
      else if (closed !== true && closed !== "true") unknown = true;
    }
    if (active || !unknown)
      add(
        "conflictingActiveOpportunity",
        active,
        `contact:${id}:complete-contact-and-company-deals`,
      );
    for (const observation of contact.observations.filter(
      (item) => item.field === "conflictingActiveOpportunity",
    ))
      observation.authority = {
        state: "COMPLETE",
        sources: ["HUBSPOT"],
        checkedAt: now,
        through: now,
        identityMatched: true,
        permissionsVerified: true,
        allUserHistory: false,
        retentionComplete: false,
        evidence: [
          "Complete contact/company deal associations and recognized pipeline stage metadata",
        ],
      };
    if (unknown)
      contact.warnings.push("Deal stage closedness is unknown; opportunity clearance unavailable");
    const emails = await this.associated("contacts", id, "emails");
    for (const emailId of [...new Set(emails.map((email) => String(email.toObjectId)))]) {
      const email = record.parse(
        await this.transport.read(
          `/crm/v3/objects/emails/${encodeURIComponent(emailId)}?properties=hs_timestamp,hs_email_direction,hs_email_status`,
        ),
      );
      if (email.id !== emailId) throw new IntegrationError("INVALID_RESPONSE");
      const p = email.properties;
      if (
        p.hs_email_direction === "EMAIL" &&
        p.hs_email_status === "SENT" &&
        p.hs_timestamp &&
        Number.isFinite(Date.parse(p.hs_timestamp))
      )
        add("lastOutboundAt", new Date(p.hs_timestamp).toISOString(), `email:${emailId}:sent`);
    }
    return contact;
  }
}
