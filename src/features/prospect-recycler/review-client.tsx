"use client";
import { useState } from "react";
import { WorkflowPage, WorkflowCard } from "@/features/workflow/workflow-layout";
import {
  eligibilityLabel,
  filterReviewRows,
  sortReviewRows,
  reviewCsv,
  reviewDate,
  reviewSections,
  type ReviewSort,
  type ReviewList,
  type ReviewRow,
} from "./review";

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
          <p className="text-sm">
            {row.qualification?.company?.name ?? "Company not verified"} ·{" "}
            {row.qualification?.responsibility?.title ?? "Role not verified"}
          </p>
          <p className="text-muted text-xs">HubSpot ID: {row.hubspotId ?? "Not established"}</p>
        </div>
        <span
          className={"rounded-full px-3 py-1 text-xs font-bold " + statusStyle[row.decision.status]}
        >
          {eligibilityLabel(row.decision.status)}
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
      <p className="mt-2 text-sm">
        Draft readiness:{" "}
        {row.decision.status === "ELIGIBLE"
          ? "Eligible for human draft review; not approved to send."
          : "Eligibility evidence must be resolved before outreach approval."}
      </p>
      <p className="text-muted text-xs">
        Screenshot recommendation: require a current SERP observation matching this employer and
        target brand; none attached to this review.
      </p>
      <p className="mt-2 text-sm">
        Employment: {row.employmentVerification?.status ?? "UNKNOWN"} · Email verification:{" "}
        {row.emailVerification?.status ?? "UNKNOWN"}. Human review: pending.
      </p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">
          Company qualification and source observations
        </summary>
        <p>
          Employees: {row.qualification?.company?.employees ?? "Unknown"} · Annual revenue (USD):{" "}
          {row.qualification?.company?.annualRevenueUsd?.toLocaleString("en-US") ?? "Unknown"}
        </p>
        <p>
          Both 80 employees and USD 30 million revenue are mandatory. CRM observations alone do not
          verify employment or email.
        </p>
        {row.profiles?.map((profile, i) => (
          <p key={i}>
            {profile.source}: owner {profile.ownerId ?? "Unknown"}; role{" "}
            {profile.title ?? "Unknown"}; created {reviewDate(profile.createdAt)}; updated{" "}
            {reviewDate(profile.updatedAt)}; observed {reviewDate(profile.observedAt)}.
          </p>
        ))}
      </details>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Activity timeline</summary>
        {!row.communications?.length && !row.engagement?.length && (
          <p>No activity observations available; this does not establish no contact.</p>
        )}
        {[
          ...(row.communications ?? []).map((e) => ({
            id: e.id,
            at: e.at,
            text: `${e.record.system} ${e.direction} ${e.outcome}`,
          })),
          ...(row.engagement ?? []).map((e) => ({
            id: e.id,
            at: e.at,
            text: `${e.source} ${e.kind} (engagement only)`,
          })),
        ]
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
          .map((e) => (
            <p key={e.id}>
              {reviewDate(e.at)} · {e.text}
            </p>
          ))}
      </details>
      <details className="mt-3 text-sm" open={!!row.preparation}>
        <summary className="cursor-pointer font-semibold">Research and email drafts</summary>
        {!row.preparation ? (
          <p>
            Research has not been attached to this candidate. No company claims, CPC values or
            screenshots inferred.
          </p>
        ) : (
          <>
            <p>
              {row.preparation.mode === "SIMULATED"
                ? "Fictional research and drafts — offline demonstration only."
                : "Source-backed draft awaiting human review."}
            </p>
            {row.preparation.brief.map((section) => (
              <div className="mt-3" key={section.topic}>
                <h4 className="font-semibold">
                  {section.topic} · {section.status}
                </h4>
                <p>{section.text}</p>
                {section.sources.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="mr-3 underline"
                  >
                    Source
                  </a>
                ))}
              </div>
            ))}
            <p className="mt-3">{row.preparation.screenshot.instruction}</p>
            {row.preparation.emails.map((email, i) => (
              <div key={i} className="mt-3 rounded border border-line p-3">
                <h4 className="font-semibold">
                  {i ? "Optional follow-up" : "First email"}: {email.subject}
                </h4>
                <p className="whitespace-pre-line">{email.body}</p>
                <p className="text-muted mt-2 text-xs">
                  {row.preparation!.quality.wordsPerEmail[i]} words · Evidence:{" "}
                  {email.evidenceIds.join(", ")}
                </p>
              </div>
            ))}
            <p className="mt-3">
              Quality:{" "}
              {row.preparation.quality.checksPassed ? "Deterministic checks passed" : "Incomplete"}.{" "}
              {row.preparation.quality.concerns.join(" ")}
            </p>
            <p>
              Research {row.preparation.research} · Draft {row.preparation.drafting} · Human review{" "}
              {row.preparation.humanReview} · Sending not approved.
            </p>
          </>
        )}
      </details>
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
            .filter(
              (e) => e.kind === "EMAIL" || e.kind === "EMPLOYMENT" || e.kind === "QUALIFICATION",
            )
            .map((e, i) => (
              <li key={i}>
                {e.kind}: {e.source} · {e.evidenceId}; checked {reviewDate(e.checkedAt)}; expires{" "}
                {reviewDate(e.expiresAt)}.
              </li>
            ))}
        </ul>
      </details>
    </article>
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
  const [sort, setSort] = useState<ReviewSort>("OUTBOUND_OLDEST");
  const [selected, setSelected] = useState<string | null>(null);
  const sections = reviewSections(list);
  const visible = sortReviewRows(filterReviewRows(list.rows, query, status), sort);
  const candidate = visible.find((row) => row.id === selected);
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
      title="Daily prospect workspace"
      description="Review 40–50 prospects per batch. Eligibility depends on evidence, never a quota. Research, drafts and human approval remain separate."
    >
      <WorkflowCard>
        <p className="font-semibold">
          {list.mode === "DEMO"
            ? `Offline demonstration — ${list.rows.length} fictional candidates`
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
          {sections.excluded.length} disqualified
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [
              "Missing evidence",
              list.rows.filter((r) => r.decision.reasons.some((reason) => reason.status === "HOLD"))
                .length,
            ],
            [
              "Research completed",
              list.rows.filter((r) => r.preparation?.research === "COMPLETE").length,
            ],
            [
              "Drafts ready for review",
              list.rows.filter((r) => r.preparation?.drafting === "READY_FOR_REVIEW").length,
            ],
            ["Human review pending", list.rows.length],
          ].map(([label, count]) => (
            <div className="rounded-lg bg-slate-50 p-3" key={label}>
              <p className="text-muted text-xs">{label}</p>
              <strong className="text-xl">{count}</strong>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm" aria-label="Integration status">
          {list.discovery.map((integration) => (
            <p key={integration.provider}>
              {integration.provider}:{" "}
              {list.mode === "DEMO" ? "Synthetic data only" : integration.status} · Last successful
              synchronization: {reviewDate(integration.lastSuccessfulSync)}. Visible page completion
              does not verify historical coverage.
            </p>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <label>
            Search candidates{" "}
            <input
              aria-label="Search candidates"
              className="rounded border p-2"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, company, ID or evidence gap"
            />
          </label>
          <label>
            Status{" "}
            <select
              aria-label="Review status"
              className="rounded border p-2"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="HOLD">Hold</option>
              <option value="EXCLUDED">Disqualified</option>
            </select>
          </label>
          <label>
            Sort{" "}
            <select
              aria-label="Sort candidates"
              className="rounded border p-2"
              value={sort}
              onChange={(event) => setSort(event.target.value as ReviewSort)}
            >
              <option value="OUTBOUND_OLDEST">Oldest outbound first</option>
              <option value="OUTBOUND_NEWEST">Newest outbound first</option>
              <option value="COMPANY">Company</option>
              <option value="NAME">Contact name</option>
            </select>
          </label>
        </div>
        <p className="text-muted text-xs">
          Filters affect the displayed review. CSV exports retain the complete evaluation.
        </p>
        {!!list.issues.length && (
          <div role="status" className="mt-3 rounded bg-amber-50 p-3 text-sm">
            Collection incomplete:{" "}
            {[...new Set(list.issues.map((i) => i.resource + ": " + i.code))].join("; ")}. Missing
            records or coverage are not clearance.
          </div>
        )}
      </WorkflowCard>
      <WorkflowCard>
        <h2 className="mb-3 text-xl font-semibold">Prospect review ({visible.length})</h2>
        {!visible.length ? (
          <p>No candidates match these filters. Clear search or choose all statuses.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-label="Daily prospects">
              <thead>
                <tr>
                  {[
                    "Company / Contact",
                    "Role / HubSpot ID",
                    "Last outbound",
                    "Email verification",
                    "Eligibility / HOLD reasons",
                    "Research / Draft",
                  ].map((label) => (
                    <th key={label} className="border-b border-line p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-b border-line align-top">
                    <td className="p-3">
                      <div>
                        {row.qualification?.company?.name ??
                          row.profiles?.find((p) => p.company)?.company?.name ??
                          row.employerDomain ??
                          "Company unknown"}
                      </div>
                      <button
                        className="font-semibold underline"
                        aria-label={`Inspect ${row.name}`}
                        onClick={() => setSelected(row.id)}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="p-3">
                      {row.qualification?.responsibility?.title ??
                        row.profiles?.find((p) => p.title)?.title ??
                        "Role unknown"}
                      <div className="text-muted text-xs">
                        {row.hubspotId ?? "No verified HubSpot ID"} · {row.providers.join(" + ")}
                      </div>
                    </td>
                    <td className="p-3">{reviewDate(row.decision.latestRelevantOutbound?.at)}</td>
                    <td className="p-3">
                      {row.emailVerification?.status ?? "UNKNOWN"}
                      <div className="text-muted text-xs">
                        {reviewDate(row.emailVerification?.checkedAt)}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          "rounded px-2 py-1 font-semibold " + statusStyle[row.decision.status]
                        }
                      >
                        {eligibilityLabel(row.decision.status)}
                      </span>
                      <p className="mt-2 max-w-sm">
                        {row.decision.reasons
                          .filter((r) => r.status !== "ELIGIBLE")
                          .map((r) => r.message)
                          .slice(0, 2)
                          .join(" ")}
                      </p>
                    </td>
                    <td className="p-3">
                      {row.preparation?.research ?? "MISSING"}
                      <div>{row.preparation?.drafting ?? "MISSING"}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkflowCard>
      {candidate && (
        <WorkflowCard>
          <div className="mb-3 flex justify-between">
            <h2 className="text-xl font-semibold">Prospect details</h2>
            <button className={button} onClick={() => setSelected(null)}>
              Close details
            </button>
          </div>
          <Candidate row={candidate} />
        </WorkflowCard>
      )}
    </WorkflowPage>
  );
}
