"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IntegrationControls } from "./integration-controls";
import {
  Activity,
  ArrowRight,
  CheckCheck,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { DashboardData, DashboardProspect, RunSummary } from "./contracts";
import type { EvidenceField } from "@/features/sales-agent/evidence";

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive disabled:opacity-50";
const panel = "min-w-0 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-6";
const stageNames: Record<string, string> = {
  KNOWLEDGE: "Product knowledge",
  ACCOUNT_RESEARCH: "Company research",
  PROSPECT_INTELLIGENCE: "Prospect intelligence",
  EVIDENCE_VALIDATION: "Evidence validation",
  STRATEGY: "Sales strategy",
  SEQUENCE: "Sequence writing",
  QUALITY_REVIEW: "Quality review",
};
const label = (value: string) =>
  value === "READY"
    ? "Eligible"
    : value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase());
export function SafeSource({ url, children }: { url?: string; children: React.ReactNode }) {
  try {
    const u = new URL(url ?? "");
    if (u.protocol !== "https:" || u.username || u.password) return <span>{children}</span>;
  } catch {
    return <span>{children}</span>;
  }
  return (
    <a
      className="break-words text-signal underline underline-offset-2"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}
function Badge({ status }: { status: string }) {
  const color = ["READY", "COMPLETED", "PENDING_HUMAN_REVIEW"].includes(status)
    ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
    : ["REJECTED", "FAILED", "ERROR"].includes(status)
      ? "bg-rose-50 text-rose-800 ring-rose-200"
      : ["HOLD", "BLOCKED", "INTERRUPTED"].includes(status)
        ? "bg-amber-50 text-amber-900 ring-amber-200"
        : "bg-stone-100 text-stone-700 ring-stone-200";
  return (
    <span
      className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${color}`}
    >
      {label(status)}
    </span>
  );
}
function EvidenceGroup({
  prospect,
  fields,
  title,
}: {
  prospect: DashboardProspect;
  fields: EvidenceField[];
  title: string;
}) {
  const entries = prospect.provenance.filter((item) => fields.includes(item.field));
  return (
    <section className={panel}>
      <h2 className="font-semibold text-ink">{title}</h2>
      {!entries.length ? (
        <p className="mt-2 text-sm text-stone-600">
          No evidence collected. Verification is required; status remains unknown.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {entries.map((item, index) => (
            <li
              key={`${item.sourceRecordId}:${index}`}
              className="min-w-0 border-t border-line pt-3 text-sm first:border-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{item.field.replace(/([A-Z])/g, " $1")}</strong>
                <Badge
                  status={item.accepted && item.freshness === "FRESH" ? "COMPLETED" : "HOLD"}
                />
              </div>
              <p className="mt-1 break-words">
                Observed value:{" "}
                {typeof item.value === "object" ? JSON.stringify(item.value) : String(item.value)}
              </p>
              <p className="text-stone-600">
                {item.accepted ? "Accepted for this evaluation" : "Not accepted for eligibility"} ·{" "}
                {item.provider} · {item.freshness}
              </p>
              <p className="break-words text-stone-600">
                Observed {item.observedAt}; verified {item.verifiedAt ?? "not verified"}
              </p>
              <p className="mt-1">{item.explanation}</p>
              <SafeSource url={item.sourceUrl}>{item.sourceRecordId}</SafeSource>
              {item.supportingEvidence.map((text, i) => (
                <p className="mt-1 break-words text-stone-600" key={i}>
                  {text}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function RunActivity({ run }: { run?: RunSummary }) {
  return (
    <section className={panel} aria-label="Agent Activity">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-olive" />
        <h2 className="font-semibold">Agent Activity</h2>
      </div>
      {!run ? (
        <p className="mt-3 text-sm text-stone-600">
          No research runs yet. Select a prospect to research, or use Manual Research. Stages appear
          only after a run is created.
        </p>
      ) : (
        <>
          <p className="mt-2 break-words text-sm text-stone-600">
            {run.intake.prospectName} · {run.intake.companyName}
          </p>
          <ol className="mt-4 space-y-3">
            {run.stages.map((stage) => (
              <li
                key={stage.stage}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{stageNames[stage.stage]}</span>
                <Badge status={stage.status} />
              </li>
            ))}
          </ol>
          <Link
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-signal underline"
            href={`/sales-agent/runs/${encodeURIComponent(run.id)}`}
          >
            Open actual run <ArrowRight className="h-4 w-4" />
          </Link>
        </>
      )}
    </section>
  );
}
function ResearchBrief({ run }: { run?: RunSummary }) {
  return (
    <section className={panel}>
      <h2 className="font-semibold">Research & recommended angle</h2>
      {!run ? (
        <p className="mt-2 text-sm text-stone-600">
          No source-backed research is linked to this HubSpot record yet.
        </p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <Badge status={run.status} />
          {run.strategy ? (
            <>
              <h3 className="font-semibold">{label(run.strategy.angle)}</h3>
              <p>
                <strong>Hypothesis, not an observed result:</strong> {run.strategy.hypothesis}
              </p>
              <p>{run.strategy.companyRationale}</p>
              <p>{run.strategy.prospectRationale}</p>
              {run.strategy.uncertainties.map((s, i) => (
                <p key={i} className="text-amber-900">
                  Uncertainty: {s}
                </p>
              ))}
            </>
          ) : (
            <p>No sales angle has been selected.</p>
          )}
          {run.research.facts.map((f) => (
            <article key={f.id} className="border-t border-line pt-3">
              <p>{f.statement}</p>
              <p className="text-stone-600">
                Confidence {f.confidence} · {f.category} · {f.id}
              </p>
              {f.sourceIds.map((id) => {
                const source = run.research.sources.find((s) => s.id === id);
                return source ? (
                  <p key={id}>
                    <SafeSource url={source.url}>{source.title}</SafeSource> · observed{" "}
                    {source.observedAt}
                  </p>
                ) : null;
              })}
            </article>
          ))}
          {run.research.assumptions.map((s, i) => (
            <p key={i}>Inference (unverified): {s}</p>
          ))}
          {[...run.research.gaps, ...run.issues].map((s, i) => (
            <p key={i} className="text-amber-900">
              Missing / unresolved: {s}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
function ProspectWorkspace({
  prospect,
  runs,
  onReview,
  busy,
}: {
  prospect: DashboardProspect;
  runs: RunSummary[];
  onReview: (id: string) => void;
  busy: boolean;
}) {
  const run = runs.find((item) => prospect.runIds.includes(item.id));
  const decision = prospect.plan.decision;
  const serp = prospect.drafting.findings.find((f) => f.kind === "SERP");
  const similarweb = prospect.provenance.filter((p) => p.provider === "SIMILARWEB");
  return (
    <div className="space-y-5">
      <Link
        href="/sales-agent"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-signal underline"
      >
        ← Prospect Queue
      </Link>
      <header className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-olive">
              Prospect workspace
            </p>
            <h1 className="mt-2 break-words text-2xl font-semibold text-ink">
              {prospect.contact.fullName}
            </h1>
            <p className="mt-1 break-words text-stone-600">
              {prospect.contact.companyName ?? "Company missing"} ·{" "}
              {prospect.contact.companyDomain ?? "Domain missing"}
            </p>
            <p className="mt-1 break-all text-sm">
              {prospect.contact.email ?? "Business email missing"}
            </p>
          </div>
          <Badge status={decision.status} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className={button}
            disabled={busy}
            onClick={() => onReview(prospect.contact.hubspotRecordId)}
          >
            <CheckCheck className="h-4 w-4" />
            Mark reviewed
          </button>
          <Link
            className={button}
            href={`/sales-agent/manual?contactId=${encodeURIComponent(prospect.contact.hubspotRecordId)}`}
          >
            Research this prospect
          </Link>
        </div>
        <p className="mt-3 text-xs text-stone-600">
          <SafeSource url={prospect.contact.hubspotRecordUrl}>
            HubSpot record {prospect.contact.hubspotRecordId}
          </SafeSource>{" "}
          · owner {prospect.contact.ownerId} · read-only HubSpot intake
        </p>
        <p className="mt-1 break-words text-xs text-stone-600">
          Created {prospect.contact.hubspotCreatedAt ?? "unknown"} · assigned{" "}
          {prospect.contact.ownerAssignedAt ?? "unknown"} · collected {prospect.collectedAt}
        </p>
        <p className="mt-1 text-xs text-stone-600">
          Last human review: {prospect.review?.reviewedAt ?? "Not reviewed"}. Marking reviewed never
          approves outreach.
        </p>
      </header>
      <section
        className={`${panel} ${decision.status === "READY" ? "border-emerald-200" : "border-amber-200 bg-amber-50/40"}`}
      >
        <h2 className="font-semibold">Qualification decision · {label(decision.status)}</h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm">
          {decision.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
        {decision.nextActions.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Required next actions</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              {decision.nextActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </>
        )}
      </section>
      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <EvidenceGroup
          prospect={prospect}
          title="Company fit & Search responsibility"
          fields={["employeeCount", "annualRevenueUsd", "role", "paidSearchResponsibility"]}
        />
        <EvidenceGroup
          prospect={prospect}
          title="Employment & business-email verification"
          fields={["currentEmploymentVerified", "emailVerification"]}
        />
        <EvidenceGroup
          prospect={prospect}
          title="Outreach contact history & sequence status"
          fields={[
            "lastOutboundAt",
            "outreachHistoryComplete",
            "activeSequence",
            "unsubscribed",
            "hardBounced",
            "complained",
            "conflictingActiveOpportunity",
            "accountSuppression",
          ]}
        />
        <ResearchBrief run={run} />
      </div>
      <section className={panel}>
        <h2 className="font-semibold">Similarweb intelligence</h2>
        {similarweb.length ? (
          similarweb.map((item, i) => (
            <p key={i} className="mt-2 text-sm">
              {item.field}: {JSON.stringify(item.value)} · {item.freshness} ·{" "}
              <SafeSource url={item.sourceUrl}>{item.sourceRecordId}</SafeSource>
            </p>
          ))
        ) : (
          <p className="mt-2 text-sm text-stone-600">
            No Similarweb intelligence has been collected. A read-only provider adapter and
            authorized access are required; traffic estimates are not inferred.
          </p>
        )}
      </section>
      <section className={panel}>
        <h2 className="font-semibold">SERP evidence & capture recommendations</h2>
        <p className="mt-2 text-sm text-stone-600">
          {serp?.reason ?? "No verified Google SERP screenshot is available."}
        </p>
        {serp?.evidence.map((item) => (
          <article key={item.id} className="mt-3 text-sm">
            <p>{item.text}</p>
            <p>
              {item.keyword} · {item.market} · {item.device} · observed {item.observedAt}
            </p>
            <SafeSource url={item.screenshotUrl}>Inspect screenshot</SafeSource> ·{" "}
            <SafeSource url={item.sourceUrl}>Source</SafeSource>
          </article>
        ))}
        <p className="mt-3 text-sm">
          Suggested capture (not a finding): Google results for “
          {prospect.contact.companyName ?? prospect.contact.companyDomain ?? "company brand"}”.
          Record the exact keyword, target market, device, observation date, screenshot and source
          URL, then verify manually. One observation does not prove a persistent pattern.
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            How to attach verified evidence
          </summary>
          <p className="mt-2">
            Use the existing evidence review below the dashboard to save company/person facts and
            manually verified SERP captures. Research cannot override eligibility or suppression
            gates.
          </p>
        </details>
      </section>
      <section className={panel}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-olive" />
          <h2 className="font-semibold">Draft Studio</h2>
        </div>
        {prospect.draftReady && prospect.draftRunId ? (
          <>
            <p className="mt-2 text-sm">
              Eligible contact with a quality-reviewed research run. Current evidence and approved
              knowledge are rechecked when you open the draft; human approval remains pending.
            </p>
            <Link
              className={`${button} mt-3`}
              href={`/sales-agent/runs/${encodeURIComponent(prospect.draftRunId)}`}
            >
              Open draft review
            </Link>
          </>
        ) : (
          <p className="mt-2 text-sm text-amber-900">
            Locked. Contact eligibility, fresh source-backed research, approved knowledge and
            automated quality review must all pass. Completing research or marking a contact
            reviewed does not unlock drafts.
          </p>
        )}
      </section>
      <RunActivity run={run} />
    </div>
  );
}
export function DashboardView({
  data,
  error = "",
  busy = false,
  contactId,
  onRefresh = () => {},
  onCollect = () => {},
  onReview = () => {},
  hasNext = false,
  notice = "",
}: {
  data: DashboardData | null;
  error?: string;
  busy?: boolean;
  contactId?: string;
  onRefresh?: () => void;
  onCollect?: () => void;
  onReview?: (id: string) => void;
  hasNext?: boolean;
  notice?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const prospect = data?.prospects.find((p) => p.contact.hubspotRecordId === contactId);
  const filtered =
    data?.prospects.filter(
      (p) =>
        (filter === "ALL" || p.plan.decision.status === filter) &&
        `${p.contact.fullName} ${p.contact.companyName ?? ""} ${p.contact.companyDomain ?? ""} ${p.contact.email ?? ""} ${p.contact.hubspotRecordId}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
    ) ?? [];
  if (contactId)
    return (
      <div className="space-y-5">
        {error && <p role="alert">{error}</p>}
        {!data ? (
          <p role="status">
            {error
              ? "Prospect evidence is unavailable. Restore access and reload to retry."
              : "Loading prospect evidence…"}
          </p>
        ) : prospect ? (
          <ProspectWorkspace prospect={prospect} runs={data.runs} onReview={onReview} busy={busy} />
        ) : (
          <section className={panel}>
            <h1 className="text-xl font-semibold">Prospect unavailable</h1>
            <p className="mt-2">
              This contact is not in your newly added/assigned owner-scoped queue, or its evidence
              is unavailable. No other contact has been substituted.
            </p>
            <Link className={`${button} mt-4`} href="/sales-agent">
              Back to queue
            </Link>
          </section>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    );
  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olive">
            Gil Suhar · Daily intelligence
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
            Agent Workforce
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Your prospect intelligence workspace. Qualify first, inspect the evidence, then review
            drafts. No sending, enrollment or CRM changes.
          </p>
        </div>
        <Link className={`${button} shrink-0`} href="/sales-agent/manual">
          Manual Research <ArrowRight className="h-4 w-4" />
        </Link>
      </header>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Queue summary">
        {[
          ["Reviewed Today", data?.metrics.reviewedToday, "Unique contacts marked reviewed · UTC"],
          ["Eligible", data?.metrics.eligible, "All contact eligibility gates passed"],
          ["Hold", data?.metrics.hold, "Evidence or safety checks unresolved"],
          ["Rejected", data?.metrics.rejected, "Outside ICP or blocked"],
        ].map(([name, value, description]) => (
          <article key={String(name)} className="rounded-2xl border border-line bg-cream p-4">
            <p className="text-sm font-medium text-stone-600">{name}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">
              {typeof value === "number" ? value : "—"}
            </p>
            <p className="sr-only sm:not-sr-only sm:mt-2 sm:text-xs sm:leading-5 sm:text-stone-600">
              {description}
            </p>
          </article>
        ))}
      </section>
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-line p-3 text-sm" role="status">
          {notice}
        </p>
      )}
      {data?.warnings.map((warning, i) => (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          role="status"
          key={i}
        >
          {warning}
        </p>
      ))}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <section className={panel} aria-label="Prospect Queue">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Users className="h-5 w-5 text-olive" />
                  Prospect Queue
                </h2>
                <p className="mt-1 text-xs leading-5 text-stone-600">
                  Newly added or assigned HubSpot contacts · owner 1087915602 · deduplicated by
                  record ID
                </p>
              </div>
              <button
                className={button}
                disabled={busy}
                onClick={onRefresh}
                aria-label="Refresh dashboard"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search prospects</span>
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-stone-500" />
                <input
                  className="min-h-11 w-full min-w-0 rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-sm"
                  placeholder="Search name, company or HubSpot ID"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                <span className="sr-only">Eligibility filter</span>
                <select
                  className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm sm:w-auto"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {[
                    ["ALL", "All eligibility"],
                    ["READY", "Eligible"],
                    ["HOLD", "Hold"],
                    ["REJECTED", "Rejected"],
                  ].map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!data ? (
              <p className="py-10 text-center text-sm text-stone-600" role="status">
                {error
                  ? "Workspace unavailable. Refresh to retry; no contacts were substituted."
                  : "Loading your saved prospect queue…"}
              </p>
            ) : !data.evidenceAvailable ? (
              <p className="py-8 text-sm text-stone-600">
                The evidence store is unavailable. Metrics remain unknown; configure database access
                and refresh.
              </p>
            ) : !data.prospects.length ? (
              <div className="py-8 text-center">
                <Users className="mx-auto h-8 w-8 text-stone-400" />
                <h3 className="mt-3 font-semibold">Your queue is ready for real contacts</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
                  No newly created or assigned contacts have been collected. Connect read-only
                  HubSpot access, then collect today’s owner-scoped contacts. No sample prospects
                  are substituted.
                </p>
              </div>
            ) : !filtered.length ? (
              <p className="py-8 text-sm text-stone-600">
                No contacts match this search and eligibility filter.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {filtered.map((p) => (
                  <li key={p.contact.hubspotRecordId}>
                    <Link
                      className="flex min-w-0 items-start justify-between gap-3 rounded-xl px-2 py-4 transition hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-olive"
                      href={`/sales-agent/prospects/${encodeURIComponent(p.contact.hubspotRecordId)}`}
                    >
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-ink">{p.contact.fullName}</p>
                        <p className="mt-1 break-words text-sm text-stone-600">
                          {p.contact.companyName ?? "Company unknown"}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-stone-600">
                          {p.plan.decision.status === "READY"
                            ? "Contact gates passed; research and draft readiness checked separately"
                            : (p.plan.decision.reasons[0] ?? "Verification required")}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          HubSpot {p.contact.hubspotRecordId} ·{" "}
                          {p.review ? "Reviewed" : "Not reviewed"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-3">
                        <Badge status={p.plan.decision.status} />
                        <ArrowRight className="h-4 w-4 text-olive" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 border-t border-line pt-4">
              <button className={button} disabled={busy} onClick={onCollect}>
                {busy ? "Working…" : hasNext ? "Collect next page" : "Collect today’s contacts"}
              </button>
              <p className="mt-2 text-xs leading-5 text-stone-600">
                Current owner AND created or owner-assigned since 00:00 UTC today. Reading HubSpot
                never modifies a record.
              </p>
            </div>
          </section>
          <section className={panel}>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Clock3 className="h-5 w-5 text-olive" />
              Recent Research Runs
            </h2>
            <p className="mt-1 text-xs text-stone-600">
              Latest 10 saved runs. Research completion is separate from contact eligibility.
            </p>
            {!data?.runs.length ? (
              <p className="mt-4 text-sm text-stone-600">
                {data?.runsAvailable === false
                  ? "Run storage is unavailable. Refresh after restoring database access."
                  : "No research runs yet. Open a prospect or use Manual Research to begin."}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {data.runs.map((run) => (
                  <li key={run.id}>
                    <Link
                      className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
                      href={`/sales-agent/runs/${encodeURIComponent(run.id)}`}
                    >
                      <div className="min-w-0">
                        <p className="break-words font-semibold">
                          {run.intake.prospectName} · {run.intake.companyName}
                        </p>
                        <p className="mt-1 break-words text-xs text-stone-600">
                          {run.intake.hubspotRecordId
                            ? `HubSpot ${run.intake.hubspotRecordId}`
                            : "Manual research · no linked HubSpot ID"}{" "}
                          · {run.updatedAt}
                        </p>
                      </div>
                      <Badge status={run.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="min-w-0 space-y-5">
          <RunActivity run={data?.runs.find((run) => run.status === "RUNNING") ?? data?.runs[0]} />
          <section className={panel} aria-label="Integration Health">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-olive" />
              Integration Health
            </h2>
            <p className="mt-2 text-xs leading-5 text-stone-600">
              Configuration is not a successful connection test. Historical success does not
              establish current connectivity.
            </p>
            {!data ? (
              <p className="mt-4 text-sm">Loading readiness…</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {data.integrations.map((integration) => (
                  <li
                    key={integration.id}
                    className="min-w-0 border-t border-line pt-3 first:border-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{integration.label}</h3>
                      <Badge status={integration.status} />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-stone-600">{integration.detail}</p>
                    <IntegrationControls integration={integration} refresh={onRefresh} />
                    {integration.observedAt && (
                      <p className="mt-1 break-words text-xs text-stone-600">
                        Recorded observation: {integration.observedAt}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {data && (
        <p className="text-xs text-stone-500">
          Evidence re-evaluated at {data.evaluatedAt}. Reviewed Today counts explicit human reviews,
          not email sends or AI activity.
        </p>
      )}
    </div>
  );
}
export function WorkforceDashboard({ contactId }: { contactId?: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const generation = useRef<symbol | null>(null);
  const load = useCallback(async () => {
    const version = Symbol("dashboard-request");
    generation.current = version;
    try {
      const response = await fetch("/api/sales-agent/dashboard", { cache: "no-store" });
      if (response.redirected) throw Error("Sign in again to access your workspace.");
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw Error(
          result.message ?? "Workspace unavailable. No sample data has been substituted.",
        );
      if (version === generation.current) {
        setData(result.data);
        setError("");
      }
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Workspace unavailable");
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      generation.current = null;
    };
  }, [load]);
  useEffect(() => {
    if (
      !data?.runs.some((run) => run.status === "RUNNING") &&
      !data?.integrations.some((item) =>
        ["QUEUED", "RUNNING"].includes(item.sync?.job?.status ?? ""),
      )
    )
      return;
    const timer = setInterval(() => void load(), 20000);
    return () => clearInterval(timer);
  }, [data, load]);
  async function action(type: "COLLECT" | "REVIEW", id?: string) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(
        type === "COLLECT" ? "/api/sales-agent/evidence" : "/api/sales-agent/dashboard",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            type === "COLLECT" ? { after: cursor } : { action: "MARK_REVIEWED", contactId: id },
          ),
        },
      );
      if (response.redirected) throw Error("Sign in again to use the workspace");
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.message ?? "Request failed");
      if (type === "COLLECT") {
        setCursor(result.data.nextCursor);
        setNotice(
          `${result.data.collected} contacts collected. ${result.data.complete ? "Today's owner-scoped intake is complete." : "Collection is partial. Continue the next page or retry; no additional contacts are implied."} ${result.data.warnings.join(" ")}`,
        );
      } else
        setNotice(
          "Review recorded in the application. No CRM record or outreach approval changed.",
        );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <DashboardView
      data={data}
      error={error}
      busy={busy}
      contactId={contactId}
      onRefresh={() => void load()}
      onCollect={() => void action("COLLECT")}
      onReview={(id) => void action("REVIEW", id)}
      hasNext={!!cursor}
      notice={notice}
    />
  );
}
