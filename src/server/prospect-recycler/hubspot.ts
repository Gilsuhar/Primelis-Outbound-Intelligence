import { z } from "zod";
import { IntegrationError } from "../integrations/http";
import { timestamp } from "../../features/prospect-recycler/calendar";
import {
  EMAIL_SCOPE,
  normalizeDomain,
  normalizeEmail,
  type Prospect,
  type Reader,
  type ReadClient,
  type Scan,
} from "./types";
import {
  assertId,
  booleanFlag,
  emptySnapshot,
  eventTime,
  hubPage,
  hubRecord,
  idSchema,
  issue,
  scan,
  setHistory,
} from "./shared";

const associations = z.object({
  results: z.array(
    z.object({
      toObjectId: idSchema,
      associationTypes: z.array(z.object({ typeId: z.number() }).passthrough()).optional(),
    }),
  ),
  paging: z.object({ next: z.object({ after: idSchema }).optional() }).optional(),
});
const email = z.string().email();
const domain = z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/);

export class HubSpotRecyclerReader implements Reader {
  readonly system = "HUBSPOT" as const;
  constructor(
    private readonly client: ReadClient,
    private readonly config: {
      ownerId: string;
      asOf: string;
      outreachIdProperty?: string;
      maxPages?: number;
    },
  ) {
    assertId(config.ownerId);
    if (
      timestamp(config.asOf) === null ||
      (config.outreachIdProperty &&
        !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(config.outreachIdProperty)) ||
      (config.maxPages !== undefined &&
        (!Number.isInteger(config.maxPages) || config.maxPages < 1 || config.maxPages > 30))
    )
      throw new IntegrationError("CONFIGURATION");
  }
  private properties() {
    return [
      "firstname",
      "lastname",
      "email",
      "hubspot_owner_id",
      "hs_email_optout",
      "hs_email_hard_bounce_reason",
      "hs_sequences_is_enrolled",
      ...(this.config.outreachIdProperty ? [this.config.outreachIdProperty] : []),
    ];
  }
  private prospect(item: z.infer<typeof hubRecord>): Prospect {
    if (item.archived || item.properties.hubspot_owner_id !== this.config.ownerId)
      throw new IntegrationError("INVALID_RESPONSE");
    const p = item.properties,
      address = normalizeEmail(p.email ?? "");
    const mapped = this.config.outreachIdProperty ? p[this.config.outreachIdProperty] : undefined;
    return {
      record: { system: this.system, id: item.id },
      fullName: [p.firstname, p.lastname].filter(Boolean).join(" "),
      emails: email.safeParse(address).success ? [address] : [],
      ...(email.safeParse(address).success ? { email: address } : {}),
      ...(mapped && /^\d+$/.test(mapped) ? { mappedOutreachId: mapped } : {}),
    };
  }
  async discover(limit: number): Promise<Scan<Prospect>> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new IntegrationError("CONFIGURATION");
    const result = await scan(
      "",
      async (after) => {
        const page = hubPage.parse(
          await this.client.read("/crm/v3/objects/contacts/search", {
            filterGroups: [
              {
                filters: [
                  { propertyName: "hubspot_owner_id", operator: "EQ", value: this.config.ownerId },
                ],
              },
            ],
            properties: this.properties(),
            sorts: ["hs_object_id"],
            limit: Math.min(100, limit),
            ...(after ? { after } : {}),
          }),
        );
        for (const item of page.results) this.prospect(item);
        return { items: page.results, next: page.paging?.next?.after };
      },
      this.config.maxPages ?? 10,
      limit,
    );
    return { ...result, items: result.items.map((item) => this.prospect(item)) };
  }
  private async associations(id: string, target: "companies" | "emails") {
    return scan(
      "",
      async (after) => {
        const page = associations.parse(
          await this.client.read(
            `/crm/v4/objects/contacts/${id}/associations/${target}?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
          ),
        );
        return {
          items: page.results.map((item) => ({ ...item, id: item.toObjectId })),
          next: page.paging?.next?.after,
        };
      },
      this.config.maxPages ?? 10,
      1000,
    );
  }
  async collect(rawId: string) {
    const id = assertId(rawId);
    const item = hubRecord.parse(
      await this.client.read(
        `/crm/v3/objects/contacts/${id}?properties=${this.properties().join(",")}`,
      ),
    );
    if (item.id !== id) throw new IntegrationError("INVALID_RESPONSE");
    const snapshot = emptySnapshot(this.prospect(item), this.config.asOf),
      p = item.properties;
    if (
      this.config.outreachIdProperty &&
      p[this.config.outreachIdProperty] &&
      !snapshot.prospect.mappedOutreachId
    )
      snapshot.issues.push({ code: "INVALID_IDENTITY_MAPPING", resource: "contact" });
    snapshot.suppression.status = "PARTIAL";
    snapshot.suppression.unsubscribed = booleanFlag(p.hs_email_optout);
    snapshot.suppression.hardBounced = p.hs_email_hard_bounce_reason?.trim() ? true : null;
    if (booleanFlag(p.hs_sequences_is_enrolled) === true) {
      snapshot.sequences.status = "PARTIAL";
      snapshot.sequences.states.push({ id: `contact:${id}`, state: "active" });
    }
    snapshot.issues.push(
      { code: "SUPPRESSION_AUTHORITY_UNPROVEN", resource: "suppression" },
      { code: "HUBSPOT_SEQUENCE_COVERAGE_UNKNOWN", resource: "sequences" },
    );
    const companies = await this.associations(id, "companies");
    snapshot.issues.push(...companies.issues);
    const primary = companies.items.filter((c) => c.associationTypes?.some((t) => t.typeId === 1));
    const companyIds = [...new Set((primary.length ? primary : companies.items).map((c) => c.id))];
    if (companies.status === "COMPLETE" && companyIds.length === 1) {
      try {
        const company = hubRecord.parse(
          await this.client.read(`/crm/v3/objects/companies/${companyIds[0]}?properties=domain`),
        );
        if (company.id !== companyIds[0] || company.archived)
          throw new IntegrationError("INVALID_RESPONSE");
        const host = normalizeDomain(company.properties.domain ?? "");
        if (domain.safeParse(host).success) snapshot.prospect.employerDomain = host;
        else snapshot.issues.push({ code: "EMPLOYER_UNKNOWN", resource: "company" });
      } catch (error) {
        snapshot.issues.push(issue(error, "company"));
      }
    } else snapshot.issues.push({ code: "EMPLOYER_AMBIGUOUS", resource: "companies" });
    const emails = await this.associations(id, "emails");
    const history = { ...emails, items: [...emails.items] };
    for (const association of emails.items) {
      try {
        const message = hubRecord.parse(
          await this.client.read(
            `/crm/v3/objects/emails/${association.id}?properties=hs_timestamp,hs_email_direction,hs_email_status,hs_email_to_email`,
          ),
        );
        if (message.id !== association.id || message.archived)
          throw new IntegrationError("INVALID_RESPONSE");
        const fields = message.properties;
        if (fields.hs_email_direction === "EMAIL" && fields.hs_email_status === "SENT") {
          const at = eventTime(fields.hs_timestamp);
          if (!at || timestamp(at)! > timestamp(this.config.asOf)!)
            throw new IntegrationError("INVALID_RESPONSE");
          const recipients: string[] =
            (fields.hs_email_to_email ?? "")
              .toLowerCase()
              .match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}/g) ?? [];
          const matched = !!snapshot.prospect.email && recipients.includes(snapshot.prospect.email);
          if (!matched) {
            history.status = "PARTIAL";
            snapshot.issues.push({ code: "EMAIL_RECIPIENT_UNKNOWN", resource: "emails" });
          }
          snapshot.communications.push({
            id: `email:${message.id}:sent`,
            record: snapshot.prospect.record,
            at,
            scopeId: EMAIL_SCOPE.id,
            channel: "EMAIL",
            direction: "OUTBOUND",
            outcome: "SENT",
            relevance: matched ? "RELEVANT" : "UNKNOWN",
          });
        } else if (
          !["INCOMING_EMAIL", "FORWARDED_EMAIL"].includes(fields.hs_email_direction ?? "") &&
          !(
            fields.hs_email_direction === "EMAIL" &&
            ["BOUNCED", "FAILED", "SCHEDULED", "SENDING"].includes(fields.hs_email_status ?? "")
          )
        ) {
          history.status = "PARTIAL";
          snapshot.issues.push({ code: "EMAIL_EVENT_UNKNOWN", resource: "emails" });
        }
      } catch (error) {
        history.status = "PARTIAL";
        snapshot.issues.push(issue(error, "emails"));
      }
    }
    setHistory(snapshot, history);
    return snapshot;
  }
}
