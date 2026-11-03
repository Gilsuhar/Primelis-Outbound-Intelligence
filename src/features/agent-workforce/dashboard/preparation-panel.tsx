"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PreparationPlan } from "./prospect-preparation";
import { AutomaticReview } from "../company-research/internal-review-client";

export function PreparationResults({ plan }: { plan: PreparationPlan }) {
  return (
    <div className="space-y-4">
      <p>
        {plan.considered} saved contacts considered · {plan.items.length} prioritized companies · up
        to {plan.maxCalls} new model calls if authorized.
      </p>
      {plan.newCalls !== undefined && (
        <p>
          Last action: {plan.newCalls} model calls · reported usage estimate $
          {(plan.newEstimatedUsd ?? 0).toFixed(4)}. Uncertain charges may retain additional
          reservations.
        </p>
      )}
      {plan.lastAction && (
        <section
          aria-label="Last preparation outcome"
          role="status"
          className="rounded-lg border border-line p-3"
        >
          <p className="font-semibold">Outcome: {plan.lastAction.outcome}</p>
          <p>
            Paid AI authorization in submitted request:{" "}
            {plan.lastAction.paidAuthorized ? "YES" : "NO"}.
          </p>
          <p>
            Actual usage:{" "}
            {plan.lastAction.actualCalls === null
              ? "not confirmed"
              : `${plan.lastAction.actualCalls} calls`}{" "}
            ·{" "}
            {plan.lastAction.actualEstimatedUsd === null
              ? "cost not confirmed"
              : `$${plan.lastAction.actualEstimatedUsd.toFixed(4)} estimated`}
            .
          </p>
        </section>
      )}
      {plan.budget && (
        <p>
          Estimated allowance remaining: ${plan.budget.dayRemaining.toFixed(4)} today / $
          {plan.budget.monthRemaining.toFixed(4)} this month · {plan.budget.pending} pending
          requests · {plan.budget.uncertain} uncertain charges. Configuration: $1/day, $5/month,
          concurrency 1, zero retries. These are application estimates, not a guaranteed provider
          billing cap.
        </p>
      )}
      {plan.warnings.map((text, i) => (
        <p role="status" key={i}>
          {text}
        </p>
      ))}
      {!plan.items.length && (
        <p>
          No candidate currently meets the preparation criteria for this batch. Missing matches do
          not mean ineligible; inspect exclusions and contact gates. A new queue reads only one page
          of up to ten owner-scoped contacts from the past year.
        </p>
      )}
      {plan.items.map((item, index) => (
        <article key={item.contactId} className="space-y-3 rounded-xl border border-line p-4">
          <h3 className="font-semibold">
            {index + 1}. {item.name} · {item.company}
          </h3>
          <p>
            Contact eligibility: {item.eligibility} ·{" "}
            <a
              className="underline"
              href={`/sales-agent/prospects/${encodeURIComponent(item.contactId)}`}
            >
              Inspect contact gates and Outreach evidence
            </a>
          </p>
          <details>
            <summary>
              Eligibility checks (
              {item.eligibilityChecks.filter((check) => check.state !== "CLEAR").length} unresolved
              or blocked)
            </summary>
            <p>Last evidenced outbound: {item.lastOutbound}.</p>
            <ul>
              {item.eligibilityChecks.map((check) => (
                <li key={check.id}>
                  {check.label}: {check.state} — {check.reason}
                  {!!check.evidence?.length && (
                    <ul>
                      {check.evidence.map((evidence, evidenceIndex) => (
                        <li key={`${evidence.sourceRecordId}:${evidenceIndex}`}>
                          {evidence.provider} · {evidence.sourceRecordId} · {evidence.freshness} ·{" "}
                          {evidence.accepted ? "accepted" : "not accepted"} · observed{" "}
                          {evidence.observedAt} · verified {evidence.verifiedAt ?? "not verified"}
                          {evidence.value !== null ? ` · value ${String(evidence.value)}` : ""}
                          {evidence.coverage && (
                            <span>
                              {" "}
                              · coverage {evidence.coverage.state} through{" "}
                              {evidence.coverage.through}; identity{" "}
                              {evidence.coverage.identityMatched ? "matched" : "unverified"};
                              permissions{" "}
                              {evidence.coverage.permissionsVerified ? "verified" : "unverified"};
                              all-user history{" "}
                              {evidence.coverage.allUserHistory ? "yes" : "unverified"}; retention{" "}
                              {evidence.coverage.retentionComplete ? "complete" : "unverified"}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <p>{item.priorityReason}</p>
          <p>{item.outreach}</p>
          {item.latestAttempt && (
            <section
              aria-label="Saved preparation attempt"
              role="status"
              className="rounded-lg border border-line p-3"
            >
              <p className="font-semibold">
                Latest saved preparation: {item.latestAttempt.outcome}
              </p>
              <p>
                Paid AI authorized: {item.latestAttempt.paidAuthorized ? "YES" : "NO"} · Stage:{" "}
                {item.latestAttempt.stage} · Submitted: {item.latestAttempt.submittedAt}
              </p>
              {item.latestAttempt.failureCode && (
                <p>Failure code: {item.latestAttempt.failureCode}</p>
              )}
              <p>
                Actual usage:{" "}
                {item.latestAttempt.actualCalls === null
                  ? "not confirmed"
                  : `${item.latestAttempt.actualCalls} calls`}{" "}
                ·{" "}
                {item.latestAttempt.actualEstimatedUsd === null
                  ? "cost not confirmed"
                  : `$${item.latestAttempt.actualEstimatedUsd.toFixed(4)} estimated`}
              </p>
            </section>
          )}
          <details>
            <summary>Missing gates / HOLD reasons ({item.holdReasons.length})</summary>
            <ul>
              {item.holdReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Personalization evidence and unresolved contact facts</summary>
            <p>
              CRM display name is used for greeting only; no contact email is sent to the writer.
            </p>
            {item.contactDraftContext.verifiedPersonalizationFacts.length ? (
              <ul>
                {item.contactDraftContext.verifiedPersonalizationFacts.map((fact) => (
                  <li key={`${fact.field}:${fact.evidenceId}`}>
                    {fact.statement} · {fact.source} · {fact.observedAt}
                    {fact.supportingEvidence.map((quote, quoteIndex) => (
                      <blockquote key={quoteIndex}>{quote}</blockquote>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No independently accepted fresh role or responsibility facts are available.</p>
            )}
            <ul>
              {item.contactDraftContext.unresolved.map((reason, i) => (
                <li key={i}>Unresolved: {reason}</li>
              ))}
            </ul>
          </details>
          <p>{item.reason}</p>
          {item.documentId && (
            <p>
              Saved company run {item.documentId} · {item.createdAt}. This date identifies the
              original result; cached drafts are not newly generated.
            </p>
          )}
          {item.receipt && (
            <p>
              Preparation: {item.receipt.state} · {item.receipt.startedAt}. {item.receipt.reason}
            </p>
          )}
          <p className="font-semibold">
            {item.result?.internalContact?.contactId === item.contactId
              ? `INTERNAL REVIEW ONLY · personalized for ${item.name}; eligibility remains HOLD. OUTBOUND READY: no.`
              : `Internal contact drafts are not prepared for ${item.name} yet. Contact eligibility remains ${item.eligibility}.`}{" "}
            No email address is supplied to the writer; sending and enrollment remain disabled.
          </p>
          {item.result ? (
            <details>
              <summary>Research, Signal opportunity, four drafts and independent verdict</summary>
              <AutomaticReview result={item.result} />
            </details>
          ) : (
            <p>
              Company research and drafts have not run for this packet. No historical demonstration
              substituted.
            </p>
          )}
        </article>
      ))}
      {!!plan.excluded.length && (
        <details>
          <summary>Not prioritized in this bounded batch ({plan.excluded.length})</summary>
          <ul>
            {plan.excluded.map((item, i) => (
              <li key={i}>
                HubSpot {item.contactId}: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function PreparationPanel({
  onRefresh,
  preferredContactId,
}: {
  onRefresh: () => void;
  preferredContactId?: string;
}) {
  const [plan, setPlan] = useState<PreparationPlan | null>(null);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowPaid, setAllowPaid] = useState(false);
  const [confirmPaid, setConfirmPaid] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const revision = useRef(0);
  const selectedItem = plan?.items.find((item) => item.contactId === selectedContactId);
  const selectedPlan =
    plan && selectedItem
      ? {
          ...plan,
          items: [selectedItem],
          maxCalls: selectedItem.maxCalls,
          maxEstimatedUsd: selectedItem.maxCalls > 0 ? plan.maxEstimatedUsd : 0,
          ...(plan.lastAction?.companies.some(
            (company) => company === selectedItem.name + " · " + selectedItem.company,
          )
            ? {}
            : { lastAction: undefined, newCalls: undefined, newEstimatedUsd: undefined }),
        }
      : null;
  useEffect(() => {
    if (
      plan?.items.length &&
      !plan.items.some((item) => item.contactId === selectedContactId) &&
      !preferredContactId
    )
      setSelectedContactId(plan.items[0].contactId);
  }, [plan, selectedContactId, preferredContactId]);
  useEffect(() => {
    if (preferredContactId) setSelectedContactId(preferredContactId);
  }, [preferredContactId]);
  const load = useCallback(async () => {
    const current = revision.current;
    try {
      const response = await fetch("/api/sales-agent/dashboard/prepare", { cache: "no-store" });
      if (response.redirected) throw Error("Sign in to your local workspace.");
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw Error(result.message ?? "Preparation plan unavailable.");
      if (mounted.current && current === revision.current)
        setPlan((previous) => ({ ...result.data, lastAction: previous?.lastAction }));
    } catch (e) {
      if (mounted.current && current === revision.current)
        setError(e instanceof Error ? e.message : "Preparation unavailable");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void load(), 15000); // read-only progress; never repeats POST
    return () => clearInterval(timer);
  }, [busy, load]);
  async function openPaidConfirmation() {
    setError("");
    try {
      const response = await fetch("/api/sales-agent/dashboard/prepare", { cache: "no-store" });
      if (response.redirected) throw Error("Sign in to your local workspace.");
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw Error(result.message ?? "Preparation plan unavailable.");
      const selected = result.data.items.find(
        (item: PreparationPlan["items"][number]) => item.contactId === selectedContactId,
      );
      if (!selected)
        throw Error("Selected contact is no longer available in the owner-scoped queue.");
      if (mounted.current) setPlan(result.data);
      if (!result.data.aiReady || !selected.maxCalls) {
        setError("Paid preparation is blocked by the refreshed configuration or budget preflight.");
        return;
      }
      if (selected.requiresIncrementalEstimate && selected.estimatedIncrementalUsd == null) {
        setError(
          "Paid preparation is blocked because this saved packet has no usable writer/reviewer cost estimate.",
        );
        return;
      }
      if (mounted.current) setConfirmPaid(true);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Preparation preflight unavailable.");
    }
  }
  async function prepare(paidAuthorization: boolean) {
    if (running.current || !selectedItem) return;
    running.current = true;
    setBusy(true);
    setConfirmPaid(false);
    setError("");
    let serverAction: PreparationPlan["lastAction"] | undefined;
    if (mounted.current) {
      setPlan((previous) =>
        previous
          ? {
              ...previous,
              lastAction: {
                paidAuthorized: paidAuthorization,
                outcome: "STARTED",
                companies: [`${selectedItem.name} · ${selectedItem.company}`],
                maxCalls: selectedItem.maxCalls,
                maxEstimatedUsd: selectedItem.maxCalls > 0 ? previous.maxEstimatedUsd : 0,
                actualCalls: null,
                actualEstimatedUsd: null,
              },
            }
          : previous,
      );
    }
    try {
      const response = await fetch("/api/sales-agent/dashboard/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowPaid: paidAuthorization, contactId: selectedItem.contactId }),
      });
      if (response.redirected) throw Error("Sign in to your local workspace.");
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (result.action) {
          serverAction = {
            paidAuthorized: result.action.paidAuthorized,
            outcome: result.action.outcome,
            companies: [],
            maxCalls: plan?.maxCalls ?? 0,
            maxEstimatedUsd: plan?.maxEstimatedUsd ?? null,
            actualCalls: result.action.actualCalls,
            actualEstimatedUsd: result.action.actualEstimatedUsd,
          };
          if (mounted.current)
            setPlan((previous) =>
              previous ? { ...previous, lastAction: serverAction } : previous,
            );
        }
        throw Error(result.message ?? "Preparation stopped; inspect saved results. No retry.");
      }
      revision.current++;
      if (mounted.current) setPlan(result.data);
      onRefresh();
    } catch (e) {
      revision.current++;
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "Preparation stopped. No retry.");
        setPlan((previous) =>
          previous
            ? {
                ...previous,
                lastAction:
                  serverAction ??
                  (previous.lastAction
                    ? {
                        ...previous.lastAction,
                        outcome: "BLOCKED",
                        actualCalls: null,
                        actualEstimatedUsd: null,
                      }
                    : undefined),
              }
            : previous,
        );
      }
      await load(); // read saved checkpoints after uncertain response, no repeat execution
    } finally {
      running.current = false;
      if (mounted.current) {
        setBusy(false);
        setAllowPaid(false);
      }
    }
  }
  return (
    <section
      aria-label="Prepare Prospects"
      className="my-4 space-y-4 rounded-xl border border-line bg-cream p-4"
    >
      <h3 className="text-lg font-semibold">Prepare Prospects</h3>
      <p>
        Select one owner-scoped prospect. The server rechecks identity and reuses verified saved
        evidence where possible. Drafts remain internal unless every outbound gate clears.
      </p>
      {plan?.items.length ? (
        <label className="block space-y-1">
          <span>Select one contact/company</span>
          <select
            aria-label="Select one contact/company"
            value={selectedContactId}
            disabled={busy}
            onChange={(event) => {
              setSelectedContactId(event.target.value);
              setAllowPaid(false);
              setConfirmPaid(false);
            }}
          >
            {plan.items.map((item) => (
              <option key={item.contactId} value={item.contactId}>
                {item.name} · {item.company} · {item.eligibility}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {preferredContactId &&
        plan &&
        !plan.items.some((item) => item.contactId === preferredContactId) && (
          <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            This selected contact is not in the current preparation plan. No other contact was
            selected.
          </p>
        )}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={allowPaid}
          disabled={busy || !plan?.aiReady || !selectedItem?.maxCalls}
          onChange={(e) => setAllowPaid(e.target.checked)}
        />
        I authorize paid AI for this selected contact within the displayed estimated allowance.
        Leave unchecked for read-only checks and cached results.
      </label>
      <button
        className="min-h-11 rounded-xl border border-line bg-white px-4 py-2 font-semibold disabled:opacity-50"
        disabled={busy || !selectedPlan}
        onClick={() => (allowPaid ? void openPaidConfirmation() : void prepare(false))}
      >
        {busy ? "Preparing — no automatic retries" : "Prepare selected prospect"}
      </button>
      {confirmPaid && selectedPlan && selectedItem && (
        <section
          role="alertdialog"
          aria-label="Confirm paid prospect preparation"
          className="space-y-3 rounded-xl border border-line bg-white p-4"
        >
          <h4 className="font-semibold">Confirm this paid preparation</h4>
          <p>Selected contact/company, maximum calls and incremental estimate:</p>
          <ul>
            {selectedPlan.items.map((item) => (
              <li key={item.contactId}>
                {item.name} · {item.company} — eligibility {item.eligibility}; {item.maxCalls}{" "}
                maximum model calls ({item.action})
                {item.requiresIncrementalEstimate && (
                  <>
                    ; estimated incremental usage ${item.estimatedIncrementalUsd!.toFixed(4)} from
                    the prior writing/review calls
                  </>
                )}
              </li>
            ))}
          </ul>
          <p>
            Maximum additional estimated usage permitted under the current local daily/monthly
            limits:{" "}
            {selectedPlan.maxEstimatedUsd === null
              ? "unavailable; paid execution is blocked"
              : `$${selectedPlan.maxEstimatedUsd.toFixed(4)}`}
            . The application enforces its estimates; actual provider billing may differ. No
            retries. No CRM writes or outbound actions.
          </p>
          <button
            type="button"
            disabled={!selectedPlan.aiReady || !selectedPlan.maxCalls}
            onClick={() => void prepare(true)}
          >
            Confirm and prepare this contact
          </button>
          <button type="button" onClick={() => setConfirmPaid(false)}>
            Cancel
          </button>
        </section>
      )}
      {busy && (
        <p role="status">
          Preparing serially. Results are saved locally as each company finishes; an interrupted
          attempt is not restarted automatically.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {selectedPlan ? (
        <PreparationResults plan={selectedPlan} />
      ) : plan ? (
        <p>No selectable prospect is available in this queue.</p>
      ) : (
        <p>Loading your saved preparation plan…</p>
      )}
    </section>
  );
}
