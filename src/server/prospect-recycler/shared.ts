import { z } from "zod";
import { timestamp } from "../../features/prospect-recycler/calendar";
import { IntegrationError, nextReadPage } from "../integrations/http";
import {
  EMAIL_SCOPE,
  type ReadClient,
  type ReadIssue,
  type Scan,
  type Snapshot,
  type Prospect,
} from "./types";

export const idSchema = z
  .union([z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), z.number().int().nonnegative().safe()])
  .transform(String);
export const hubRecord = z.object({
  id: idSchema,
  properties: z.record(z.string().nullable()),
  archived: z.boolean().optional(),
});
export const resource = z.object({
  id: idSchema,
  type: z.string(),
  attributes: z.record(z.unknown()),
  relationships: z.record(z.object({ data: z.unknown().optional() }).passthrough()).optional(),
});
export type Resource = z.infer<typeof resource>;
export const hubPage = z.object({
  results: z.array(hubRecord),
  paging: z.object({ next: z.object({ after: idSchema }).optional() }).optional(),
});
export const outreachPage = z.object({
  data: z.array(resource),
  links: z.object({ next: z.string().nullable().optional() }).optional(),
});
export function related(item: Resource, name: string): string | undefined {
  const value = z.object({ id: idSchema }).safeParse(item.relationships?.[name]?.data);
  return value.success ? value.data.id : undefined;
}
export function issue(error: unknown, resource: string): ReadIssue {
  return { resource, code: error instanceof IntegrationError ? error.code : "INVALID_RESPONSE" };
}
export function assertId(id: string) {
  return idSchema.parse(id);
}
export function booleanFlag(value: unknown): boolean | null {
  return value === true || value === "true"
    ? true
    : value === false || value === "false"
      ? false
      : null;
}
export function eventTime(value: unknown): string | null {
  // HubSpot also documents Unix milliseconds; Outreach supplies ISO timestamps.
  if (typeof value === "string" && timestamp(value) !== null) return new Date(value).toISOString();
  if (typeof value === "string" && /^\d{13}$/.test(value)) {
    const normalized = new Date(Number(value)).toISOString();
    return timestamp(normalized) !== null ? normalized : null;
  }
  return null;
}
export function nextOutreach(path: string, next: string): string {
  const result = nextReadPage(path, next, "https://api.outreach.io");
  const old = new URL(path, "https://api.outreach.io"),
    target = new URL(result, old);
  for (const name of new Set([...old.searchParams.keys(), ...target.searchParams.keys()])) {
    if (
      !name.startsWith("page[") &&
      old.searchParams.getAll(name).join("\0") !== target.searchParams.getAll(name).join("\0")
    )
      throw new IntegrationError("INVALID_RESPONSE");
  }
  return result;
}
/** Bounded pagination preserves earlier evidence on failure and never calls a cap complete. */
export async function scan<T extends { id: string }>(
  initial: string,
  load: (cursor: string) => Promise<{ items: T[]; next?: string; paginationIssue?: ReadIssue }>,
  maxPages: number,
  maxItems: number,
): Promise<Scan<T>> {
  const result: Scan<T> = { items: [], status: "UNKNOWN", pages: 0, issues: [] };
  const visited = new Set<string>(),
    records = new Map<string, T>();
  let cursor: string | undefined = initial;
  while (cursor !== undefined) {
    if (visited.has(cursor) || result.pages >= maxPages) {
      result.issues.push({
        code: visited.has(cursor) ? "PAGINATION_LOOP" : "PAGE_LIMIT",
        resource: "pagination",
      });
      result.next = cursor;
      result.status = "PARTIAL";
      return result;
    }
    visited.add(cursor);
    try {
      const page = await load(cursor);
      result.pages++;
      for (const item of page.items) {
        const prior = records.get(item.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(item))
          throw new IntegrationError("INVALID_RESPONSE");
        if (!prior) {
          if (records.size >= maxItems) {
            result.status = "PARTIAL";
            result.next = cursor;
            result.issues.push({ code: "RECORD_LIMIT", resource: "pagination" });
            return result;
          }
          records.set(item.id, item);
          result.items.push(item);
        }
      }
      if (page.paginationIssue) {
        result.issues.push(page.paginationIssue);
        result.status = "PARTIAL";
        return result;
      }
      cursor = page.next;
      if (cursor !== undefined && records.size >= maxItems) {
        result.status = "PARTIAL";
        result.next = cursor;
        result.issues.push({ code: "RECORD_LIMIT", resource: "pagination" });
        return result;
      }
    } catch (error) {
      result.status = result.pages || result.items.length ? "PARTIAL" : "UNKNOWN";
      result.issues.push(issue(error, "pagination"));
      return result;
    }
  }
  result.status = "COMPLETE";
  return result;
}
export function emptySnapshot(prospect: Prospect, asOf: string): Snapshot {
  const system = prospect.record.system,
    id = prospect.record.id;
  const base = {
    status: "UNKNOWN" as const,
    recordIds: [id],
    checkedAt: asOf,
    authoritative: false,
  };
  return {
    prospect,
    communications: [],
    historyTraversal: "UNKNOWN",
    issues: [],
    history: {
      ...base,
      system,
      evidenceId: `${system}:${id}:history`,
      scopeId: EMAIL_SCOPE.id,
      channels: ["EMAIL"],
      from: asOf,
      through: asOf,
      allUsers: false,
      retentionComplete: false,
    },
    suppression: {
      ...base,
      source: system,
      evidenceId: `${system}:${id}:suppression`,
      unsubscribed: null,
      complained: null,
      hardBounced: null,
      doNotContact: null,
    },
    sequences: { ...base, system, evidenceId: `${system}:${id}:sequences`, states: [] },
  };
}
/** No API-visible-only reader can prove retention/all-user coverage by pagination alone. */
export function setHistory(snapshot: Snapshot, traversal: Scan<unknown>) {
  snapshot.historyTraversal = traversal.status;
  snapshot.history.status = traversal.status === "UNKNOWN" ? "UNKNOWN" : "PARTIAL";
  snapshot.issues.push(...traversal.issues, {
    code: "HISTORY_AUTHORITY_UNPROVEN",
    resource: "history",
  });
}
export function boundedClient(client: ReadClient, maxRequests: number): ReadClient {
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 500)
    throw new IntegrationError("CONFIGURATION");
  let count = 0;
  return {
    read: (path, body) => {
      if (++count > maxRequests) throw new IntegrationError("UNAVAILABLE");
      return client.read(path, body);
    },
  };
}
