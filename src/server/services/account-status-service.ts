import { z } from "zod";

import type {
  AccountStatusResult,
  AccountStatusSeverity,
  AccountStatusState,
} from "@/features/account-status/types";
import {
  mergeDefaultSuppressionRecords,
  searchDoNotContactRecords,
} from "@/features/do-not-contact/do-not-contact-policy";
import type { DoNotContactRecord, SuppressionStatus } from "@/features/do-not-contact/types";
import { normalizeDomain } from "@/features/connected-research/url-safety";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { err, ok } from "./result";

const accountStatusSchema = z.object({
  companyName: z.string().trim().max(180).optional(),
  companyDomain: z.string().trim().max(240).optional(),
  internalAccountId: z.string().trim().max(160).optional(),
  overrideRequested: z.boolean().optional().default(false),
  creatorId: z.string().trim().min(1).optional(),
});

type Row = Record<string, unknown>;

export type AccountStatusInput = z.infer<typeof accountStatusSchema>;

export type AccountStatusPersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  getSuppressionRecords(): Promise<DoNotContactRecord[]>;
  getRecentDrafts(): Promise<
    Array<{
      id: string;
      workflow: string;
      companyName?: string;
      companyDomain?: string;
      createdAt?: string;
    }>
  >;
  getRecentAssessments(): Promise<
    Array<{
      id: string;
      companyName: string;
      domain?: string;
      qualificationResult: string;
      recommendedNextAction?: string;
      createdAt?: string;
    }>
  >;
};

export type AccountStatusDependencies = {
  persistence?: AccountStatusPersistence;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeName(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|group|company|co|corp|corporation|sa|sas|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomainInput(value?: string) {
  if (!value?.trim()) return undefined;
  const cleaned = value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
  return cleaned.includes(".") ? normalizeDomain(cleaned) : undefined;
}

function aliasesFor(record: DoNotContactRecord) {
  const text = [record.notes, record.reason].filter(Boolean).join(" ");
  const aliasMatch = text.match(/aliases?\s*:\s*([^.;]+)/i);
  if (!aliasMatch) return [];
  return aliasMatch[1]
    .split(/[,/|]/)
    .map((alias) => normalizeName(alias))
    .filter(Boolean);
}

function statusState(status: SuppressionStatus): AccountStatusState {
  if (status === "EXISTING_CUSTOMER" || status === "PARTNER") return "EXISTING_CLIENT";
  if (status === "ACTIVE_OPPORTUNITY") return "ACTIVE_OPPORTUNITY";
  if (status === "RECENTLY_CONTACTED" || status === "OWNED_BY_ANOTHER_REP") {
    return "RECENT_OUTREACH";
  }
  return "SUPPRESSED";
}

function statusSeverity(state: AccountStatusState): AccountStatusSeverity {
  if (state === "EXISTING_CLIENT" || state === "SUPPRESSED") return "BLOCKED";
  if (state === "ACTIVE_OPPORTUNITY" || state === "RECENT_OUTREACH") return "WARNING";
  if (state === "CLEAR_TO_PROCEED") return "CLEAR";
  return "UNKNOWN";
}

function canOverrideState(state: AccountStatusState, role: string) {
  if (state === "RECENT_OUTREACH") {
    return role === "SALES_USER" || role === "KNOWLEDGE_ADMIN";
  }
  return role === "KNOWLEDGE_ADMIN" && state === "ACTIVE_OPPORTUNITY";
}

function titleFor(state: AccountStatusState) {
  const titles: Record<AccountStatusState, string> = {
    EXISTING_CLIENT: "Existing Primelis client",
    ACTIVE_OPPORTUNITY: "Active opportunity already in progress",
    SUPPRESSED: "Do not contact this account",
    RECENT_OUTREACH: "Recent outreach or ownership detected",
    CLEAR_TO_PROCEED: "No restricted account found",
    UNKNOWN: "Status could not be fully verified",
  };
  return titles[state];
}

function messageFor(state: AccountStatusState) {
  if (state === "EXISTING_CLIENT") {
    return "This company is already marked as a Primelis client. Normal prospecting should not continue.";
  }
  if (state === "ACTIVE_OPPORTUNITY") {
    return "This account is already in an active sales process. Continue only with an approved override.";
  }
  if (state === "SUPPRESSED") {
    return "This account is in the suppression list and must not be contacted.";
  }
  if (state === "RECENT_OUTREACH") {
    return "This company appears to have ownership or recent outreach activity. Check the existing activity before creating a new touch.";
  }
  if (state === "CLEAR_TO_PROCEED") {
    return "No matching client, active opportunity, suppression, or recent outreach record was found in available internal data.";
  }
  return "Available internal data was not enough to verify this account. Treat this as unverified, not safe.";
}

function resultFromSuppression(record: DoNotContactRecord, matchedOn: AccountStatusResult["matchedOn"], role: string): AccountStatusResult {
  const state = statusState(record.status);
  const severity = statusSeverity(state);
  const canOverride = canOverrideState(state, role);
  return {
    state,
    severity,
    title: titleFor(state),
    message: messageFor(state),
    companyName: record.companyName,
    domain: record.domain,
    owner: record.owner,
    reason: record.reason,
    stage: record.status.replaceAll("_", " ").toLowerCase(),
    lastActivity: record.lastContactDate,
    matchedRecordId: record.id,
    matchedOn,
    source: "SUPPRESSION_RECORD",
    canOverride,
    requiresOverride: severity === "WARNING",
    verified: true,
    nextActions: [
      { label: "Select another company", action: "CHANGE_ACCOUNT" },
      ...(canOverride ? [{ label: "Continue with override", action: "OVERRIDE" as const }] : []),
      { label: "Open Do Not Contact", href: "/do-not-contact" },
    ],
  };
}

function matchSuppressionRecord(
  records: DoNotContactRecord[],
  input: { companyName?: string; companyDomain?: string },
) {
  const normalizedInputName = normalizeName(input.companyName);
  const normalizedInputDomain = normalizeDomainInput(input.companyDomain);
  for (const record of records) {
    const recordDomain = normalizeDomainInput(record.domain);
    if (normalizedInputDomain && recordDomain && normalizedInputDomain === recordDomain) {
      return { record, matchedOn: "DOMAIN" as const };
    }
  }
  if (normalizedInputName) {
    for (const record of records) {
      const recordName = normalizeName(record.companyName);
      if (
        recordName &&
        (recordName === normalizedInputName ||
          recordName.includes(normalizedInputName) ||
          normalizedInputName.includes(recordName))
      ) {
        return { record, matchedOn: "NAME" as const };
      }
      if (aliasesFor(record).includes(normalizedInputName)) {
        return { record, matchedOn: "ALIAS" as const };
      }
    }
  }
  const looseQuery = normalizedInputDomain ?? normalizedInputName;
  if (looseQuery) {
    const loose = searchDoNotContactRecords(records, looseQuery)[0];
    if (loose) return { record: loose.record, matchedOn: "NAME" as const };
  }
  return undefined;
}

export class PrismaAccountStatusPersistence implements AccountStatusPersistence {
  constructor(private readonly client: MinimalPrismaClient = prisma) {}

  async getActor(actorId: string) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, role
      FROM "User"
      WHERE id = ${actorId}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? { id: asString(row.id), role: asString(row.role) } : null;
  }

  async getSuppressionRecords() {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "companyName", domain, status, "accountOwner", reason, notes, "lastContactDate"::text AS "lastContactDate"
      FROM "SuppressionRecord"
    `;
    return mergeDefaultSuppressionRecords(
      rows.map((row) => ({
        id: asString(row.id),
        companyName: asString(row.companyName),
        domain: asOptionalString(row.domain),
        status: asString(row.status) as DoNotContactRecord["status"],
        owner: asOptionalString(row.accountOwner),
        reason: asOptionalString(row.reason),
        notes: asOptionalString(row.notes),
        lastContactDate: asOptionalString(row.lastContactDate),
      })),
    );
  }

  async getRecentDrafts() {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, workflow, "inputSnapshot", "createdAt"::text AS "createdAt"
      FROM "GeneratedDraft"
      WHERE "createdAt" >= NOW() - INTERVAL '45 days'
      ORDER BY "createdAt" DESC
      LIMIT 200
    `;
    return rows.map((row) => {
      const snapshot = row.inputSnapshot && typeof row.inputSnapshot === "object"
        ? (row.inputSnapshot as Record<string, unknown>)
        : {};
      return {
        id: asString(row.id),
        workflow: asString(row.workflow),
        companyName: asOptionalString(snapshot.companyName),
        companyDomain: asOptionalString(snapshot.companyWebsite ?? snapshot.companyDomain),
        createdAt: asOptionalString(row.createdAt),
      };
    });
  }

  async getRecentAssessments() {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "companyName", domain, "qualificationResult", "recommendedNextAction", "createdAt"::text AS "createdAt"
      FROM "AccountAssessment"
      ORDER BY "createdAt" DESC
      LIMIT 200
    `;
    return rows.map((row) => ({
      id: asString(row.id),
      companyName: asString(row.companyName),
      domain: asOptionalString(row.domain),
      qualificationResult: asString(row.qualificationResult),
      recommendedNextAction: asOptionalString(row.recommendedNextAction),
      createdAt: asOptionalString(row.createdAt),
    }));
  }
}

function matchesIdentity(
  record: { companyName?: string; companyDomain?: string; domain?: string },
  input: { companyName?: string; companyDomain?: string },
) {
  const inputDomain = normalizeDomainInput(input.companyDomain);
  const recordDomain = normalizeDomainInput(record.companyDomain ?? record.domain);
  if (inputDomain && recordDomain && inputDomain === recordDomain) return true;
  const inputName = normalizeName(input.companyName);
  const recordName = normalizeName(record.companyName);
  return Boolean(inputName && recordName && (inputName === recordName || recordName.includes(inputName) || inputName.includes(recordName)));
}

export async function checkAccountStatus(
  rawInput: unknown,
  dependencies: AccountStatusDependencies = {},
) {
  const parsed = accountStatusSchema.safeParse(rawInput);
  if (!parsed.success) return err("VALIDATION_ERROR", "Account status input is malformed.");
  const creatorId = parsed.data.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaAccountStatusPersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || !["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role)) {
    return err("FORBIDDEN", "Only authorized users can check account status.");
  }

  const input = parsed.data;
  if (!input.companyName?.trim() && !input.companyDomain?.trim() && !input.internalAccountId?.trim()) {
    return ok<AccountStatusResult>({
      state: "UNKNOWN",
      severity: "UNKNOWN",
      title: titleFor("UNKNOWN"),
      message: messageFor("UNKNOWN"),
      matchedOn: "NONE",
      source: "AVAILABLE_DATA",
      canOverride: false,
      requiresOverride: false,
      verified: false,
      nextActions: [],
    });
  }

  const suppressionRecords = await persistence.getSuppressionRecords();
  const suppressionMatch = matchSuppressionRecord(suppressionRecords, input);
  if (suppressionMatch) {
    return ok(resultFromSuppression(suppressionMatch.record, suppressionMatch.matchedOn, actor.role));
  }

  const recentDraft = (await persistence.getRecentDrafts()).find((draft) =>
    matchesIdentity(draft, input),
  );
  if (recentDraft) {
    return ok<AccountStatusResult>({
      state: "RECENT_OUTREACH",
      severity: "WARNING",
      title: titleFor("RECENT_OUTREACH"),
      message: messageFor("RECENT_OUTREACH"),
      companyName: recentDraft.companyName ?? input.companyName,
      domain: recentDraft.companyDomain ?? input.companyDomain,
      stage: recentDraft.workflow,
      lastActivity: recentDraft.createdAt,
      matchedRecordId: recentDraft.id,
      matchedOn: recentDraft.companyDomain ? "DOMAIN" : "NAME",
      source: "GENERATED_DRAFT",
      canOverride: canOverrideState("RECENT_OUTREACH", actor.role),
      requiresOverride: true,
      verified: true,
      nextActions: [
        { label: "Open existing activity", href: "/knowledge-library" },
        ...(canOverrideState("RECENT_OUTREACH", actor.role)
          ? [{ label: "Continue with override", action: "OVERRIDE" as const }]
          : []),
      ],
    });
  }

  const assessment = (await persistence.getRecentAssessments()).find((item) =>
    matchesIdentity(item, input),
  );
  if (assessment) {
    return ok<AccountStatusResult>({
      state: "CLEAR_TO_PROCEED",
      severity: "CLEAR",
      title: "Prior qualification found",
      message: `Existing qualification context is available: ${assessment.qualificationResult}. Use it to avoid re-entering facts.`,
      companyName: assessment.companyName,
      domain: assessment.domain,
      stage: assessment.qualificationResult,
      lastActivity: assessment.createdAt,
      matchedRecordId: assessment.id,
      matchedOn: assessment.domain ? "DOMAIN" : "NAME",
      source: "ACCOUNT_ASSESSMENT",
      canOverride: false,
      requiresOverride: false,
      verified: false,
      nextActions: [
        { label: "Use this qualification in outreach", href: "/create-outreach" },
        { label: "Build a sequence for this account", href: "/build-sequence" },
      ],
    });
  }

  return ok<AccountStatusResult>({
    state: "CLEAR_TO_PROCEED",
    severity: "CLEAR",
    title: titleFor("CLEAR_TO_PROCEED"),
    message: messageFor("CLEAR_TO_PROCEED"),
    companyName: input.companyName,
    domain: normalizeDomainInput(input.companyDomain),
    matchedOn: "NONE",
    source: "AVAILABLE_DATA",
    canOverride: false,
    requiresOverride: false,
    verified: false,
    nextActions: [
      { label: "Qualify this account", href: "/account-research" },
      { label: "Build a sequence", href: "/build-sequence" },
    ],
  });
}

export async function assertAccountCanGenerate(
  rawInput: unknown,
  dependencies: AccountStatusDependencies = {},
) {
  const checked = await checkAccountStatus(rawInput, dependencies);
  if (!checked.ok) return checked;
  const status = checked.data;
  if (status.severity === "BLOCKED") {
    return err("ACCOUNT_STATUS_BLOCKED", status.message);
  }
  const parsed = accountStatusSchema.safeParse(rawInput);
  const overrideRequested = parsed.success ? parsed.data.overrideRequested : false;
  if (status.requiresOverride && !(overrideRequested && status.canOverride)) {
    return err("ACCOUNT_STATUS_OVERRIDE_REQUIRED", status.message);
  }
  return ok(status);
}
