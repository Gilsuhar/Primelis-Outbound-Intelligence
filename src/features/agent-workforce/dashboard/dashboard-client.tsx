"use client";
import type { IntakeWindow } from "@/features/sales-agent/intake-scope";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getWorkforceBuildInfo } from "@/lib/workforce-build-info";
import { DailyOperationsPanel } from "./daily-operations-panel";
import { DraftStudioPanel } from "./draft-studio-panel";
import { ProspectResearchPanel } from "./prospect-research-panel";
import { VerificationPanel } from "./verification-panel";
import { IntegrationControls } from "./integration-controls";
import { PreparationPanel } from "./preparation-panel";
import { Activity, ArrowRight, CheckCheck, RefreshCw, Search, Users, Copy, X } from "lucide-react";
import type { DashboardData, DashboardProspect, RunSummary } from "./contracts";
import type { EvidenceField } from "@/features/sales-agent/evidence";

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive disabled:opacity-50";
const panel = "min-w-0 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-6";
const stageNames: Record<string, string> = {
  COMPANY: "Company research",
  SIMILARWEB: "Similarweb",
  SERP: "Brand SERP",
  CONTACT: "Contact research",
  ASSESSMENT: "Opportunity assessment",
  REVIEW: "Research review",
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
    if (u.protocol !== "https:" || u.username || u.password)
      return <span className="break-words">{children}</span>;
  } catch {
    return <span className="break-words">{children}</span>;
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
              <p className="mt-1 break-words">{item.explanation}</p>
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
  onRefresh,
  busy,
  localReadOnly,
}: {
  prospect: DashboardProspect;
  runs: RunSummary[];
  onReview: (id: string) => void;
  onRefresh: () => void;
  busy: boolean;
  localReadOnly?: boolean;
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
            Manual evidence & legacy research
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
      {localReadOnly && (
        <section className={panel}>
          <h2 className="font-semibold">Company research & internal drafts</h2>
          <p className="mt-2 text-sm">
            Research this company while contact clearance is on HOLD. Company-only emails use a
            fictional recipient and never approve outreach to this contact.
          </p>
          <Link
            className={`${button} mt-3 inline-flex`}
            href={`/sales-agent/company-research?company=${encodeURIComponent(prospect.contact.companyDomain ?? prospect.contact.companyName ?? "")}`}
          >
            Open company research
          </Link>
        </section>
      )}
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
      <VerificationPanel prospect={prospect} />
      <ProspectResearchPanel prospect={prospect} runs={runs} onRefresh={onRefresh} />
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
        <p className="mt-3 break-words text-sm">
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
      <DraftStudioPanel key={prospect.contact.hubspotRecordId} prospect={prospect} runs={runs} />
      <RunActivity run={run} />
    </div>
  );
}

function compactConnectionStatus(integration: DashboardData["integrations"][number]) {
  if (integration.status === "CONNECTED") return "Connected" as const;
  if (integration.status === "LAST_SUCCESS") {
    const age = integration.observedAt ? Date.now() - Date.parse(integration.observedAt) : Infinity;
    return Number.isFinite(age) && age >= 0 && age <= 24 * 60 * 60 * 1000
      ? ("Connected" as const)
      : ("Not verified" as const);
  }
  if (
    ["ERROR", "DISCONNECTED", "PERMISSION_MISSING", "NOT_CONFIGURED", "NOT_IMPLEMENTED"].includes(
      integration.status,
    )
  )
    return "Needs attention" as const;
  return "Not verified" as const;
}

function evidencedOutreachDate(prospect: DashboardProspect) {
  const entry = prospect.provenance.find(
    (item) => item.field === "lastOutboundAt" && item.accepted && item.value,
  );
  const value = entry?.value;
  if (typeof value !== "string" && typeof value !== "number") return "Unknown";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString() : "Unknown";
}

function SavedDraftReview({
  contactName,
  companyName,
  packet,
  onClose,
}: {
  contactName: string;
  companyName: string;
  packet: NonNullable<DashboardProspect["savedInternalPacket"]>;
  onClose: () => void;
}) {
  const [emails, setEmails] = useState(() => packet.emails.map((email) => ({ ...email })));
  const [copyState, setCopyState] = useState("");
  const copy = async (index: number) => {
    const email = emails[index];
    try {
      await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
      setCopyState(`Email ${index + 1} copied`);
    } catch {
      setCopyState("Clipboard unavailable in this browser");
    }
  };
  return (
    <section className={panel} aria-label="Email Review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Email Review</h2>
          <p className="mt-1 text-sm text-stone-600">
            {contactName} · {companyName} · saved packet from{" "}
            {new Date(packet.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button className={button} onClick={onClose} aria-label="Close email review">
          <X className="h-4 w-4" /> Close
        </button>
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
        <p className="font-semibold">INTERNAL ONLY · Contact remains HOLD · OUTBOUND READY: no</p>
        <p className="mt-1">
          Independent review verdict: {packet.verdict}. The saved verdict is preserved.
        </p>
        {packet.concerns.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer font-medium">
              Review notes ({packet.concerns.length})
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {packet.concerns.map((concern, index) => (
                <li key={index}>{concern}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <p className="mt-3 text-xs text-stone-600">
        These are the original saved drafts, not newly generated. Edits below stay in this browser
        session and do not change the saved packet.
      </p>
      <div className="mt-4 space-y-4">
        {emails.map((email, index) => (
          <article key={index} className="rounded-xl border border-line bg-cream/40 p-4">
            <h3 className="font-semibold">Email {index + 1}</h3>
            <label className="mt-3 block text-sm font-medium">
              Subject
              <input
                aria-label={`Email ${index + 1} subject`}
                className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2"
                value={email.subject}
                onChange={(event) =>
                  setEmails((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, subject: event.target.value } : item,
                    ),
                  )
                }
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Body
              <textarea
                aria-label={`Email ${index + 1} body`}
                className="mt-1 min-h-40 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 leading-6"
                value={email.body}
                onChange={(event) =>
                  setEmails((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, body: event.target.value } : item,
                    ),
                  )
                }
              />
            </label>
            <button className={`${button} mt-3`} onClick={() => void copy(index)}>
              <Copy className="h-4 w-4" /> Copy email {index + 1}
            </button>
          </article>
        ))}
      </div>
      {copyState && (
        <p role="status" className="mt-3 text-sm">
          {copyState}
        </p>
      )}
      <details className="mt-4 text-xs text-stone-600">
        <summary className="cursor-pointer font-medium">Advanced details</summary>
        <p className="mt-2">Saved packet ID: {packet.documentId}</p>
      </details>
    </section>
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
  intakeWindow = "TODAY",
  onIntakeWindow = () => {},
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
  intakeWindow?: IntakeWindow;
  onIntakeWindow?: (window: IntakeWindow) => void;
  notice?: string;
}) {
  const [query, setQuery] = useState("");
  const [emailReview, setEmailReview] = useState<{
    contactName: string;
    companyName: string;
    packet: NonNullable<DashboardProspect["savedInternalPacket"]>;
  } | null>(null);
  const [prepareContactId, setPrepareContactId] = useState<string | undefined>();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const build = getWorkforceBuildInfo();
  const prospect = data?.prospects.find((p) => p.contact.hubspotRecordId === contactId);
  const filtered =
    data?.prospects.filter((p) =>
      `${p.contact.fullName} ${p.contact.companyName ?? ""} ${p.contact.companyDomain ?? ""} ${p.contact.email ?? ""} ${p.contact.hubspotRecordId}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
    ) ?? [];
  useEffect(() => {
    const section = advancedRef.current;
    if (advancedOpen && prepareContactId && typeof section?.scrollIntoView === "function")
      section.scrollIntoView({ behavior: "smooth" });
  }, [advancedOpen, prepareContactId]);
  if (contactId)
    return (
      <div className="space-y-5" data-workforce-build={build ? JSON.stringify(build) : undefined}>
        {error && <p role="alert">{error}</p>}
        {!data ? (
          <p role="status">
            {error
              ? "Prospect evidence is unavailable. Restore access and reload to retry."
              : "Loading prospect evidence…"}
          </p>
        ) : prospect ? (
          <ProspectWorkspace
            prospect={prospect}
            runs={data.runs}
            onReview={onReview}
            onRefresh={onRefresh}
            busy={busy}
            localReadOnly={data.localReadOnly}
          />
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
    <div className="space-y-5" data-workforce-build={build ? JSON.stringify(build) : undefined}>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olive">
          Primelis Signal
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
          Daily prospect workspace
        </h1>
      </header>
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-line p-3 text-sm" role="status">
          {notice}
        </p>
      )}

      <section className={panel} aria-label="Connection Health">
        <h2 className="font-semibold">Connection Health</h2>
        {!data ? (
          <p className="mt-3 text-sm text-stone-600">Checking saved connection evidence…</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {(["HUBSPOT", "OUTREACH", "OPENAI"] as const).map((id) => {
              const integration = data.integrations.find((item) => item.id === id);
              if (!integration) return null;
              const status = compactConnectionStatus(integration);
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2"
                >
                  <span className="text-sm font-medium">
                    {id === "OPENAI" ? "AI" : integration.label}
                  </span>
                  <span
                    className={`text-sm font-semibold ${status === "Connected" ? "text-emerald-800" : status === "Needs attention" ? "text-amber-900" : "text-stone-600"}`}
                  >
                    {status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={panel} aria-label="Prospect List">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-olive" />
            Prospect List
          </h2>
          <button
            className={button}
            disabled={busy}
            onClick={onRefresh}
            aria-label="Refresh prospects"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <label className="relative mt-3 block">
          <span className="sr-only">Search prospects</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-stone-500" />
          <input
            className="min-h-11 w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-sm"
            placeholder="Search name or company"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!data ? (
          <p className="py-8 text-center text-sm text-stone-600" role="status">
            Loading prospects…
          </p>
        ) : !data.evidenceAvailable ? (
          <p className="py-6 text-sm text-stone-600">
            Prospect evidence is unavailable. Refresh after access is restored.
          </p>
        ) : !filtered.length ? (
          <p className="py-6 text-sm text-stone-600">No prospects in this view.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {filtered.map((item) => {
              const hasEmails = !!item.savedInternalPacket || item.draftReady;
              const saved = !!item.savedInternalPacket;
              return (
                <li
                  key={item.contact.hubspotRecordId}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-ink">{item.contact.fullName}</p>
                    <p className="mt-0.5 break-words text-sm text-stone-600">
                      {item.contact.companyName ?? "Company unknown"}
                    </p>
                    <p className="mt-2 text-xs text-stone-600">
                      Last evidenced outreach: {evidencedOutreachDate(item)}
                    </p>
                    <p className="mt-1 text-xs text-stone-600">
                      {saved
                        ? `${item.savedInternalPacket!.emails.length} saved drafts · ${item.savedInternalPacket!.verdict} · INTERNAL ONLY`
                        : item.draftReady
                          ? `${item.draftCount ?? 0} reviewed drafts · ready for human review`
                          : "0 saved drafts"}
                    </p>
                    <p
                      className={`mt-1 text-xs font-semibold ${item.plan.decision.status === "READY" ? "text-emerald-800" : "text-amber-900"}`}
                    >
                      {item.plan.decision.status === "READY"
                        ? "Eligible for review"
                        : `${label(item.plan.decision.status)} · sending blocked`}
                    </p>
                  </div>
                  {saved ? (
                    <button
                      className={button}
                      onClick={() =>
                        setEmailReview({
                          contactName: item.contact.fullName,
                          companyName: item.contact.companyName ?? "Company unknown",
                          packet: {
                            ...item.savedInternalPacket!,
                            concerns: [...item.savedInternalPacket!.concerns],
                            emails: item.savedInternalPacket!.emails.map((email) => ({ ...email })),
                          },
                        })
                      }
                    >
                      View emails
                    </button>
                  ) : hasEmails ? (
                    <Link
                      className={button}
                      href={`/sales-agent/prospects/${encodeURIComponent(item.contact.hubspotRecordId)}`}
                    >
                      View emails
                    </Link>
                  ) : (
                    <button
                      className={button}
                      onClick={() => {
                        setPrepareContactId(item.contact.hubspotRecordId);
                        setAdvancedOpen(true);
                      }}
                    >
                      Prepare
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {emailReview && (
        <SavedDraftReview
          key={emailReview.packet.documentId}
          {...emailReview}
          onClose={() => setEmailReview(null)}
        />
      )}

      <details
        ref={advancedRef}
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        className={panel}
      >
        <summary className="cursor-pointer font-semibold">Advanced details</summary>
        <div className="mt-4 space-y-5">
          {data?.localReadOnly && (
            <PreparationPanel onRefresh={onRefresh} preferredContactId={prepareContactId} />
          )}
          <section className="rounded-xl border border-line p-4" aria-label="Contact intake">
            <h3 className="font-semibold">Contact intake</h3>
            <label className="mt-2 block text-sm">
              Review window
              <select
                className="ml-2 rounded-lg border border-line p-2"
                value={intakeWindow}
                disabled={busy}
                onChange={(event) => onIntakeWindow(event.target.value as IntakeWindow)}
              >
                <option value="TODAY">Today</option>
                <option value="PAST_YEAR">Past 365 days · 10 at a time</option>
              </select>
            </label>
            <button className={`${button} mt-3`} disabled={busy} onClick={onCollect}>
              {busy
                ? "Working…"
                : hasNext
                  ? "Collect next page"
                  : intakeWindow === "TODAY"
                    ? "Collect today’s contacts"
                    : "Read 10 historical contacts"}
            </button>
          </section>
          <section
            className="rounded-xl border border-line p-4"
            aria-label="Connection diagnostics"
          >
            <h3 className="font-semibold">Connection diagnostics</h3>
            <ul className="mt-3 space-y-3">
              {data?.integrations.map((integration) => (
                <li
                  key={integration.id}
                  className="border-t border-line pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">{integration.label}</strong>
                    <Badge status={integration.status} />
                  </div>
                  <p className="mt-1 text-xs text-stone-600">{integration.detail}</p>
                  {integration.observedAt && (
                    <p className="mt-1 text-xs text-stone-600">Observed {integration.observedAt}</p>
                  )}
                  <IntegrationControls integration={integration} refresh={onRefresh} />
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-line p-4">
            <h3 className="font-semibold">Saved research runs</h3>
            {!data?.runs.length ? (
              <p className="mt-2 text-sm text-stone-600">No saved runs available.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {data.runs.map((run) => (
                  <li key={run.id} className="py-2">
                    <Link
                      className="text-sm underline"
                      href={`/sales-agent/runs/${encodeURIComponent(run.id)}`}
                    >
                      {run.intake.prospectName} · {run.intake.companyName} · {run.status}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-xl border border-line p-4">
            <h3 className="font-semibold">Eligibility and evidence details</h3>
            {data?.prospects.map((item) => (
              <details
                key={item.contact.hubspotRecordId}
                className="mt-3 border-t border-line pt-3"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {item.contact.fullName} · {item.plan.decision.status} ·{" "}
                  {item.plan.decision.reasons.length} reasons
                </summary>
                <ul className="mt-2 list-inside list-disc text-sm">
                  {item.plan.decision.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
                <Link
                  className="mt-2 inline-block text-sm underline"
                  href={`/sales-agent/prospects/${encodeURIComponent(item.contact.hubspotRecordId)}`}
                >
                  Open full evidence
                </Link>
              </details>
            ))}
            {data?.warnings.map((warning, index) => (
              <p key={index} className="mt-3 text-sm text-amber-900">
                {warning}
              </p>
            ))}
          </section>
          {!data?.localReadOnly && <DailyOperationsPanel />}
          <Link className="text-sm underline" href="/sales-agent/manual">
            Manual Research
          </Link>
          {data && (
            <p className="text-xs text-stone-500">
              Evidence refreshed {new Date(data.evaluatedAt).toLocaleString()} · Reviewed Today
              counts human reviews, not email sends or AI activity.
            </p>
          )}
          {notice && (
            <p role="status" className="text-xs">
              {notice}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
export function WorkforceDashboard({ contactId }: { contactId?: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [intakeWindow, setIntakeWindow] = useState<IntakeWindow>("TODAY");
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
      !data?.runs.some(
        (run) => run.status === "RUNNING" || run.prospectResearch?.status === "RUNNING",
      ) &&
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
            type === "COLLECT"
              ? { after: cursor, window: intakeWindow }
              : { action: "MARK_REVIEWED", contactId: id },
          ),
        },
      );
      if (response.redirected) throw Error("Sign in again to use the workspace");
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.message ?? "Request failed");
      if (type === "COLLECT") {
        setCursor(result.data.nextCursor);
        setNotice(
          `${result.data.collected} contacts collected. ${result.data.complete ? "Selected owner-scoped window is complete." : "Collection is partial. Review this batch before continuing; no additional contacts are implied."} ${result.data.warnings.join(" ")}`,
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
      intakeWindow={intakeWindow}
      onIntakeWindow={(value) => {
        setIntakeWindow(value);
        setCursor(undefined);
        setNotice("");
      }}
      notice={notice}
    />
  );
}
