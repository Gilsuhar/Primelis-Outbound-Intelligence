import type { RecyclerDecision, RecyclerInput } from "./contracts";
import type { QualificationEvidence } from "./qualification";

export type ReviewRow = {
  id: string;
  name: string;
  email: string | null;
  employerDomain: string | null;
  providers: string[];
  identity: RecyclerInput["identity"]["resolution"];
  hubspotId?: string | null;
  qualification?: QualificationEvidence;
  decision: RecyclerDecision;
  issues: { code: string; resource: string }[];
  history: RecyclerInput["history"];
  suppressions: RecyclerInput["suppressions"];
  sequences: RecyclerInput["sequences"];
  historyTraversal: { record: RecyclerInput["identity"]["records"][number]; status: string }[];
};
export type ReviewList = {
  mode: "DEMO" | "LIVE";
  evaluatedAt: string;
  rows: ReviewRow[];
  issues: { code: string; resource: string }[];
  discovery: { provider: string; status: string; count: number }[];
};
export function filterReviewRows(rows: ReviewRow[], query: string, status: string) {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => (status === "ALL" || row.decision.status === status) &&
    [row.name, row.email, row.employerDomain, row.hubspotId, row.qualification?.company?.name,
      row.qualification?.responsibility?.title, ...row.providers, ...row.decision.reasons.map(r => r.code + " " + r.message)]
      .some(value => value?.toLowerCase().includes(needle)));
}
export function reviewSections(list: ReviewList) {
  const rows = [...list.rows].sort((a, b) => {
    const left = a.decision.latestRelevantOutbound?.at;
    const right = b.decision.latestRelevantOutbound?.at;
    const delta = (left ? Date.parse(left) : Infinity) - (right ? Date.parse(right) : Infinity);
    return (Number.isNaN(delta) ? 0 : delta) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const needsVerification = (row: ReviewRow) =>
    row.decision.reasons.some((r) =>
      /^(EMAIL|EMPLOYMENT)_(VERIFICATION_|NOT_VERIFIED)/.test(r.code),
    );
  return {
    top50: rows.filter((r) => r.decision.status === "ELIGIBLE").slice(0, 50),
    needsVerification: rows.filter((r) => r.decision.status === "HOLD" && needsVerification(r)),
    otherHolds: rows.filter((r) => r.decision.status === "HOLD" && !needsVerification(r)),
    excluded: rows.filter((r) => r.decision.status === "EXCLUDED"),
    eligibleCount: rows.filter((r) => r.decision.status === "ELIGIBLE").length,
  };
}
export function reviewDate(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jerusalem",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Unknown";
}
function csvCell(value: string) {
  // Quote RFC 4180 fields and neutralize spreadsheet formula injection, including hidden prefixes.
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const safe = /^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function reviewCsv(list: ReviewList, scope: "REVIEW" | "TOP50") {
  const rows = scope === "TOP50" ? reviewSections(list).top50 : list.rows;
  const header = [
    "Mode",
    "Evaluated at (UTC)",
    "Name",
    "Email",
    "Employer domain",
    "Providers",
    "Identity",
    "Status",
    "Last observed outbound (UTC)",
    "Outbound event",
    "Outbound provider",
    "Cooldown anniversary (Asia/Jerusalem)",
    "Reasons",
    "Evidence gaps",
    "History coverage",
    "Suppression coverage",
    "Sequence coverage",
    "Evidence timestamps",
    "HubSpot record ID", "Company", "Current role", "Qualification receipts", "Draft readiness",
  ];
  return (
    [
      header,
      ...rows.map((row) => [
        list.mode,
        list.evaluatedAt,
        row.name,
        row.email ?? "",
        row.employerDomain ?? "",
        row.providers.join("; "),
        row.identity,
        row.decision.status,
        row.decision.latestRelevantOutbound?.at ?? "",
        row.decision.latestRelevantOutbound?.outcome ?? "",
        row.decision.latestRelevantOutbound?.record.system ?? "",
        row.decision.nextEligibleDate ?? "",
        row.decision.reasons.map((r) => r.code + ": " + r.message).join("; "),
        row.issues.map((i) => i.resource + ": " + i.code).join("; "),
        row.history
          .map((h) => h.system + ": " + h.status + ", authoritative=" + h.authoritative)
          .join("; "),
        row.suppressions
          .map((s) => s.source + ": " + s.status + ", authoritative=" + s.authoritative)
          .join("; "),
        row.sequences
          .map((s) => s.system + ": " + s.status + ", authoritative=" + s.authoritative)
          .join("; "),
        JSON.stringify(row.decision.evidenceTimestamps),
        row.hubspotId ?? "", row.qualification?.company?.name ?? "Unknown",
        row.qualification?.responsibility?.title ?? "Unknown", JSON.stringify(row.qualification ?? {}),
        row.decision.status === "ELIGIBLE" ? "Eligible for human draft review; not approved to send" : "Blocked by eligibility evidence",
      ]),
    ]
      .map((values) => values.map(csvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}
