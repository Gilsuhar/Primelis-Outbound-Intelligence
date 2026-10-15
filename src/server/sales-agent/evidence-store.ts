import "server-only";

import { randomUUID } from "node:crypto";

import type {
  EvidenceObservation,
  EvidenceProvenance,
  IntakeContact,
} from "@/features/sales-agent/evidence";
import { mergeDefaultSuppressionRecords } from "@/features/do-not-contact/do-not-contact-policy";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import type { MinimalPrismaClient } from "@/lib/prisma";
import type { ProviderStatus } from "./providers";

export type EvidenceSnapshot = {
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
  async save(actorId: string, snapshots: EvidenceSnapshot[]) {
    const client = await this.db();
    await client.$transaction(
      async (tx) => {
        // Serialize intake per application user so concurrent refreshes cannot create duplicate prospects.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`sales-agent:${actorId}`}, 0))`;
        for (const snapshot of snapshots) {
          const contact = snapshot.contact;
          const sourceLabel = label(contact.hubspotRecordId);
          const existing = await tx.$queryRaw<{ id: string }[]>`
          SELECT p.id FROM "Prospect" p JOIN "ProspectSource" s ON s."prospectId" = p.id
          WHERE p."userId" = ${actorId} AND s."sourceLabel" = ${sourceLabel}
          LIMIT 1
        `;
          const prospectId = existing[0]?.id ?? randomUUID();
          if (!existing.length) {
            await tx.$executeRaw`
            INSERT INTO "Prospect" (id, "userId", "fullName", email, "companyName", "companyDomain", "updatedAt")
            VALUES (${prospectId}, ${actorId}, ${contact.fullName}, ${contact.email ?? null}, ${contact.companyName ?? null}, ${contact.companyDomain ?? null}, NOW())
          `;
          }
          await tx.$executeRaw`
          INSERT INTO "ProspectSource" (id, "prospectId", type, "rawContent", "sourceLabel")
          VALUES (${randomUUID()}, ${prospectId}, 'ACCOUNT_RESEARCH', ${JSON.stringify(snapshot)}, ${sourceLabel})
        `;
        }
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
