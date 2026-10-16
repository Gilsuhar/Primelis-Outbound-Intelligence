"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DailyReport, DailyRun } from "@/features/agent-workforce/daily/contracts";
const control =
  "min-h-11 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem" }) : "Not recorded";
export function runCounts(run: DailyRun) {
  return {
    processed: run.contacts.filter((c) => ["COMPLETED", "BLOCKED", "FAILED"].includes(c.status))
      .length,
    eligible: run.contacts.filter((c) => c.decision === "ELIGIBLE").length,
    hold: run.contacts.filter((c) => c.decision === "HOLD").length,
    rejected: run.contacts.filter((c) => c.decision === "REJECTED").length,
    research: run.contacts.filter((c) => c.researchCompleted).length,
    drafts: run.contacts.filter((c) => c.draftPrepared).length,
  };
}
export function DailyOperationsPanel() {
  const [report, setReport] = useState<DailyReport | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/sales-agent/daily", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.ok || !body.report) throw new Error();
      setReport(body.report);
      setNotice((current) => (current.startsWith("Daily operations unavailable.") ? "" : current));
    } catch {
      setNotice(
        "Daily operations unavailable. Sign in as the configured operator and check database access; no substitute counts are shown.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 20000);
    return () => clearInterval(interval);
  }, [load]);
  async function act(action: "RUN" | "ADVANCE" | "RETRY" | "CANCEL", runId?: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/sales-agent/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "RUN" ? { requestKey: crypto.randomUUID() } : runId ? { runId } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok)
        throw new Error(body.message ?? "Action unavailable; refresh before retrying.");
      setNotice(
        action === "CANCEL"
          ? "Cancellation recorded. An in-flight read-only request may finish; nothing will be sent."
          : "Checkpoint queued. The authenticated worker continues processing; use Continue once for a manual step.",
      );
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action unavailable");
    } finally {
      setBusy(false);
    }
  }
  const latest = report?.runs[0],
    counts = latest ? runCounts(latest) : null;
  const failed =
    latest?.contacts.filter((c) => c.status === "FAILED" || c.status === "BLOCKED") ?? [];
  return (
    <section
      aria-label="Daily agent operations"
      className="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Daily Agent Workforce Report</h2>
          <p className="mt-1 text-xs text-stone-600">
            Asia/Jerusalem · read-only processing · human review required
          </p>
        </div>
        <button className={control} disabled={busy || !report} onClick={() => void act("RUN")}>
          Run now
        </button>
      </div>
      {notice && (
        <p role="status" className="mt-3 break-words text-sm">
          {notice}
        </p>
      )}
      {!report ? (
        <p className="mt-3 text-sm text-stone-600">
          Loading persisted operations. No daily runs or spend have been assumed.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-stone-600">Scheduler</dt>
              <dd className="mt-1 break-words font-medium">
                {report.scheduler.state.replaceAll("_", " ")} · {report.config.time}
              </dd>
              <dd className="mt-1 text-xs">
                A recent worker tick confirms access, not future scheduler delivery.
              </dd>
            </div>
            <div>
              <dt className="text-stone-600">Last complete run</dt>
              <dd className="mt-1">{date(report.lastSuccessfulRunAt)}</dd>
            </div>
            <div>
              <dt className="text-stone-600">Next scheduled time</dt>
              <dd className="mt-1">
                {report.scheduler.nextRunAt
                  ? date(report.scheduler.nextRunAt)
                  : "Not confirmed — configure and verify the external worker"}
              </dd>
            </div>
            <div>
              <dt className="text-stone-600">Estimated API usage</dt>
              <dd className="mt-1">
                ${report.budget.dailyEstimatedUsd.toFixed(3)} / ${report.config.dailyBudgetUsd}{" "}
                daily
              </dd>
              <dd className="mt-1">
                ${report.budget.monthlyEstimatedUsd.toFixed(3)} / ${report.config.monthlyBudgetUsd}{" "}
                monthly
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-stone-600">
            Configured estimates, not provider invoices. In-flight and uncertain charges remain
            reserved. {report.budget.usage?.uncertainRequests ?? 0} uncertain requests. OpenAI:{" "}
            {report.budget.usage?.requests.OPENAI ?? 0}; verification:{" "}
            {report.budget.usage?.requests.VERIFICATION ?? 0}; SERP:{" "}
            {report.budget.usage?.requests.SERP ?? 0}. Limit {report.config.maxContacts}{" "}
            contacts/run; {report.config.maxConcurrentCalls} concurrent calls;{" "}
            {report.config.maxRetries} retries.
          </p>
          {report.budget.usage && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer">Model tokens and research attempts</summary>
              {Object.entries(report.budget.usage.models).map(([model, usage]) => (
                <p className="mt-2 break-words" key={model}>
                  {model}: {usage.requests} requests · {usage.inputTokens} input /{" "}
                  {usage.outputTokens} output tokens
                </p>
              ))}
              <p className="mt-2">
                Research stage attempts:{" "}
                {Object.values(report.budget.usage.researchAttempts).reduce((a, b) => a + b, 0)}
              </p>
            </details>
          )}
          {!latest ? (
            <p className="mt-4 text-sm">
              No daily runs recorded. Configure read-only connections, verified coverage and
              server-side budgets, then run intake. Missing evidence keeps contacts on HOLD.
            </p>
          ) : (
            <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm">
              <p className="font-semibold">
                {latest.status} · {latest.stage} · {counts!.processed}/{latest.contacts.length}{" "}
                processed
              </p>
              {latest.reason && (
                <p role="status" className="mt-2 break-words">
                  {latest.reason}
                </p>
              )}
              <p className="mt-2">
                Discovered {latest.discovered} · Eligible {counts!.eligible} · Hold {counts!.hold} ·
                Rejected {counts!.rejected} · Research reviewed {counts!.research} · Drafts prepared{" "}
                {counts!.drafts} · Deferred {latest.deferred}
              </p>
              <p className="mt-2 text-xs">
                Missing verification evidence:{" "}
                {latest.contacts.filter((c) => c.missingEvidence?.length).length} contacts flagged
                at the last checkpoint. Review each contact’s evidence before outreach.
              </p>
              {latest.nextAttemptAt && (
                <p className="mt-2">Retry after {date(latest.nextAttemptAt)}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {latest.status === "RUNNING" && (
                  <>
                    <button className={control} disabled={busy} onClick={() => void act("ADVANCE")}>
                      Continue once
                    </button>
                    <button
                      className={control}
                      disabled={busy}
                      onClick={() => void act("CANCEL", latest.id)}
                    >
                      Cancel run
                    </button>
                  </>
                )}
                {["PAUSED", "FAILED", "PARTIAL", "CANCELLED"].includes(latest.status) && (
                  <button
                    className={control}
                    disabled={busy}
                    onClick={() => void act("RETRY", latest.id)}
                  >
                    Retry unresolved work
                  </button>
                )}
              </div>
              {!!failed.length && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-medium">
                    {failed.length} blocked or failed contacts · review evidence
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {failed.map((c) => (
                      <li key={c.id} className="break-words">
                        <Link
                          className="underline"
                          href={`/sales-agent/prospects/${encodeURIComponent(c.id)}`}
                        >
                          HubSpot {c.id}
                        </Link>
                        : {c.status} · {c.stage}
                        <p className="mt-1 text-xs">
                          {c.reasons.join("; ") ||
                            "Inspect missing verification and provider evidence"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {!!latest.errors.length && (
                <details className="mt-3">
                  <summary className="cursor-pointer">Provider / checkpoint errors</summary>
                  {latest.errors.map((e, i) => (
                    <p key={i} className="mt-2 break-words text-xs">
                      {date(e.at)} · {e.stage} · {e.code}
                    </p>
                  ))}
                </details>
              )}
            </div>
          )}
          {!!report.runs.length && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Historical runs and trends
              </summary>
              <ul className="mt-3 space-y-3">
                {report.runs.slice(0, 30).map((run) => {
                  const count = runCounts(run);
                  return (
                    <li key={run.id} className="border-t border-line pt-3 text-xs">
                      <p>
                        {date(run.createdAt)} · {run.status} · {count.processed} processed ·{" "}
                        {count.eligible} eligible / {count.hold} hold / {count.rejected} rejected ·{" "}
                        {count.drafts} drafts · estimated ${run.estimatedUsd.toFixed(3)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          {!!latest?.contacts.some((c) => c.draftPrepared) && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Drafts recorded for Gil’s review</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {latest.contacts
                  .filter((c) => c.draftPrepared)
                  .map((c) => (
                    <li key={c.id}>
                      <Link
                        className="underline"
                        href={`/sales-agent/prospects/${encodeURIComponent(c.id)}`}
                      >
                        Review HubSpot {c.id} drafts
                      </Link>
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-xs">
                Readiness is revalidated in Draft Studio. No automatic approval, sending or
                enrollment.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
