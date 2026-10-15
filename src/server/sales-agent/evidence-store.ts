import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { draftResearchSchema } from "@/features/sales-agent/draft-engine";

import type {
  EvidenceObservation,
  EvidenceProvenance,
  IntakeContact,
} from "@/features/sales-agent/evidence";
import { mergeDefaultSuppressionRecords } from "@/features/do-not-contact/do-not-contact-policy";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import type { MinimalPrismaClient } from "@/lib/prisma";
import type { ProviderStatus } from "./providers";

import type { DraftResearch } from "@/features/sales-agent/draft-engine";

export type EvidenceSnapshot = {
  research?: DraftResearch[];
  version: 1;
  contact: IntakeContact;
  observations: EvidenceObservation[];
  provenanceAtCollection: EvidenceProvenance[];
  blockers: string[];
  providers: ProviderStatus[];
  collectedAt: string;
};
export interface EvidenceStore {
  save(actorId: string, snapshots: EvidenceSnapshot[]): Promise<void>;
  list(actorId: string): Promise<unknown[]>;
  suppressionRecords(): Promise<DoNotContactRecord[]>;
  edit(
    actorId: string,
    contactId: string,
    update: (current: unknown) => EvidenceSnapshot | null,
  ): Promise<boolean>;
}
const label = (id: string) => `signal-evidence-v1:${id}`;

/** Existing user-scoped ProspectSource records hold versioned JSON evidence; no schema migration. */
export class PrismaEvidenceStore implements EvidenceStore {
  constructor(private readonly client?: MinimalPrismaClient) {}
  private async db() {
    if (this.client) return this.client;
    if (!process.env.DATABASE_URL) throw new Error("Evidence persistence requires DATABASE_URL");
    return (await import("@/lib/prisma")).prisma;
  }
  private async append(tx: MinimalPrismaClient, actorId: string, snapshot: EvidenceSnapshot) {
    const contact = snapshot.contact;
    const sourceLabel = label(contact.hubspotRecordId);
    const existing = await tx.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Prospect" p JOIN "ProspectSource" s ON s."prospectId" = p.id
      WHERE p."userId" = ${actorId} AND s."sourceLabel" = ${sourceLabel} LIMIT 1
    `;
    const prospectId = existing[0]?.id ?? randomUUID();
    if (!existing.length) {
      await tx.$executeRaw`
        INSERT INTO "Prospect" (id, "userId", "fullName", email, "companyName", "companyDomain", "updatedAt")
        VALUES (${prospectId}, ${actorId}, ${contact.fullName}, ${contact.email ?? null}, ${contact.companyName ?? null}, ${contact.companyDomain ?? null}, NOW())
      `;
    }
    await tx.$executeRaw`
      INSERT INTO "ProspectSource" (id, "prospectId", type, "rawContent", "sourceLabel", "createdAt")
      VALUES (${randomUUID()}, ${prospectId}, 'ACCOUNT_RESEARCH', ${JSON.stringify(snapshot)}, ${sourceLabel}, clock_timestamp())
    `;
  }
  async save(actorId: string, snapshots: EvidenceSnapshot[]) {
    const client = await this.db();
    await client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`sales-agent:${actorId}`}, 0))`;
        // Retain only schema-validated research bound to the same contact and current company.
        const previous = await new PrismaEvidenceStore(tx).list(actorId);
        const research = z.object({
          contact: z.object({ hubspotRecordId: z.string() }),
          research: z.array(draftResearchSchema).optional(),
        });
        const entries = previous.flatMap((raw) => {
          const parsed = research.safeParse(raw);
          return parsed.success
            ? (parsed.data.research ?? []).filter(
                (entry) => entry.contactId === parsed.data.contact.hubspotRecordId,
              )
            : [];
        });
        for (const snapshot of snapshots) {
          await this.append(tx, actorId, {
            ...snapshot,
            research:
              snapshot.research ??
              entries.filter(
                (entry) =>
                  entry.contactId === snapshot.contact.hubspotRecordId &&
                  entry.companyDomain.toLowerCase() ===
                    snapshot.contact.companyDomain?.toLowerCase(),
              ),
          });
        }
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }
  /** Read/modify/append under the same actor lock as collection; never restore stale provider evidence. */
  async edit(
    actorId: string,
    contactId: string,
    update: (current: unknown) => EvidenceSnapshot | null,
  ) {
    const client = await this.db();
    return client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`sales-agent:${actorId}`}, 0))`;
        const current = (await new PrismaEvidenceStore(tx).list(actorId)).find(
          (raw) =>
            typeof raw === "object" &&
            raw !== null &&
            "contact" in raw &&
            (raw as { contact?: { hubspotRecordId?: string } }).contact?.hubspotRecordId ===
              contactId,
        );
        if (!current) return false;
        const updated = update(current);
        if (!updated) return false;
        if (updated.contact.hubspotRecordId !== contactId)
          throw new Error("Contact identity cannot be changed by research");
        await this.append(tx, actorId, updated);
        return true;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }
  async list(actorId: string) {
    const rows = await (
      await this.db()
    ).$queryRaw<{ rawContent: string }[]>`
      SELECT DISTINCT ON (s."sourceLabel") s."rawContent"
      FROM "ProspectSource" s JOIN "Prospect" p ON p.id = s."prospectId"
      WHERE p."userId" = ${actorId} AND s."sourceLabel" LIKE 'signal-evidence-v1:%'
      ORDER BY s."sourceLabel", s."createdAt" DESC, s.id DESC
    `;
    // Snapshot shape is validated by the collection service before use.
    return rows.map((row): unknown => {
      try {
        return JSON.parse(row.rawContent) as unknown;
      } catch {
        return null;
      }
    });
  }
  async suppressionRecords() {
    const rows = await (
      await this.db()
    ).$queryRaw<DoNotContactRecord[]>`
      SELECT id, "companyName", domain, status, reason FROM "SuppressionRecord"
    `;
    return mergeDefaultSuppressionRecords(rows);
  }
}
