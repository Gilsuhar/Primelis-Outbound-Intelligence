import "server-only";
import { z } from "zod";
import type { EvidenceObservation, IntakeContact } from "@/features/sales-agent/evidence";
import { normalizeCollectedEvidence } from "@/features/sales-agent/evidence";
import { decryptToken, encryptToken, type IntegrationStore } from "./store";
import { IntegrationError, nextReadPage, ReadTransport, type TransportOptions } from "./http";
const resource = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  type: z.string(),
  attributes: z.record(z.unknown()),
  relationships: z.record(z.object({ data: z.unknown().optional() }).passthrough()).optional(),
});
const page = z.object({
  data: z.array(resource),
  links: z.object({ next: z.string().nullable().optional() }).passthrough().optional(),
});
type Resource = z.infer<typeof resource>;
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().finite().positive().max(2592000),
  scope: z.string().optional(),
});
const storedToken = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
});
export class OutreachTokens {
  constructor(
    private readonly actor: string,
    private readonly store: IntegrationStore,
    private readonly config: {
      clientId: string;
      clientSecret: string;
      refreshToken?: string;
      redirectUri: string;
    },
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async access(): Promise<string> {
    const previous = await this.store.get(this.actor, "OUTREACH");
    const fresh = previous.secret
      ? storedToken.parse(JSON.parse(decryptToken(this.actor, previous.secret)))
      : null;
    if (fresh && fresh.expiresAt > Date.now() + 60000) return fresh.accessToken;
    // The transaction/advisory lock serializes rotating refresh tokens across workers.
    return this.store.change(this.actor, "OUTREACH", async (row) => {
      const cached = row.secret
        ? storedToken.parse(JSON.parse(decryptToken(this.actor, row.secret)))
        : null;
      if (cached && cached.expiresAt > Date.now() + 60000)
        return { row, value: cached.accessToken };
      const refresh = cached?.refreshToken ?? this.config.refreshToken;
      if (
        !refresh ||
        !this.config.clientId ||
        !this.config.clientSecret ||
        !this.config.redirectUri ||
        !process.env.INTEGRATION_ENCRYPTION_KEY
      )
        throw new IntegrationError("CONFIGURATION");
      let redirect: URL;
      try {
        redirect = new URL(this.config.redirectUri);
      } catch {
        throw new IntegrationError("CONFIGURATION");
      }
      if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.hash)
        throw new IntegrationError("CONFIGURATION");
      let response: Response;
      try {
        response = await this.fetcher("https://api.outreach.io/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            refresh_token: refresh,
            redirect_uri: this.config.redirectUri,
          }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new IntegrationError("UNAVAILABLE");
      }
      // Never retry a possibly consumed refresh grant automatically.
      if (!response.ok)
        throw new IntegrationError(
          response.status === 400 || response.status === 401
            ? "DISCONNECTED"
            : response.status === 403
              ? "PERMISSION_MISSING"
              : "UNAVAILABLE",
          response.status,
        );
      let token: z.infer<typeof tokenSchema>;
      try {
        token = tokenSchema.parse(await response.json());
      } catch {
        throw new IntegrationError("INVALID_RESPONSE");
      }
      row.secret = encryptToken(
        this.actor,
        JSON.stringify({
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt: Date.now() + token.expires_in * 1000,
        }),
      );
      return { row, value: token.access_token };
    });
  }
}
function relatedId(item: Resource, key: string): string | undefined {
  const data = item.relationships?.[key]?.data;
  const parsed = z.object({ id: z.union([z.string(), z.number()]) }).safeParse(data);
  return parsed.success ? String(parsed.data.id) : undefined;
}
export class OutreachConnector {
  readonly transport: ReadTransport;
  constructor(
    token: () => Promise<string>,
    options: TransportOptions = {},
    private readonly clock = () => new Date(),
  ) {
    this.transport = new ReadTransport("https://api.outreach.io", token, options);
  }
  async check() {
    for (const type of ["prospects", "accounts", "mailings", "sequenceStates"]) {
      page.parse(await this.transport.read(`/api/v2/${type}?page[size]=1`));
    }
  }
  private async all(path: string): Promise<Resource[]> {
    const records = new Map<string, Resource>(),
      visited = new Set<string>();
    let current: string | undefined = path;
    while (current) {
      if (visited.has(current) || visited.size >= 30) throw new IntegrationError("UNAVAILABLE");
      visited.add(current);
      const data = page.parse(await this.transport.read(current));
      for (const item of data.data) {
        if (records.has(item.id) && JSON.stringify(records.get(item.id)) !== JSON.stringify(item))
          throw new IntegrationError("INVALID_RESPONSE");
        records.set(item.id, item);
      }
      current = data.links?.next
        ? nextReadPage(current, data.links.next, "https://api.outreach.io")
        : undefined;
    }
    return [...records.values()];
  }
  async collect(contact: IntakeContact, evidence: EvidenceObservation[]) {
    const now = this.clock(),
      observations: EvidenceObservation[] = [],
      blockers: string[] = [];
    const add = (field: EvidenceObservation["field"], value: unknown, source: string) =>
      observations.push({
        hubspotRecordId: contact.hubspotRecordId,
        field,
        value,
        provider: "OUTREACH",
        sourceRecordId: source,
        observedAt: now.toISOString(),
        verifiedAt: now.toISOString(),
        independent: false,
        supportingEvidence: [source],
      });
    let candidates: Resource[];
    if (contact.outreachProspectId) {
      const result = z
        .object({ data: resource })
        .parse(
          await this.transport.read(
            `/api/v2/prospects/${encodeURIComponent(contact.outreachProspectId)}`,
          ),
        );
      if (result.data.id !== contact.outreachProspectId)
        throw new IntegrationError("INVALID_RESPONSE");
      candidates = [result.data];
    } else {
      const verified = normalizeCollectedEvidence(contact, evidence, now).provenance.find(
        (item) => item.field === "emailVerification" && item.accepted && item.freshness === "FRESH",
      );
      const validEmail = z
        .object({
          status: z.literal("VALID"),
          independentlyVerified: z.literal(true),
          emailMatchesCurrentRecord: z.literal(true),
          businessEmailVerified: z.literal(true),
        })
        .safeParse(verified?.value);
      if (!verified || !validEmail.success || !contact.email)
        return {
          observations,
          blockers: [
            "Outreach identity UNKNOWN: explicit mapped ID or independently verified current business email required",
          ],
        };
      candidates = await this.all(
        `/api/v2/prospects?filter[emails]=${encodeURIComponent(contact.email.trim().toLowerCase())}&page[size]=100`,
      );
    }
    if (candidates.length !== 1)
      return {
        observations,
        blockers: [
          `Outreach identity ${candidates.length ? "AMBIGUOUS" : "UNKNOWN"}; no history clearance`,
        ],
      };
    const prospect = candidates[0],
      a = prospect.attributes;
    if (prospect.type !== "prospect") throw new IntegrationError("INVALID_RESPONSE");
    const emails = z.array(z.string()).safeParse(a.emails);
    if (
      !contact.email ||
      !emails.success ||
      !emails.data.some(
        (email) => email.trim().toLowerCase() === contact.email!.trim().toLowerCase(),
      )
    )
      return { observations, blockers: ["Outreach email identity conflict; no automatic merge"] };
    const expectedName = contact.fullName.trim().toLowerCase().replace(/\s+/g, " ");
    const actualName = [a.firstName, a.lastName]
      .filter((part) => typeof part === "string" && part.trim())
      .join(" ")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (actualName && actualName !== expectedName)
      return {
        observations,
        blockers: ["Outreach name identity conflict; review explicit association"],
      };
    const accountId = relatedId(prospect, "account");
    if (!accountId) blockers.push("Outreach account association unavailable");
    else {
      const account = z
        .object({ data: resource })
        .parse(await this.transport.read(`/api/v2/accounts/${encodeURIComponent(accountId)}`)).data;
      if (account.id !== accountId || account.type !== "account")
        throw new IntegrationError("INVALID_RESPONSE");
      const domain = account.attributes.domain;
      if (
        typeof domain !== "string" ||
        !contact.companyDomain ||
        domain.toLowerCase().replace(/^www\./, "") !==
          contact.companyDomain.toLowerCase().replace(/^www\./, "")
      )
        return {
          observations: [],
          blockers: ["Outreach company association is missing or conflicting"],
        };
    }
    const prospectId = prospect.id;
    for (const key of ["emailOptedOut", "optedOut"]) {
      if (a[key] === true) add("unsubscribed", true, `prospect:${prospectId}:${key}`);
    }
    if (a.emailOptedOut === false && a.optedOut === false)
      add("unsubscribed", false, `prospect:${prospectId}:explicit-optout-flags`);
    else if (a.emailOptedOut !== true && a.optedOut !== true)
      blockers.push("Outreach unsubscribe coverage unavailable");
    const mailings = await this.all(
      `/api/v2/mailings?filter[prospect][id]=${encodeURIComponent(prospectId)}&page[size]=100`,
    );
    for (const mailing of mailings) {
      if (mailing.type !== "mailing" || relatedId(mailing, "prospect") !== prospectId)
        throw new IntegrationError("INVALID_RESPONSE");
      const attrs = mailing.attributes;
      if (typeof attrs.bouncedAt === "string")
        blockers.push(
          `Outreach bounce observed on mailing ${mailing.id}; hard/soft classification unavailable, suppression clearance UNKNOWN`,
        );
      if (typeof attrs.markedAsSpamAt === "string")
        add("complained", true, `mailing:${mailing.id}:markedAsSpamAt`);
      // sentAt proves a sent outbound mailing; drafted/scheduled/failed messages do not count.
      if (
        typeof attrs.sentAt === "string" &&
        Number.isFinite(Date.parse(attrs.sentAt)) &&
        Date.parse(attrs.sentAt) <= now.getTime()
      )
        add("lastOutboundAt", new Date(attrs.sentAt).toISOString(), `mailing:${mailing.id}:sentAt`);
    }
    const sequences = await this.all(
      `/api/v2/sequenceStates?filter[prospect][id]=${encodeURIComponent(prospectId)}&page[size]=100`,
    );
    for (const sequence of sequences) {
      if (sequence.type !== "sequenceState" || relatedId(sequence, "prospect") !== prospectId)
        throw new IntegrationError("INVALID_RESPONSE");
    }
    const states = sequences.map((item) => item.attributes.state);
    if (states.some((state) => ["active", "pending", "paused"].includes(String(state))))
      add("activeSequence", true, `prospect:${prospectId}:sequenceStates`);
    else if (
      states.every((state) =>
        ["finished", "failed", "disabled", "bounced", "opted_out", "replied"].includes(
          String(state),
        ),
      )
    )
      add("activeSequence", false, `prospect:${prospectId}:all-visible-sequenceStates`);
    else blockers.push("Unknown Outreach sequence state; review required");
    // Pagination completeness is not proof of unrestricted historical visibility or retention.
    // No false bounce/complaint clearance and no 'never contacted' assertion from empty results.
    add("outreachHistoryComplete", false, `prospect:${prospectId}:visible-api-history-only`);
    blockers.push(
      "Outreach historical coverage UNKNOWN: API-visible records do not prove full retention, all-user visibility or complete bounce/complaint history",
    );
    return { observations, blockers };
  }
}
