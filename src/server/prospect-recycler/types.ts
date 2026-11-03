import type { RecyclerInput, RecyclerSystem } from "../../features/prospect-recycler/contracts";
import type { QualificationEvidence } from "../../features/prospect-recycler/qualification";

export type Coverage = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type ReadIssue = { code: string; resource: string };
/** COMPLETE here means pagination completed, NOT unrestricted historical coverage. */
export type Scan<T> = {
  items: T[];
  status: Coverage;
  pages: number;
  issues: ReadIssue[];
  next?: string;
};
export type Prospect = {
  record: { system: RecyclerSystem; id: string };
  fullName: string;
  emails: string[];
  email?: string;
  employerDomain?: string;
  mappedOutreachId?: string;
  profile?: {
    source: RecyclerSystem;
    observedAt: string;
    ownerId: string | null;
    title: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    assignedAt?: string | null;
    company?: { id: string; name: string | null; employees: number | null; annualRevenue: number | null; currency: "UNKNOWN" };
  };
};
export type Snapshot = {
  prospect: Prospect;
  communications: RecyclerInput["communications"];
  history: RecyclerInput["history"][number];
  suppression: RecyclerInput["suppressions"][number];
  sequences: RecyclerInput["sequences"][number];
  historyTraversal: Coverage;
  issues: ReadIssue[];
  engagement?: { id: string; kind: "OPEN" | "REPLY"; at: string; source: "OUTREACH" }[];
};
export interface Reader {
  system: RecyclerSystem;
  discover(limit: number): Promise<Scan<Prospect>>;
  collect(id: string): Promise<Snapshot>;
}
export interface ReadClient {
  read(path: string, body?: unknown): Promise<unknown>;
}
export const EMAIL_SCOPE = {
  id: "recycler-all-outbound-email-v1",
  channels: ["EMAIL"] as ["EMAIL"],
};
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const normalizeDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
export const recordKey = (record: Prospect["record"]) => JSON.stringify([record.system, record.id]);

/** Receipts must come from trusted server-side evidence, never browser flags or API page counts. */
export type SupplementalEvidence = {
  qualification?: QualificationEvidence;
  history?: RecyclerInput["history"];
  suppressions?: RecyclerInput["suppressions"];
  sequences?: RecyclerInput["sequences"];
  emailVerification?: RecyclerInput["emailVerification"];
  employmentVerification?: RecyclerInput["employmentVerification"];
};
