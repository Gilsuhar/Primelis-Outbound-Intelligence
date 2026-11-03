"use client";
import { useState } from "react";
import { WorkflowPage, WorkflowCard } from "@/features/workflow/workflow-layout";
import { filterReviewRows, reviewCsv, reviewDate, reviewSections, type ReviewList, type ReviewRow } from "./review";

const button =
  "rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50";
const statusStyle = {
  ELIGIBLE: "bg-green-100 text-green-900",
  HOLD: "bg-amber-100 text-amber-900",
  EXCLUDED: "bg-red-100 text-red-900",
};
function Candidate({ row }: { row: ReviewRow }) {
  const last = row.decision.latestRelevantOutbound;
  return (
    <article className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{row.name}</h3>
          <p className="text-muted text-sm">
            {row.email ?? "Email unavailable"} · {row.employerDomain ?? "Employer unverified"}
          </p>
          <p className="text-muted text-xs">
            {row.providers.join(" + ")} · Identity: {row.identity}
          </p>
          <p className="text-sm">{row.qualification?.company?.name ?? "Company not verified"} · {row.qualification?.responsibility?.title ?? "Role not verified"}</p>
          <p className="text-muted text-xs">HubSpot ID: {row.hubspotId ?? "Not established"}</p>
        </div>
        <span
          className={"rounded-full px-3 py-1 text-xs font-bold " + statusStyle[row.decision.status]}
        >
          {row.decision.status}
        </span>
      </div>
      <p className="mt-3 text-sm">
        Last observed outbound: <strong>{reviewDate(last?.at)}</strong>
        {last
          ? " · " + last.record.system + " · " + last.outcome
          : " · No observed date; history may be incomplete."}
      </p>
      <p className="text-muted text-sm">
        Four-month cooldown anniversary: {row.decision.nextEligibleDate ?? "Unknown"}. This date
        alone does not establish eligibility.
      </p>
      <p className="mt-2 text-sm">Draft readiness: {row.decision.status === "ELIGIBLE" ? "Eligible for human draft review; not approved to send." : "Eligibility evidence must be resolved before outreach approval."}</p>
      <p className="text-muted text-xs">Screenshot recommendation: require a current SERP observation matching this employer and target brand; none attached to this review.</p>
      <details className="mt-3" open={row.decision.status !== "ELIGIBLE"}>
        <summary className="cursor-pointer text-sm font-semibold">
          Decision reasons and evidence gaps
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {row.decision.reasons.map((r, i) => (
            <li key={r.code + i}>{r.message}</li>
          ))}
          {row.issues.map((issue, i) => (
            <li key={issue.code + i}>
              {issue.resource}: {issue.code.replace(/_/g, " ").toLowerCase()}
            </li>
          ))}
        </ul>
      </details>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Evidence coverage and timestamps</summary>
        <ul className="mt-2 space-y-2">
          {row.history.map((h) => (
            <li key={h.system}>
              {h.system} history: {h.status}; authoritative: {h.authoritative ? "yes" : "no"}; all
              users: {h.allUsers ? "confirmed" : "unproven"}; retention:{" "}
              {h.retentionComplete ? "confirmed" : "unproven"}; checked {reviewDate(h.checkedAt)}.
            </li>
          ))}
          {row.historyTraversal.map((h) => (
            <li key={h.record.system + h.record.id}>
              {h.record.system} visible history traversal: {h.status}. Traversal completion does not
              prove historical coverage.
            </li>
          ))}
          {row.suppressions.map((s, i) => (
            <li key={s.source + i}>
              {s.source} suppression: {s.status}; authoritative: {s.authoritative ? "yes" : "no"};
              opt-out: {String(s.unsubscribed ?? "unknown")}; complaint:{" "}
              {String(s.complained ?? "unknown")}; hard bounce: {String(s.hardBounced ?? "unknown")}
              ; do not contact: {String(s.doNotContact ?? "unknown")}; checked{" "}
              {reviewDate(s.checkedAt)}.
            </li>
          ))}
          {row.sequences.map((s, i) => (
            <li key={s.system + i}>
              {s.system} sequences: {s.status}; authoritative: {s.authoritative ? "yes" : "no"};
              states: {s.states.map((v) => v.state).join(", ") || "none observed"}; checked{" "}
              {reviewDate(s.checkedAt)}.
            </li>
          ))}
          {row.decision.evidenceTimestamps
            .filter((e) => e.kind === "EMAIL" || e.kind === "EMPLOYMENT" || e.kind === "QUALIFICATION")
            .map((e, i) => (
              <li key={i}>
                {e.kind}: {e.source} · {e.evidenceId}; checked {reviewDate(e.checkedAt)}; expires {reviewDate(e.expiresAt)}.
              </li>
            ))}
        </ul>
      </details>
    </article>
  );
}
function Group({ title, rows, empty }: { title: string; rows: ReviewRow[]; empty: string }) {
  return (
    <WorkflowCard>
      <h2 className="mb-3 text-xl font-semibold text-ink">
        {title} ({rows.length})
      </h2>
      {rows.length ? (
        <div className="space-y-4">
          {rows.map((row) => (
            <Candidate key={row.id} row={row} />
          ))}
        </div>
      ) : (
        <p className="text-muted text-sm">{empty}</p>
      )}
    </WorkflowCard>
  );
}
export function RecyclerReview({
  initial,
  liveAvailable,
}: {
  initial: ReviewList;
  liveAvailable: boolean;
}) {
  const [list, setList] = useState(initial);
  const [source, setSource] = useState<"BOTH" | "HUBSPOT" | "OUTREACH">("BOTH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const sections = reviewSections(list);
  const visible = reviewSections({ ...list, rows: filterReviewRows(list.rows, query, status) });
  async function read() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/sales-agent/recycler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "READ_FIVE", source }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Read failed.");
      setList(result.data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Read failed. No automatic retry.");
    } finally {
      setBusy(false);
    }
  }
  function download(scope: "REVIEW" | "TOP50") {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + reviewCsv(list, scope)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "recycler-" + list.mode.toLowerCase() + "-" + scope.toLowerCase() + ".csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <WorkflowPage
      eyebrow="Prospect review"
      title="Daily Top 50"
      description="Review candidates from HubSpot and Outreach. Only candidates that pass every evidence check appear in the eligible Top 50."
    >
      <WorkflowCard>
        <p className="font-semibold">
          {list.mode === "DEMO"
            ? "Offline demonstration — five fictional candidates"
            : "Live read-only review — up to five provider records"}
        </p>
        <p className="text-muted mt-1 text-sm">
          Evaluated {reviewDate(list.evaluatedAt)} (Asia/Jerusalem). Manual review; daily automation
          and independent verification are not connected.
        </p>
        <p className="text-muted mt-1 text-sm">
          The eligible list is ordered by oldest observed outbound date. Unknown dates appear last.
          CSV exports describe this evaluation and do not authorize outreach.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm">
            Live source{" "}
            <select
              aria-label="Live source"
              className="ml-2 rounded border border-line p-2"
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
              disabled={busy || !liveAvailable}
            >
              <option value="BOTH">HubSpot + Outreach</option>
              <option value="HUBSPOT">HubSpot only</option>
              <option value="OUTREACH">Outreach only</option>
            </select>
          </label>
          <button className={button} onClick={read} disabled={busy || !liveAvailable}>
            {busy ? "Reading…" : "Read up to 5 live records"}
          </button>
          <button
            className={button}
            onClick={() => {
              setList(initial);
              setError(null);
            }}
            disabled={busy}
          >
            Show offline demo
          </button>
          <button className={button} onClick={() => download("REVIEW")} disabled={busy}>
            Export review CSV
          </button>
          <button
            className={button}
            onClick={() => download("TOP50")}
            disabled={busy || !sections.top50.length}
          >
            Export eligible Top 50
          </button>
        </div>
        <p className="text-muted mt-3 text-xs">
          Live read: at most 5 provider records, 60 resource requests and 2 pages per resource.
          HubSpot discovery uses owner 1087915602; Outreach discovery uses the connected account. No
          automatic refresh or retry.
        </p>
        {!liveAvailable && (
          <p className="mt-2 text-sm">
            Live reads require the existing local integration operator session.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-red-800">
            {error} The previous list remains displayed with its original evaluation time.
          </p>
        )}
        <p aria-live="polite" className="mt-3 text-sm">
          {list.rows.length} candidates reviewed · {sections.eligibleCount} eligible ·{" "}
          {sections.needsVerification.length + sections.otherHolds.length} on hold ·{" "}
          {sections.excluded.length} excluded
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <label>Search candidates <input aria-label="Search candidates" className="rounded border p-2" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, company, ID or evidence gap" /></label>
          <label>Status <select aria-label="Review status" className="rounded border p-2" value={status} onChange={event => setStatus(event.target.value)}>
            <option value="ALL">All statuses</option><option value="ELIGIBLE">Eligible</option><option value="HOLD">Hold</option><option value="EXCLUDED">Excluded</option>
          </select></label>
        </div>
        <p className="text-muted text-xs">Filters affect the displayed review. CSV exports retain the complete evaluation.</p>
        {!!list.issues.length && (
          <div role="status" className="mt-3 rounded bg-amber-50 p-3 text-sm">
            Collection incomplete:{" "}
            {[...new Set(list.issues.map((i) => i.resource + ": " + i.code))].join("; ")}. Missing
            records or coverage are not clearance.
          </div>
        )}
      </WorkflowCard>
      <Group
        title="Eligible Top 50"
        rows={visible.top50}
        empty="No fully verified eligible candidates in this evaluation."
      />
      <Group
        title="Needs Verification"
        rows={visible.needsVerification}
        empty="No candidates awaiting email or employment verification."
      />
      <Group title="Other holds" rows={visible.otherHolds} empty="No other held candidates." />
      <Group
        title="Excluded"
        rows={visible.excluded}
        empty="No exclusions observed in this evaluation."
      />
    </WorkflowPage>
  );
}
