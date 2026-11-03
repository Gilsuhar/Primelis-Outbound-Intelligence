"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  stages,
  type WorkforceRun,
  type WorkforceSequence,
  type WorkforceIntake,
} from "./gate-a-contracts";
const angleClass: Record<string, string> = {
  COMPETITOR_DEFENSE: "border-l-indigo-500",
  BRAND_SPEND_EFFICIENCY: "border-l-emerald-500",
  INCREMENTALITY: "border-l-amber-500",
  OTHER_EVIDENCE_LED: "border-l-sky-500",
  NO_PITCH: "border-l-slate-400",
};
async function api(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (response.redirected) throw new Error("Sign in again to use Agent Workforce");
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message ?? "Agent request failed");
  return data;
}
export function WorkforceClient({
  initialRunId,
  initialIntake,
}: { initialRunId?: string; initialIntake?: WorkforceIntake } = {}) {
  const [run, setRun] = useState<WorkforceRun | null>(null);
  const [runs, setRuns] = useState<WorkforceRun[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const key = useRef<string>("");
  const keyInput = useRef("");
  const acceptRun = useCallback((next: WorkforceRun) => {
    setRun(next);
    setRuns((previous) => [next, ...previous.filter((saved) => saved.id !== next.id)].slice(0, 10));
  }, []);
  const generation = useRef<symbol | null>(null);
  const [edited, setEdited] = useState<WorkforceSequence["messages"] | null>(null);
  useEffect(() => {
    let mounted = true;
    void api("/api/sales-agent/workforce")
      .then((r) => {
        if (mounted) setRuns(r.runs);
        if (initialRunId)
          return api(`/api/sales-agent/workforce/${encodeURIComponent(initialRunId)}`).then(
            (result) => {
              if (mounted) acceptRun(result.run);
            },
          );
      })
      .catch((failure) => {
        if (mounted)
          setError(failure instanceof Error ? failure.message : "Saved runs are unavailable");
      });
    return () => {
      mounted = false;
      generation.current = null;
    };
  }, [initialRunId, acceptRun]);
  useEffect(() => {
    setEdited(run?.sequence?.messages ?? null);
  }, [run]);
  useEffect(() => {
    if (!active || !run || run.status !== "RUNNING") return;
    const version = Symbol();
    generation.current = version;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        void api(`/api/sales-agent/workforce/${encodeURIComponent(run.id)}/advance`, "POST")
          .then((r) => {
            if (!cancelled && generation.current === version) acceptRun(r.run);
          })
          .catch((e) => {
            if (!cancelled && generation.current === version) {
              setError(e.message);
              setActive(false);
            }
          });
      },
      run.leaseUntil ? 1500 : 100,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [run, active, acceptRun]);
  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fingerprint = JSON.stringify({
      hubspotRecordId: initialIntake?.hubspotRecordId,
      ...Object.fromEntries(form.entries()),
    });
    if (!key.current || keyInput.current !== fingerprint) {
      key.current = crypto.randomUUID();
      keyInput.current = fingerprint;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/sales-agent/workforce", "POST", {
        idempotencyKey: key.current,
        intake: {
          ...(initialIntake?.hubspotRecordId
            ? { hubspotRecordId: initialIntake.hubspotRecordId }
            : {}),
          companyName: form.get("companyName"),
          companyDomain: String(form.get("companyDomain")).trim().toLowerCase(),
          prospectName: form.get("prospectName"),
          prospectTitle: form.get("prospectTitle"),
          ...(form.get("linkedinUrl") ? { linkedinUrl: form.get("linkedinUrl") } : {}),
          ...(form.get("targetMarket") ? { targetMarket: form.get("targetMarket") } : {}),
        },
      });
      generation.current = null;
      acceptRun(data.run);
      setActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research could not start");
    } finally {
      setBusy(false);
    }
  }
  async function revise(action: "EDIT" | "REJECT") {
    if (!run) return;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/sales-agent/workforce/${encodeURIComponent(run.id)}`, "PATCH", {
        action,
        expectedVersion: run.version,
        ...(action === "EDIT" ? { messages: edited } : {}),
      });
      acceptRun(data.run);
      setActive(action === "EDIT");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review update failed");
    } finally {
      setBusy(false);
    }
  }
  const running = run?.status === "RUNNING";
  const studioReady =
    run?.eligibility.status === "READY" &&
    run.status === "READY_FOR_REVIEW" &&
    run.critic?.verdict === "PASS" &&
    Object.values(run.critic.checks).every(Boolean) &&
    !run.issues.length;
  return (
    <section className="space-y-5 rounded border p-4 sm:p-6" aria-label="Real agent research">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Signal Agent Workforce</h1>
        <p>
          Research one company and prospect, select an evidence-led angle and write four original
          OpenAI drafts when mandatory eligibility gates pass. No email sending or Outreach writes.
          All content awaits human approval.
        </p>
        <p className="text-sm">
          Requires live OpenAI web-search access, public source retrieval and approved product
          knowledge. Missing sources produce an incomplete run.
        </p>
      </header>
      <form onSubmit={(e) => void start(e)} className="grid gap-3 sm:grid-cols-2">
        {[
          ["companyName", "Company name"],
          ["companyDomain", "Company domain (no https://)"],
          ["prospectName", "Prospect name"],
          ["prospectTitle", "Prospect title"],
          ["linkedinUrl", "LinkedIn URL (optional)"],
          ["targetMarket", "Target market (optional)"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              defaultValue={initialIntake?.[name as keyof WorkforceIntake] ?? ""}
              required={!["linkedinUrl", "targetMarket"].includes(name)}
              type={name === "linkedinUrl" ? "url" : "text"}
              maxLength={name === "linkedinUrl" ? 500 : 240}
              className="block w-full rounded border p-2"
              disabled={busy || running}
            />
          </label>
        ))}
        <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={busy || running}>
          Start research
        </button>
        {run && !running && (
          <button
            type="button"
            className="rounded border px-3 py-2"
            onClick={() => {
              key.current = "";
              setRun(null);
              setError("");
            }}
          >
            New research run
          </button>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
      {runs.length > 0 && (
        <label>
          Saved runs
          <select
            className="ml-2 max-w-full rounded border p-2"
            value={run?.id ?? ""}
            disabled={busy || (running && active)}
            onChange={(e) => {
              generation.current = null;
              setActive(false);
              setRun(runs.find((r) => r.id === e.target.value) ?? null);
              setError("");
            }}
          >
            <option value="">Choose saved run</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.intake.companyName} / {r.intake.prospectName} — {r.status}
              </option>
            ))}
          </select>
        </label>
      )}
      {run && (
        <div className="space-y-4">
          <p role="status">
            <strong>{run.status.replaceAll("_", " ")}</strong> · {run.stage.replaceAll("_", " ")} ·
            version {run.version}
          </p>
          {running && (
            <button
              className="rounded border px-3 py-2"
              disabled={busy}
              onClick={() => setActive(!active)}
            >
              {active ? "Pause after current agent" : "Resume agent run"}
            </button>
          )}
          {running && (
            <p>
              Each completed stage is saved. Pausing or leaving stops dispatching later stages; a
              request already running can finish. Resume this saved run to continue.
            </p>
          )}
          <ol className="flex flex-wrap gap-2 text-sm" aria-label="Agent progress">
            {stages.map((stage) => (
              <li className="rounded border px-2 py-1" key={stage}>
                {stage.replaceAll("_", " ")}:{" "}
                {run.events.some((e) => e.stage === stage && e.state === "FAILED")
                  ? "Failed"
                  : run.events.some((e) => e.stage === stage && e.state === "COMPLETED")
                    ? "Completed"
                    : run.stage === stage && run.leaseUntil
                      ? "Running"
                      : "Pending"}
              </li>
            ))}
          </ol>
          <p className="rounded border p-3">
            Contact eligibility: <strong>{run.eligibility.status}</strong>. Research draft readiness
            is separate from contact eligibility. Approval, sending and enrollment remain disabled.
          </p>
          <details>
            <summary>Qualification and contact-history requirements</summary>
            <ul>
              {run.eligibility.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </details>
          {run.issues.length > 0 && (
            <ul role="alert" className="list-inside list-disc">
              {run.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
          <details open>
            <summary>
              Company and prospect intelligence ({run.research.facts.length} findings)
            </summary>
            <div className="space-y-3 py-3">
              {run.research.facts.map((fact) => (
                <article key={fact.id} className="rounded border p-3">
                  <p>
                    <strong>
                      {fact.subject} · {fact.confidence}
                    </strong>{" "}
                    — {fact.statement}
                  </p>
                  {fact.quotes.map((quote, i) => {
                    const source = run.research.sources.find((s) => s.id === quote.sourceId);
                    return (
                      <div key={i} className="break-words">
                        <blockquote className="border-l pl-3">{quote.text}</blockquote>
                        {source && (
                          <p>
                            <a
                              href={source.url}
                              rel="noreferrer"
                              target="_blank"
                              className="underline"
                            >
                              {source.title}
                            </a>{" "}
                            · observed {source.observedAt}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {fact.limitations.map((lim, i) => (
                    <p key={i}>{lim}</p>
                  ))}
                </article>
              ))}
              {[...run.research.gaps, ...run.research.assumptions, ...run.brandSearch.gaps].map(
                (gap, i) => (
                  <p key={i}>Unverified / missing: {gap}</p>
                ),
              )}
            </div>
          </details>
          {run.strategy && (
            <article
              className={`space-y-2 rounded border border-l-4 p-4 ${angleClass[run.strategy.angle]}`}
            >
              <h2 className="font-semibold">{run.strategy.angle.replaceAll("_", " ")}</h2>
              <p>{run.strategy.hypothesis}</p>
              <p>Company: {run.strategy.companyRationale}</p>
              <p>Prospect: {run.strategy.prospectRationale}</p>
              <p>{run.strategy.rationale}</p>
              <p>Evidence: {run.strategy.supportingFactIds.join(", ")}</p>
              {run.strategy.uncertainties.map((u, i) => (
                <p key={i}>Uncertainty: {u}</p>
              ))}
              {run.strategy.alternatives.map((a, i) => (
                <p key={i}>
                  Alternative {a.angle}: {a.reasonNotSelected}
                </p>
              ))}
            </article>
          )}
          {!studioReady && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
              Draft Studio is locked until contact eligibility, research and automated quality
              checks all pass. Research completion is separate from eligibility. All drafts remain
              unapproved.
            </p>
          )}
          {run.sequence?.creativePlan && (
            <details className="rounded border p-4">
              <summary>Creative approaches and selection</summary>
              <p>{run.sequence.creativePlan.selectionRationale}</p>
              {run.sequence.creativePlan.approaches.map((approach) => (
                <article key={approach.id} className="my-3 space-y-1">
                  <h3 className="font-semibold">
                    {approach.concept}
                    {approach.id === run.sequence?.creativePlan?.selectedApproachId
                      ? " — selected"
                      : ""}
                  </h3>
                  <p>
                    {approach.voice}: {approach.narrative}
                  </p>
                  <p>Prospect fit: {approach.prospectFit}</p>
                  <p>Tradeoffs: {approach.tradeoffs}</p>
                </article>
              ))}
              {run.sequence.creativePlan.hypotheses.map((item, index) => (
                <p key={index}>
                  Hypothesis (unverified): {item.hypothesis} Uncertainty: {item.uncertainty}{" "}
                  Evidence: {item.supportingFactIds.join(", ")}
                </p>
              ))}
            </details>
          )}
          {edited && studioReady && (
            <section className="space-y-3">
              <h2 className="font-semibold">Four original drafts — pending human approval</h2>
              <p>
                Edits invalidate the automated review and trigger another critic pass. Evidence
                references remain attached; unsupported edits will be held.
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {edited.map((message, index) => (
                  <article className="min-w-0 space-y-2 rounded border p-3" key={message.step}>
                    <h3>
                      Email {message.step}: {message.purpose}
                    </h3>
                    <p>Delay: {message.suggestedDelayDays} days after previous email</p>
                    <label>
                      Subject {message.step}
                      <input
                        className="block w-full rounded border p-2"
                        value={message.subject}
                        disabled={running || busy || run.status === "REJECTED"}
                        onChange={(e) =>
                          setEdited(
                            edited.map((m, i) =>
                              i === index ? { ...m, subject: e.target.value } : m,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Body {message.step}
                      <textarea
                        className="block min-h-48 w-full rounded border p-2"
                        maxLength={6000}
                        value={message.body}
                        disabled={running || busy || run.status === "REJECTED"}
                        onChange={(e) =>
                          setEdited(
                            edited.map((m, i) =>
                              i === index ? { ...m, body: e.target.value } : m,
                            ),
                          )
                        }
                      />
                    </label>
                    <p className="break-words text-sm">
                      Facts: {message.supportingFactIds.join(", ")} · approved knowledge:{" "}
                      {message.approvedKnowledgeIds.join(", ")}
                    </p>
                  </article>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded border px-3 py-2"
                  disabled={busy || running || run.status === "REJECTED"}
                  onClick={() => void revise("EDIT")}
                >
                  Save edits and recheck
                </button>
                <button
                  className="rounded border px-3 py-2"
                  disabled={busy || running || run.status === "REJECTED"}
                  onClick={() => void revise("REJECT")}
                >
                  Reject draft
                </button>
              </div>
            </section>
          )}
          {run.critic && (
            <details open>
              <summary>Automated quality review: {run.critic.verdict}</summary>
              {Object.entries(run.critic.checks).map(([check, pass]) => (
                <p key={check}>
                  {check}: {pass ? "Passed" : "Needs attention"}
                </p>
              ))}
              <p>Revision attempts: {run.revisionAttempts}/1</p>
            </details>
          )}
          <details>
            <summary>Approved knowledge used</summary>
            {run.knowledge.map((record) => (
              <article key={record.id} className="py-2">
                <p>
                  {record.id} · {record.kind} · {record.title}
                </p>
                <p>{record.text}</p>
                <p>{record.restrictions}</p>
                <p>Approved sources: {record.sourceIds.join(", ")}</p>
              </article>
            ))}
          </details>
          <p className="text-sm">
            Reported tokens: {run.usage.reduce((n, u) => n + u.inputTokens, 0)} input /{" "}
            {run.usage.reduce((n, u) => n + u.outputTokens, 0)} output across {run.usage.length}{" "}
            successful model requests.{" "}
            {run.usage.length && run.usage.every((u) => u.estimatedCostUsd !== null)
              ? `Token estimate: $${run.usage.reduce((n, u) => n + (u.estimatedCostUsd ?? 0), 0).toFixed(4)}. Excludes web-search and unreported retry fees.`
              : "Dollar estimate unavailable without configured model-specific token rates; tool/retry fees may apply."}
          </p>
        </div>
      )}
    </section>
  );
}
