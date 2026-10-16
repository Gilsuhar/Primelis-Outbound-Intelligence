"use client";
import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardProspect, RunSummary } from "./contracts";
import type { WorkforceRun, WorkforceSequence } from "../gate-a-contracts";
const button =
  "min-h-11 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
const issueText: Record<string, string> = {
  DRAFT_ELIGIBILITY_HOLD:
    "Contact eligibility no longer passes. Resolve the verification and history gates before preparing drafts.",
  DRAFT_DEPENDENCIES_CHANGED:
    "Supporting evidence changed. Previous content approval is invalid; prepare a fresh draft after reviewing the updated evidence.",
  RESEARCH_IDENTITY_CHANGED:
    "Contact identity changed. Refresh the research for this HubSpot record.",
  RESEARCH_REVIEW_REQUIRED: "Research requires a fresh source and identity review.",
  APPROVED_KNOWLEDGE_REQUIRED: "Approved Signal product knowledge is missing or changed.",
};
async function api(method: string, body?: unknown, contactId?: string) {
  const response = await fetch(
    `/api/sales-agent/draft-studio${contactId ? `?contactId=${encodeURIComponent(contactId)}` : ""}`,
    {
      method,
      cache: "no-store",
      ...(body
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    },
  );
  if (response.redirected) throw new Error("Sign in again to review drafts");
  let result: { ok?: boolean; message?: string; run?: WorkforceRun | null };
  try {
    result = await response.json();
  } catch {
    throw new Error("Draft Studio is unavailable. Refresh the workspace and retry.");
  }
  if (!response.ok || !result.ok)
    throw new Error(
      result.message ?? "Draft Studio is unavailable; no substitute drafts were generated",
    );
  return result.run as WorkforceRun | null;
}
export function DraftStudioPanel({
  prospect,
  runs,
}: {
  prospect: DashboardProspect;
  runs: RunSummary[];
}) {
  const id = prospect.contact.hubspotRecordId;
  const eligible = prospect.plan.decision.status === "READY";
  const [run, setRun] = useState<WorkforceRun | null>(null);
  const [edited, setEdited] = useState<WorkforceSequence["messages"]>([]);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const mounted = useRef(false),
    lastVersion = useRef<string | undefined>(undefined);
  const request = useRef({ payload: "", key: "" });
  const accept = useCallback((next: WorkforceRun | null) => {
    if (!mounted.current) return;
    setRun(next);
    const version = next ? `${next.id}:${next.version}` : "empty";
    if (lastVersion.current !== version) {
      lastVersion.current = version;
      setEdited(next?.sequence?.messages ?? []);
    }
  }, []);
  const sourceReady = runs.some(
    (r) =>
      prospect.runIds.includes(r.id) && r.prospectResearch?.stages.REVIEW.status === "COMPLETE",
  );
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void api("GET", undefined, id)
      .then(async (next) => {
        if (cancelled) return;
        accept(next);
        if (!next && eligible && sourceReady) {
          const prepared = await api("POST", { contactId: id });
          if (!cancelled) accept(prepared);
        }
      })
      .catch((error) => {
        if (!cancelled)
          setNotice(error instanceof Error ? error.message : "Draft Studio unavailable");
      });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [id, eligible, sourceReady, accept]);
  const runningId = run?.status === "RUNNING" ? run.id : undefined;
  useEffect(() => {
    if (!runningId || !eligible) return;
    const timer = setInterval(() => {
      void api("POST", { runId: runningId })
        .then(() => api("GET", undefined, id))
        .then(accept)
        .catch((error) => {
          if (mounted.current)
            setNotice(
              error instanceof Error ? error.message : "Resume failed; checkpoint retained",
            );
        });
    }, 15000);
    return () => clearInterval(timer);
  }, [runningId, id, eligible, accept]);
  const meta = run?.draftStudio;
  const ready =
    eligible &&
    run?.status === "READY_FOR_REVIEW" &&
    meta?.qualityDecision === "PASS" &&
    meta.reviewStatus !== "INVALIDATED";
  const changed =
    !!run?.sequence && JSON.stringify(edited) !== JSON.stringify(run.sequence.messages);
  async function prepare() {
    setBusy(true);
    setNotice("");
    try {
      accept(await api("POST", { contactId: id }));
    } catch (error) {
      if (mounted.current)
        setNotice(error instanceof Error ? error.message : "Preparation unavailable");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function mutate(action: "EDIT" | "APPROVE" | "REJECT" | "REGENERATE") {
    if (!run) return;
    setBusy(true);
    setNotice("");
    const payload = {
      action,
      expectedVersion: run.version,
      ...(action === "EDIT" ? { messages: edited } : {}),
    };
    const key = JSON.stringify(payload);
    if (request.current.payload !== key)
      request.current = { payload: key, key: crypto.randomUUID() };
    try {
      accept(
        await api("PATCH", {
          runId: run.id,
          mutation: { ...payload, requestKey: request.current.key },
        }),
      );
    } catch (error) {
      if (mounted.current) setNotice(error instanceof Error ? error.message : "Review unavailable");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function copy(step: number) {
    setBusy(true);
    try {
      const fresh = await api("GET", undefined, id);
      if (
        !fresh?.sequence ||
        fresh.id !== run?.id ||
        fresh.version !== run.version ||
        fresh.draftStudio?.qualityDecision !== "PASS"
      ) {
        accept(fresh);
        throw new Error("Draft or evidence changed. Review the refreshed version before copying.");
      }
      const message = fresh.sequence.messages.find((m) => m.step === step)!;
      await navigator.clipboard.writeText(`Subject: ${message.subject}\n\n${message.body}`);
      if (mounted.current) setNotice(`Email ${step} copied as a draft. No email was sent.`);
    } catch (error) {
      if (mounted.current) setNotice(error instanceof Error ? error.message : "Copy unavailable");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      className="min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-6"
      aria-label="Draft Studio"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Draft Studio</h2>
        <button
          className={button}
          disabled={busy || !eligible || !!runningId}
          onClick={() => void prepare()}
        >
          {runningId ? "Preparing…" : "Prepare / refresh drafts"}
        </button>
      </div>
      <p className="mt-2 text-xs text-stone-600">
        Review-first content only. No sending, enrollment or CRM changes. Content approval never
        overrides eligibility.
      </p>
      {eligible && !run && prospect.draftReady && prospect.draftRunId && (
        <Link
          className={`${button} mt-3 inline-flex items-center`}
          href={`/sales-agent/runs/${encodeURIComponent(prospect.draftRunId)}`}
        >
          Open draft review
        </Link>
      )}
      {!eligible && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">
          <strong>Locked · {prospect.plan.decision.status}</strong>
          <p>
            Locked. Contact eligibility, fresh research and quality checks must pass before
            drafting.
          </p>
          {prospect.plan.decision.reasons.map((reason, i) => (
            <p key={i}>{reason}</p>
          ))}
          <p>
            Development-only synthetic previews do not change eligibility or authorize outreach.
          </p>
        </div>
      )}
      {changed && (
        <p className="mt-3 text-sm text-amber-900">
          Unsaved edits are not approved. Save them and complete another quality review.
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 break-words text-sm">
          {notice}
        </p>
      )}
      {eligible && !run && (
        <p className="mt-3 text-sm">
          Draft preparation starts after source-backed research passes review. Missing optional
          Similarweb or SERP data stays explicit; it is never fabricated.
        </p>
      )}
      {run && (
        <>
          <p className="mt-3 text-sm">
            Preparation: {run.status.replaceAll("_", " ")} · {run.stage.replaceAll("_", " ")}
          </p>
          <p className="mt-1 text-sm">
            Quality review: {meta?.qualityDecision ?? "Pending"} · Human review:{" "}
            {meta?.reviewStatus.replaceAll("_", " ") ?? "Pending"}
          </p>
          {eligible && !changed && meta?.approval && (
            <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm">
              Content approved for review at {meta.approval.at}. Scope: this exact content version
              only. Sending remains disabled.
            </p>
          )}
          {run.issues.map((issue, i) => (
            <p className="mt-2 break-words text-sm text-amber-900" key={i}>
              {issueText[issue] ?? issue}
            </p>
          ))}
          {run.strategy && (
            <div className="mt-4 border-l-2 border-olive pl-3 text-sm">
              <h3 className="font-semibold">
                Recommended angle · {run.strategy.angle.replaceAll("_", " ")}
              </h3>
              <p className="mt-2">Hypothesis: {run.strategy.hypothesis}</p>
              <p className="mt-2">Why this angle: {run.strategy.rationale}</p>
              <p>{run.strategy.companyRationale}</p>
              <p>{run.strategy.prospectRationale}</p>
              {run.strategy.uncertainties.map((s, i) => (
                <p key={i}>Uncertainty: {s}</p>
              ))}
            </div>
          )}
          <details className="mt-4 text-sm">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Supporting facts, sources and missing evidence
            </summary>
            {run.research.facts.map((f) => (
              <article key={f.id} className="mb-3 border-l border-line pl-3">
                <p>
                  Verified source finding ({f.confidence}): {f.statement}
                </p>
                {f.sourceIds.map((sourceId) => {
                  const s = run.research.sources.find((s) => s.id === sourceId);
                  return s ? (
                    <p key={s.id} className="break-words text-xs">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-signal underline"
                      >
                        {s.title}
                      </a>{" "}
                      · {s.observedAt}
                    </p>
                  ) : null;
                })}
              </article>
            ))}
            {meta?.context.serp.map((s) => (
              <p key={s.id}>
                Third-party SERP observation: {s.query}, {s.location}, {s.device}, {s.observedAt}.{" "}
                {s.limitation}
              </p>
            ))}
            {meta?.context.missingInformation.map((s, i) => (
              <p key={i}>Missing / limitation: {s}</p>
            ))}
          </details>
          {eligible && meta?.reviewStatus !== "INVALIDATED" && run.sequence && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {edited.map((message, index) => (
                <article className="min-w-0 rounded-xl border border-line p-3" key={message.step}>
                  <h3 className="font-semibold">
                    Email {message.step} · {message.purpose}
                  </h3>
                  <p className="mt-1 text-xs">
                    Suggested delay: {message.suggestedDelayDays} days ·{" "}
                    {message.body.trim().split(/\s+/).length} words
                  </p>
                  <label className="mt-3 block text-sm">
                    Subject {message.step}
                    <input
                      maxLength={160}
                      className="mt-1 block min-h-11 w-full rounded-lg border border-line p-2"
                      value={message.subject}
                      disabled={busy || !!runningId}
                      onChange={(e) =>
                        setEdited(
                          edited.map((m, i) =>
                            i === index ? { ...m, subject: e.target.value } : m,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="mt-3 block text-sm">
                    Email body {message.step}
                    <textarea
                      maxLength={6000}
                      className="mt-1 block min-h-48 w-full rounded-lg border border-line p-2"
                      value={message.body}
                      disabled={busy || !!runningId}
                      onChange={(e) =>
                        setEdited(
                          edited.map((m, i) => (i === index ? { ...m, body: e.target.value } : m)),
                        )
                      }
                    />
                  </label>
                  <p className="mt-2 break-words text-xs">
                    Evidence references:{" "}
                    {[
                      ...message.supportingFactIds,
                      ...message.approvedKnowledgeIds,
                      ...message.supportingObservationIds,
                    ].join(", ") || "Nonfactual follow-up copy"}
                  </p>
                  <button
                    className={`${button} mt-3`}
                    disabled={busy || !ready || changed}
                    onClick={() => void copy(message.step)}
                  >
                    Copy email {message.step}
                  </button>
                </article>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className={button}
              disabled={
                busy ||
                !eligible ||
                !run.sequence ||
                !!runningId ||
                !changed ||
                meta?.reviewStatus === "INVALIDATED"
              }
              onClick={() => void mutate("EDIT")}
            >
              Save edits & review
            </button>
            <button
              className={button}
              disabled={busy || !ready || changed || !!meta?.approval}
              onClick={() => void mutate("APPROVE")}
            >
              Approve content for review
            </button>
            <button
              className={button}
              disabled={
                busy ||
                !eligible ||
                !!runningId ||
                (meta?.regenerations ?? 3) >= 3 ||
                meta?.reviewStatus === "INVALIDATED"
              }
              onClick={() => void mutate("REGENERATE")}
            >
              Regenerate wording
            </button>
            <button
              className={button}
              disabled={
                busy ||
                !eligible ||
                !!runningId ||
                meta?.reviewStatus === "INVALIDATED" ||
                meta?.reviewStatus === "REJECTED"
              }
              onClick={() => void mutate("REJECT")}
            >
              Reject draft
            </button>
          </div>
          {run.critic && (
            <details className="mt-4 text-sm">
              <summary className="min-h-11 cursor-pointer font-semibold">
                Quality-review checks
              </summary>
              {Object.entries(run.critic.checks).map(([name, pass]) => (
                <p key={name}>
                  {name.replace(/([A-Z])/g, " $1")}: {pass ? "Passed" : "Needs attention"}
                </p>
              ))}
              {[...run.critic.concerns, ...run.critic.unsupportedAssertions].map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </details>
          )}
          <details className="mt-4 text-sm">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Draft version history · {meta?.versions.length ?? 0} versions
            </summary>
            {meta?.versions.map((version) => (
              <details className="mt-2 rounded-lg border border-line p-3" key={version.number}>
                <summary className="min-h-11 cursor-pointer">
                  Version {version.number} · {version.origin} · {version.qualityDecision} ·{" "}
                  {version.at}
                </summary>
                <p className="break-all text-xs">Content fingerprint: {version.contentHash}</p>
                {eligible && version.messages ? (
                  version.messages.map((m) => (
                    <article key={m.step} className="mt-3 text-sm">
                      <strong>
                        Email {m.step}: {m.subject}
                      </strong>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </article>
                  ))
                ) : (
                  <p>Content hidden until eligibility and evidence are current.</p>
                )}
              </details>
            ))}
            {meta?.events.map((event, i) => (
              <p className="mt-2 break-words text-xs" key={i}>
                {event.at} · {event.action} · reviewer {event.actor}
              </p>
            ))}
          </details>
          <p className="mt-4 text-xs">
            Model usage: {run.usage.reduce((n, u) => n + u.inputTokens, 0)} input /{" "}
            {run.usage.reduce((n, u) => n + u.outputTokens, 0)} output tokens.{" "}
            {run.usage.length && run.usage.every((u) => u.estimatedCostUsd !== null)
              ? `Estimated token cost $${run.usage.reduce((n, u) => n + (u.estimatedCostUsd ?? 0), 0).toFixed(4)}; excludes tool and unreported retry fees.`
              : "Cost estimate unavailable without configured model-specific prices."}
          </p>
        </>
      )}
    </section>
  );
}
