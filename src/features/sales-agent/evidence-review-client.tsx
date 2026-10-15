"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { DailyReviewRow } from "@/server/services/sales-agent-collection-service";

type ReviewData = {
  evaluatedAt: string;
  rows: DailyReviewRow[];
  counts: Record<"READY" | "HOLD" | "REJECTED", number>;
  warnings: string[];
  providers: { provider: string; status: string; message: string }[];
};

export function EvidenceReviewClient() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [retryCursor, setRetryCursor] = useState<string | undefined>();
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/sales-agent/evidence", { cache: "no-store" });
      if (response.redirected) throw new Error("Sign in again to review evidence");
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.message || "Evidence review is unavailable");
      setData(result.data);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Evidence review is unavailable");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function collect(after?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    setRetryCursor(after);
    try {
      const response = await fetch("/api/sales-agent/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ after }),
      });
      if (response.redirected) throw new Error("Sign in again to collect evidence");
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.message || "Evidence collection failed");
      setNextCursor(result.data.nextCursor);
      setNotice(
        `Collected ${result.data.collected} contacts. ${result.data.complete ? "Owner-scoped intake complete." : "Intake is partial; collect the next page or retry this page."} ${result.data.warnings.join(" ")}`,
      );
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Evidence collection failed");
    } finally {
      setBusy(false);
    }
  }
  const rows =
    data?.rows.filter((row) => filter === "ALL" || row.plan.decision.status === filter) ?? [];
  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Agent Daily Review</h1>
        <p>
          Read-only evidence for HubSpot owner 1087915602. No sending, enrollment or HubSpot
          changes.
        </p>
        <p>
          READY permits research planning only. Independent verification, SERP evidence and human
          review are required before any future outreach.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <button className="rounded border px-3 py-2" disabled={busy} onClick={() => void collect()}>
          Read HubSpot evidence
        </button>
        {nextCursor && (
          <button
            className="rounded border px-3 py-2"
            disabled={busy}
            onClick={() => void collect(nextCursor)}
          >
            Collect next page
          </button>
        )}
        <button
          className="rounded border px-3 py-2"
          disabled={busy}
          onClick={() => void collect(retryCursor)}
        >
          Retry last page
        </button>
        <button className="rounded border px-3 py-2" disabled={busy} onClick={() => void load()}>
          Refresh saved review
        </button>
      </div>
      {busy && <p role="status">Collecting read-only evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          <p>
            READY: {data.counts.READY} · HOLD: {data.counts.HOLD} · REJECTED: {data.counts.REJECTED}
          </p>
          <p>
            Evaluated: {data.evaluatedAt}. Saved evidence is rechecked for expiry on every refresh.
          </p>
          {data.warnings.map((warning) => (
            <p key={warning} role="alert">
              {warning}
            </p>
          ))}
          <details>
            <summary>Adapter availability</summary>
            <ul>
              {data.providers.map((provider) => (
                <li key={provider.provider}>
                  {provider.provider}: {provider.status} — {provider.message}
                </li>
              ))}
            </ul>
          </details>
          <label>
            Decision{" "}
            <select
              className="rounded border px-2 py-1"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {["ALL", "READY", "HOLD", "REJECTED"].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          {!data.rows.length && (
            <p>
              No saved evidence yet. Configure read-only HubSpot access and the application
              database, then collect evidence. No sample contacts are substituted.
            </p>
          )}
          {data.rows.length > 0 && !rows.length && <p>No prospects match this decision.</p>}
          {rows.map((row) => (
            <article key={row.contact.hubspotRecordId} className="space-y-3 rounded border p-4">
              <h2 className="font-semibold">
                {row.contact.fullName} — {row.plan.decision.status}
              </h2>
              <p>
                HubSpot {row.contact.hubspotRecordId} ·{" "}
                {row.contact.companyName ?? "Company unverified"} ·{" "}
                {row.contact.email ?? "Email missing"}
              </p>
              <p>Collected: {row.collectedAt}</p>
              <h3 className="font-semibold">Reasons</h3>
              <ul>
                {row.plan.decision.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
              <h3 className="font-semibold">Missing requirements</h3>
              {row.plan.decision.missingVerificationRequirements.length ? (
                <ul>
                  {row.plan.decision.missingVerificationRequirements.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p>No missing qualification requirements. Human approval is still required.</p>
              )}
              <h3 className="font-semibold">Next tasks</h3>
              <ol className="list-inside list-decimal">
                {row.plan.tasks.map((task, index) => (
                  <li key={index}>
                    {task.action}
                    {task.requiresHumanApproval ? " (human approval required)" : ""}
                  </li>
                ))}
              </ol>
              <details>
                <summary>Evidence and provenance ({row.provenance.length})</summary>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        {[
                          "Field / value",
                          "Provider / source",
                          "Observed / verified",
                          "Freshness / expiry",
                          "Use",
                        ].map((label) => (
                          <th className="p-2" key={label}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {row.provenance.map((item, index) => (
                        <tr key={index}>
                          <td className="p-2">
                            {item.field}: {JSON.stringify(item.value)}
                          </td>
                          <td className="p-2">
                            {item.provider} · {item.sourceRecordId}
                            <p>{item.sourceUrl}</p>
                            {item.supportingEvidence.map((proof) => (
                              <p key={proof}>{proof}</p>
                            ))}
                          </td>
                          <td className="p-2">
                            {item.observedAt}
                            <p>{item.verifiedAt ?? "Not independently verified"}</p>
                          </td>
                          <td className="p-2">
                            {item.freshness}
                            <p>{item.expiresAt ?? "No verified expiry"}</p>
                          </td>
                          <td className="p-2">
                            {item.accepted ? "Used" : "Not used"}: {item.explanation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p>Human approval: required, not granted. Sending and enrollment: disabled.</p>
            </article>
          ))}
        </>
      )}
    </main>
  );
}
