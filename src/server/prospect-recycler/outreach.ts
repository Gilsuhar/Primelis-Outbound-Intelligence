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
  issue,
  nextOutreach,
  outreachPage,
  related,
  resource,
  scan,
  setHistory,
  type Resource,
} from "./shared";
const email = z.string().email();
const domain = z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/);

export class OutreachRecyclerReader implements Reader {
  readonly system = "OUTREACH" as const;
  constructor(
    private readonly client: ReadClient,
    private readonly asOf: string,
    private readonly maxPages = 10,
  ) {
    if (timestamp(asOf) === null || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 30)
      throw new IntegrationError("CONFIGURATION");
  }
  private prospect(item: Resource): Prospect {
    if (item.type !== "prospect") throw new IntegrationError("INVALID_RESPONSE");
    const addresses = z.array(z.string()).safeParse(item.attributes.emails);
    const emails = [
      ...new Set(
        (addresses.success ? addresses.data : [])
          .map(normalizeEmail)
          .filter((e) => email.safeParse(e).success),
      ),
    ];
    return {
      record: { system: this.system, id: item.id },
      fullName: [item.attributes.firstName, item.attributes.lastName]
        .filter((v) => typeof v === "string")
        .join(" "),
      emails,
      ...(emails.length === 1 ? { email: emails[0] } : {}),
    };
  }
  private async all(path: string, type: string, prospectId?: string, maxItems = 1000) {
    return scan(
      path,
      async (cursor) => {
        const page = outreachPage.parse(await this.client.read(cursor));
        for (const item of page.data)
          if (item.type !== type || (prospectId && related(item, "prospect") !== prospectId))
            throw new IntegrationError("INVALID_RESPONSE");
        try {
          return {
            items: page.data,
            next: page.links?.next ? nextOutreach(cursor, page.links.next) : undefined,
          };
        } catch (error) {
          return { items: page.data, paginationIssue: issue(error, "pagination") };
        }
      },
      this.maxPages,
      maxItems,
    );
  }
  async discover(limit: number): Promise<Scan<Prospect>> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new IntegrationError("CONFIGURATION");
    const result = await this.all(
      `/api/v2/prospects?page[size]=${limit}&count=false`,
      "prospect",
      undefined,
      limit,
    );
    return { ...result, items: result.items.map((item) => this.prospect(item)) };
  }
  async collect(rawId: string) {
    const id = assertId(rawId);
    const item = z
      .object({ data: resource })
      .parse(await this.client.read(`/api/v2/prospects/${id}`)).data;
    if (item.id !== id) throw new IntegrationError("INVALID_RESPONSE");
    const snapshot = emptySnapshot(this.prospect(item), this.asOf),
      a = item.attributes;
    if (snapshot.prospect.emails.length !== 1)
      snapshot.issues.push({ code: "EMAIL_IDENTITY_AMBIGUOUS", resource: "prospect" });
    const flags = [booleanFlag(a.emailOptedOut), booleanFlag(a.optedOut)];
    snapshot.suppression.status = "PARTIAL";
    snapshot.suppression.unsubscribed = flags.includes(true)
      ? true
      : flags.every((v) => v === false)
        ? false
        : null;
    const accountId = related(item, "account");
    if (accountId) {
      try {
        const account = z
          .object({ data: resource })
          .parse(await this.client.read(`/api/v2/accounts/${accountId}`)).data;
        if (account.type !== "account" || account.id !== accountId)
          throw new IntegrationError("INVALID_RESPONSE");
        const host =
          typeof account.attributes.domain === "string"
            ? normalizeDomain(account.attributes.domain)
            : "";
        if (domain.safeParse(host).success) snapshot.prospect.employerDomain = host;
        else snapshot.issues.push({ code: "EMPLOYER_UNKNOWN", resource: "account" });
      } catch (error) {
        snapshot.issues.push(issue(error, "account"));
      }
    } else snapshot.issues.push({ code: "EMPLOYER_UNKNOWN", resource: "account" });
    const mailings = await this.all(
      `/api/v2/mailings?filter[prospect][id]=${id}&page[size]=100&count=false`,
      "mailing",
      id,
    );
    for (const mailing of mailings.items) {
      const attrs = mailing.attributes;
      if (!("deliveredAt" in attrs)) {
        mailings.status = "PARTIAL";
        snapshot.issues.push({ code: "EMAIL_EVENT_UNKNOWN", resource: "mailings" });
      }
      // bouncedAt is not a documented hard/soft classification. Never fabricate a hard-bounce clearance.
      if (attrs.bouncedAt != null)
        snapshot.issues.push({ code: "BOUNCE_CLASSIFICATION_UNKNOWN", resource: "mailings" });
      if (attrs.unsubscribedAt != null) {
        const at = eventTime(attrs.unsubscribedAt);
        if (at && timestamp(at)! <= timestamp(this.asOf)!) snapshot.suppression.unsubscribed = true;
        else snapshot.issues.push({ code: "UNSUBSCRIBE_TIMESTAMP_INVALID", resource: "mailings" });
      }
      if (attrs.markedAsSpamAt != null) {
        if (
          eventTime(attrs.markedAsSpamAt) &&
          timestamp(eventTime(attrs.markedAsSpamAt)!)! <= timestamp(this.asOf)!
        )
          snapshot.suppression.complained = true;
        else snapshot.issues.push({ code: "COMPLAINT_TIMESTAMP_INVALID", resource: "mailings" });
      }
      // Outreach REST mailing schema documents deliveredAt, not sentAt.
      // Preserve delivery semantics; creation/scheduling/open timestamps are not send events.
      for (const field of ["deliveredAt"] as const) {
        if (attrs[field] == null) continue;
        const at = eventTime(attrs[field]);
        if (!at || timestamp(at)! > timestamp(this.asOf)!) {
          mailings.status = "PARTIAL";
          snapshot.issues.push({ code: "EMAIL_TIMESTAMP_INVALID", resource: "mailings" });
          continue;
        }
        snapshot.communications.push({
          id: `mailing:${mailing.id}:${field}`,
          record: snapshot.prospect.record,
          at,
          scopeId: EMAIL_SCOPE.id,
          channel: "EMAIL",
          direction: "OUTBOUND",
          outcome: "DELIVERED",
          relevance: "RELEVANT",
        });
      }
    }
    setHistory(snapshot, mailings);
    const sequences = await this.all(
      `/api/v2/sequenceStates?filter[prospect][id]=${id}&page[size]=100&count=false`,
      "sequenceState",
      id,
    );
    snapshot.issues.push(
      ...sequences.issues,
      { code: "SEQUENCE_AUTHORITY_UNPROVEN", resource: "sequences" },
      { code: "SUPPRESSION_AUTHORITY_UNPROVEN", resource: "suppression" },
    );
    snapshot.sequences.status = sequences.status === "UNKNOWN" ? "UNKNOWN" : "PARTIAL";
    snapshot.sequences.states = sequences.items.map((s) => ({
      id: s.id,
      state:
        typeof s.attributes.state === "string" && s.attributes.state.trim()
          ? s.attributes.state
          : "unknown",
    }));
    // Preserve failed/disabled/paused/bounced verbatim for the Phase 1 HOLD rules.
    return snapshot;
  }
}
