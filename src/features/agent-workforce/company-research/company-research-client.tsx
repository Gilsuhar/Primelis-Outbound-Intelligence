"use client";
import React, { useEffect, useState } from "react";
import { companyRunSchema, type CompanyRun } from "./contracts";

export function CompanyResearchClient() {
  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const [runs, setRuns] = useState<CompanyRun[]>([]);
  const [aiReady, setAiReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function refresh() {
    try {
      const response = await fetch("/api/sales-agent/company-research", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message ?? "History unavailable");
      setRuns(companyRunSchema.array().parse(data.runs));
      setAiReady(data.aiReady === true);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "History unavailable");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Company Research V1</h1>
      <p>
        Research a company using public sources. Contact verification and draft eligibility remain
        separate.
      </p>
      <p role="status">
        {aiReady
          ? "Local AI configured · $1/day · $5/month · one concurrent provider call · zero retries"
          : "Paid AI disabled or configuration incomplete. No research calls will run."}
      </p>
      <form
        className="grid max-w-xl gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !aiReady) return;
          setBusy(true);
          setNotice("Researching company; keep this page open.");
          try {
            const response = await fetch("/api/sales-agent/company-research", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "idempotency-key": crypto.randomUUID(),
              },
              body: JSON.stringify({ companyName, companyDomain }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok)
              throw new Error(data.message ?? "Company research unavailable");
            const run = companyRunSchema.parse(data.run);
            setRuns((current) =>
              [run, ...current.filter((item) => item.id !== run.id)].slice(0, 25),
            );
            setNotice(`Research ${run.status.replaceAll("_", " ").toLowerCase()}.`);
          } catch (error) {
            setNotice(error instanceof Error ? error.message : "Company research unavailable");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="grid gap-1">
          Company name
          <input
            required
            maxLength={180}
            className="rounded border p-2"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </label>
        <label className="grid gap-1">
          Company domain
          <input
            required
            maxLength={240}
            placeholder="example.com"
            className="rounded border p-2"
            value={companyDomain}
            onChange={(event) => setCompanyDomain(event.target.value)}
          />
        </label>
        <p className="text-sm">
          Each research submission may use paid AI when enabled. No sending, enrollment or CRM sync
          occurs.
        </p>
        <button
          className="min-h-11 rounded border p-2 disabled:opacity-50"
          disabled={busy || !aiReady}
          type="submit"
        >
          {busy ? "Researching…" : "Research company"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <button
        type="button"
        className="min-h-11 underline"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh saved history
      </button>
      {!runs.length && <p>No saved company research.</p>}
      {runs.map((run) => (
        <article key={run.id} className="space-y-3 rounded border p-4">
          <h2 className="text-xl font-semibold">
            {run.input.companyName} · {run.input.companyDomain}
          </h2>
          <p>
            {run.status.replaceAll("_", " ")} · {run.updatedAt}
          </p>
          {run.status === "RUNNING" && (
            <p>
              This request is running or was interrupted. Refresh history to check; no background
              worker or automatic retry will resume it.
            </p>
          )}
          {run.status === "REVIEW_REQUIRED" && (
            <p>
              Source and AI checks passed. Human review is still required; this research grants no
              contact or draft clearance.
            </p>
          )}
          {run.issues.map((issue, index) => (
            <p key={index}>{issue}</p>
          ))}
          <h3 className="font-semibold">Source-backed findings</h3>
          {!run.research.facts.length && <p>No validated company facts available.</p>}
          {run.research.facts.map((fact) => (
            <div key={fact.id} className="space-y-1">
              <p>
                {fact.statement} · {fact.confidence} confidence
              </p>
              {fact.quotes.map((quote, index) => (
                <blockquote key={index} className="border-l-2 pl-3">
                  “{quote.text}” ({quote.sourceId})
                </blockquote>
              ))}
              {fact.limitations.map((item, index) => (
                <p key={index} className="text-sm">
                  Limitation: {item}
                </p>
              ))}
            </div>
          ))}
          {run.groundingAudit && (
            <details className="rounded border p-3">
              <summary className="cursor-pointer font-semibold">
                Grounding audit · unverified candidates
              </summary>
              <p>Audit only. Candidate claims are not validated findings or approval to send.</p>
              <p>
                Review: {run.groundingAudit.status} · identity:{" "}
                {run.groundingAudit.identityMatches === null
                  ? "unavailable"
                  : run.groundingAudit.identityMatches
                    ? "matched"
                    : "not matched"}
              </p>
              <p>Reasons: {run.groundingAudit.reasonCodes.join(", ") || "None"}</p>
              {run.groundingAudit.reviewer && (
                <p>
                  Reviewer concern categories:{" "}
                  {run.groundingAudit.reviewer.concernCodes.join(", ") || "None"}. Unknown supported
                  IDs: {run.groundingAudit.reviewer.unknownSupportedCount}; unknown rejected IDs:{" "}
                  {run.groundingAudit.reviewer.unknownRejectedCount}.
                </p>
              )}
              {run.groundingAudit.reviewer?.concerns?.map((concern, index) => (
                <p key={`concern-${index}`} className="my-2 text-sm">
                  Reviewer note · {concern.severity} · {concern.code} · {concern.scope}:{" "}
                  {concern.reason ?? `Explanation omitted (${concern.reasonOmitted}).`} Candidates:{" "}
                  {concern.candidateIds.join(", ") || "Global/source scope"}; sources:{" "}
                  {concern.sourceIds.join(", ") || "Global scope"}.
                  {concern.attributionOmitted &&
                    " Unknown attribution withheld; review cannot grant acceptance."}
                </p>
              ))}
              {run.groundingAudit.candidates.map((candidate) => (
                <div key={candidate.candidateId} className="my-3 border-t pt-2">
                  <p>
                    {candidate.factId ?? candidate.candidateId} · reviewer:{" "}
                    {candidate.reviewerDecision} · exact-source checks:{" "}
                    {candidate.deterministicChecks}
                  </p>
                  <p>
                    Unverified candidate:{" "}
                    {candidate.statement ?? `Text omitted (${candidate.statementOmitted}).`}
                  </p>
                  {candidate.quotes.map((quote, index) => (
                    <blockquote key={index} className="border-l-2 pl-3">
                      {quote.text ?? `Quote omitted (${quote.textOmitted}).`} · {quote.sourceId} ·
                      exact match: {quote.exactMatch ? "yes" : "no"}
                    </blockquote>
                  ))}
                </div>
              ))}
            </details>
          )}
          <h3 className="font-semibold">Assumptions and missing evidence</h3>
          {run.research.assumptions.map((item, index) => (
            <p key={`a-${index}`}>Assumption: {item}</p>
          ))}
          {run.research.gaps.map((item, index) => (
            <p key={`g-${index}`}>Gap: {item}</p>
          ))}
          <p>
            Advertising, SERP, Similarweb, contact eligibility and sending clearance are unavailable
            in this company-only flow.
          </p>
          <h3 className="font-semibold">Retrieved sources</h3>
          {run.research.sources.map((source) => (
            <p key={source.id}>
              <a className="underline" href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>{" "}
              · {source.id} · retrieved {source.observedAt}
            </p>
          ))}
          <p className="text-sm">
            Recorded successful-call estimate: $
            {run.usage.reduce((sum, entry) => sum + (entry.estimatedCostUsd ?? 0), 0).toFixed(4)}.
            Failed/uncertain reservations remain in the budget ledger.
          </p>
        </article>
      ))}
    </section>
  );
}
