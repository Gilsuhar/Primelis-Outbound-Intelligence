import {
  recyclerInputSchema,
  type RecyclerInput,
  type RecyclerSystem,
} from "../../features/prospect-recycler/contracts";
import { evaluateQualifiedRecyclerBatch } from "../../features/prospect-recycler/qualification";
import { timestamp } from "../../features/prospect-recycler/calendar";
import { IntegrationError } from "../integrations/http";
import { assertId, emptySnapshot, issue } from "./shared";
import {
  EMAIL_SCOPE,
  normalizeEmail,
  recordKey,
  type Reader,
  type Scan,
  type Prospect,
  type Snapshot,
  type ReadIssue,
  type SupplementalEvidence,
} from "./types";

const systems: RecyclerSystem[] = ["HUBSPOT", "OUTREACH"];
const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
export type IdentityGroup = {
  snapshots: Snapshot[];
  resolution: RecyclerInput["identity"]["resolution"];
  issues: ReadIssue[];
};

/** Explicit one-to-one CRM mapping + matching name/email/employer only. Never merge by email alone. */
export function matchIdentities(snapshots: Snapshot[]): IdentityGroup[] {
  const groups: IdentityGroup[] = snapshots.map((snapshot) => ({
    snapshots: [snapshot],
    resolution: "VERIFIED",
    issues: [],
  }));
  const claimed = new Map<string, number[]>();
  snapshots.forEach((s, index) => {
    if (s.prospect.record.system === "HUBSPOT" && s.prospect.mappedOutreachId) {
      const ids = claimed.get(s.prospect.mappedOutreachId) ?? [];
      ids.push(index);
      claimed.set(s.prospect.mappedOutreachId, ids);
    }
    if (
      !s.prospect.email ||
      !s.prospect.employerDomain ||
      s.issues.some((i) => i.code === "INVALID_IDENTITY_MAPPING" || i.resource === "prospect-read")
    )
      groups[index].resolution = "UNRESOLVED";
  });
  const removed = new Set<number>();
  for (const [id, indexes] of claimed) {
    const targets = snapshots
      .map((s, i) =>
        s.prospect.record.system === "OUTREACH" && s.prospect.record.id === id ? i : -1,
      )
      .filter((i) => i >= 0);
    const involved = [...indexes, ...targets];
    if (indexes.length !== 1 || targets.length !== 1) {
      for (const index of involved) {
        groups[index].resolution = "AMBIGUOUS";
        groups[index].issues.push({ code: "IDENTITY_MAPPING_AMBIGUOUS", resource: "identity" });
      }
      continue;
    }
    const left = groups[indexes[0]],
      right = groups[targets[0]],
      a = left.snapshots[0].prospect,
      b = right.snapshots[0].prospect;
    if (
      !a.email ||
      a.email !== b.email ||
      !a.employerDomain ||
      a.employerDomain !== b.employerDomain ||
      !nameKey(a.fullName) ||
      nameKey(a.fullName) !== nameKey(b.fullName) ||
      left.resolution !== "VERIFIED" ||
      right.resolution !== "VERIFIED"
    ) {
      for (const index of involved) {
        groups[index].resolution = "AMBIGUOUS";
        groups[index].issues.push({ code: "IDENTITY_MAPPING_CONFLICT", resource: "identity" });
      }
      continue;
    }
    left.snapshots.push(...right.snapshots);
    removed.add(targets[0]);
  }
  const result = groups.filter((_, i) => !removed.has(i));
  const keys = new Map<string, Set<number>>();
  result.forEach((g, i) => {
    for (const s of g.snapshots)
      for (const k of [
        recordKey(s.prospect.record),
        ...s.prospect.emails.map((e) => `email:${normalizeEmail(e)}`),
      ]) {
        const entries = keys.get(k) ?? new Set<number>();
        entries.add(i);
        keys.set(k, entries);
      }
  });
  for (const entries of keys.values())
    if (entries.size > 1)
      for (const i of entries) {
        result[i].resolution = "AMBIGUOUS";
        if (!result[i].issues.some((p) => p.code === "IDENTITY_OVERLAP"))
          result[i].issues.push({ code: "IDENTITY_OVERLAP", resource: "identity" });
      }
  return result;
}

function sameIds(a: string[], b: string[]) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}
/** Transform visible facts; only separately trusted, identity-bound receipts can improve authority. */
export function toRecyclerInput(
  group: IdentityGroup,
  asOf: string,
  evidence: SupplementalEvidence = {},
): RecyclerInput {
  const records = group.snapshots.map((s) => s.prospect.record),
    first = group.snapshots[0].prospect;
  const historyProofs = recyclerInputSchema.shape.history.parse(evidence.history ?? []);
  const suppressionProofs = recyclerInputSchema.shape.suppressions.parse(
    evidence.suppressions ?? [],
  );
  const sequenceProofs = recyclerInputSchema.shape.sequences.parse(evidence.sequences ?? []);
  const input: RecyclerInput = {
    candidateId: records.map(recordKey).sort().join("+"),
    identity: {
      resolution: group.resolution,
      records,
      ...(first.email ? { email: first.email } : {}),
      ...(first.employerDomain ? { employerDomain: first.employerDomain } : {}),
    },
    scope: EMAIL_SCOPE,
    communications: group.snapshots.flatMap((s) => s.communications),
    history: [],
    suppressions: [],
    sequences: [],
    ...(evidence.emailVerification ? { emailVerification: evidence.emailVerification } : {}),
    ...(evidence.employmentVerification
      ? { employmentVerification: evidence.employmentVerification }
      : {}),
  };
  for (const system of systems) {
    const snapshot = group.snapshots.find((s) => s.prospect.record.system === system);
    const expectedIds = records.filter((r) => r.system === system).map((r) => r.id);
    const base = {
      status: "UNKNOWN" as const,
      recordIds: expectedIds,
      authoritative: false,
      checkedAt: asOf,
    };
    const matchingProofs = historyProofs.filter(
      (p) => p.system === system && sameIds(p.recordIds, expectedIds),
    );
    const proof = (matchingProofs.length === 1 ? matchingProofs : []).find(
      (p) =>
        p.system === system &&
        sameIds(p.recordIds, expectedIds) &&
        p.authoritative &&
        p.status === (snapshot ? "COMPLETE" : "NOT_PRESENT") &&
        p.allUsers &&
        p.retentionComplete &&
        p.scopeId === EMAIL_SCOPE.id &&
        p.channels.includes("EMAIL") &&
        timestamp(p.through)! >= timestamp(asOf)! &&
        timestamp(p.checkedAt)! <= timestamp(asOf)! &&
        (!snapshot || snapshot.historyTraversal === "COMPLETE"),
    );
    input.history.push(
      proof ??
        snapshot?.history ?? {
          ...base,
          system,
          evidenceId: `${system}:identity-not-looked-up`,
          scopeId: EMAIL_SCOPE.id,
          channels: ["EMAIL"],
          from: asOf,
          through: asOf,
          allUsers: false,
          retentionComplete: false,
        },
    );
    const suppression = snapshot?.suppression ?? {
      ...base,
      source: system,
      evidenceId: `${system}:suppression-unknown`,
      unsubscribed: null,
      complained: null,
      hardBounced: null,
      doNotContact: null,
    };
    const receipts = suppressionProofs.filter(
      (p) => p.source === system && sameIds(p.recordIds, expectedIds),
    );
    // Preserve positive observations with their original provenance, rather than relabeling them as a receipt.
    if (receipts.length) {
      input.suppressions.push(...receipts);
      if (
        (["unsubscribed", "complained", "hardBounced", "doNotContact"] as const).some(
          (flag) => suppression[flag] === true,
        )
      )
        input.suppressions.push(suppression);
    } else input.suppressions.push(suppression);
    const sequences = snapshot?.sequences ?? {
      ...base,
      system,
      evidenceId: `${system}:sequence-unknown`,
      states: [],
    };
    const checks = sequenceProofs.filter(
      (p) => p.system === system && sameIds(p.recordIds, expectedIds),
    );
    if (checks.length) {
      input.sequences.push(...checks);
      if (
        sequences.states.some(
          (s) => !["finished", "replied"].includes(s.state.trim().toLowerCase()),
        )
      )
        input.sequences.push(sequences);
    } else input.sequences.push(sequences);
  }
  const local = suppressionProofs.filter(
    (p) => p.source === "LOCAL" && sameIds(p.recordIds, records.map(recordKey)),
  );
  input.suppressions.push(
    ...(local.length
      ? local
      : [
          {
            source: "LOCAL" as const,
            status: "UNKNOWN" as const,
            recordIds: records.map(recordKey),
            checkedAt: asOf,
            authoritative: false,
            evidenceId: "local-suppression-not-checked",
            unsubscribed: null,
            complained: null,
            hardBounced: null,
            doNotContact: null,
          },
        ]),
  );
  return recyclerInputSchema.parse(input);
}

export async function collectRecycler(options: {
  readers: Partial<Record<RecyclerSystem, Reader>>;
  asOf: string;
  limitPerProvider?: number;
  ids?: Partial<Record<RecyclerSystem, string[]>>;
  /** Server-owned receipts keyed by the exact sorted record-key candidate ID. No verification calls. */
  evidence?: Record<string, SupplementalEvidence>;
}) {
  const limit = options.limitPerProvider ?? 5;
  if (timestamp(options.asOf) === null || !Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new IntegrationError("CONFIGURATION");
  const discovery: Partial<Record<RecyclerSystem, Scan<Prospect>>> = {};
  const snapshots: Snapshot[] = [],
    issues: ReadIssue[] = [];
  for (const system of systems) {
    const reader = options.readers[system];
    if (!reader) {
      discovery[system] = {
        items: [],
        pages: 0,
        status: "UNKNOWN",
        issues: [{ code: "NOT_CONFIGURED", resource: system }],
      };
      continue;
    }
    if (reader.system !== system) throw new IntegrationError("CONFIGURATION");
    const selected = options.ids?.[system];
    if (
      selected &&
      (selected.length > limit || selected.some((id) => !/^[A-Za-z0-9_-]{1,100}$/.test(id)))
    )
      throw new IntegrationError("CONFIGURATION");
    try {
      discovery[system] = selected
        ? {
            status: "PARTIAL",
            pages: 0,
            issues: [],
            items: [...new Set(selected)].map((id) => ({
              record: { system, id },
              fullName: "",
              emails: [],
            })),
          }
        : await reader.discover(limit);
    } catch (error) {
      discovery[system] = {
        items: [],
        status: "UNKNOWN",
        pages: 0,
        issues: [issue(error, system)],
      };
    }
    if (discovery[system]!.items.length > limit) throw new IntegrationError("INVALID_RESPONSE");
    for (const prospect of discovery[system]!.items) {
      try {
        const snapshot = await reader.collect(prospect.record.id);
        if (recordKey(snapshot.prospect.record) !== recordKey(prospect.record))
          throw new IntegrationError("INVALID_RESPONSE");
        snapshots.push(snapshot);
      } catch (error) {
        const snapshot = emptySnapshot(prospect, options.asOf);
        snapshot.issues.push(issue(error, "prospect-read"));
        snapshots.push(snapshot);
      }
    }
  }
  // Hydrate explicit mapped IDs outside the bounded Outreach discovery page; never search by unverified email.
  const outreach = options.readers.OUTREACH;
  const mapped = [
    ...new Set(
      snapshots.flatMap((s) => (s.prospect.mappedOutreachId ? [s.prospect.mappedOutreachId] : [])),
    ),
  ];
  for (const id of mapped)
    if (
      outreach &&
      !snapshots.some((s) => s.prospect.record.system === "OUTREACH" && s.prospect.record.id === id)
    ) {
      try {
        const snapshot = await outreach.collect(assertId(id));
        if (snapshot.prospect.record.system !== "OUTREACH" || snapshot.prospect.record.id !== id)
          throw new IntegrationError("INVALID_RESPONSE");
        snapshots.push(snapshot);
      } catch (error) {
        issues.push(issue(error, "mapped-outreach-read"));
      }
    }
  const groups = matchIdentities(snapshots);
  const inputs = groups.map((group) => {
    const candidateId = group.snapshots
      .map((s) => recordKey(s.prospect.record))
      .sort()
      .join("+");
    try {
      return toRecyclerInput(group, options.asOf, options.evidence?.[candidateId]);
    } catch {
      group.issues.push({ code: "INVALID_SUPPLEMENTAL_EVIDENCE", resource: "evidence" });
      return toRecyclerInput({ ...group, resolution: "UNRESOLVED" }, options.asOf);
    }
  });
  return {
    discovery,
    candidates: inputs.map((input, i) => ({
      input,
      displayName: groups[i].snapshots[0].prospect.fullName,
      historyTraversal: groups[i].snapshots.map((s) => ({
        record: s.prospect.record,
        status: s.historyTraversal,
      })),
      issues: [...groups[i].issues, ...groups[i].snapshots.flatMap((s) => s.issues)],
    })),
    decisions: evaluateQualifiedRecyclerBatch(inputs, Object.fromEntries(
      Object.entries(options.evidence ?? {}).map(([id, proof]) => [id, proof.qualification]),
    ), options.asOf),
    issues,
  };
}
