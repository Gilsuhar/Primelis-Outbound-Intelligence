import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/server";
import examples from "@/data/fixtures/signal-opportunity-example.json";
import { headers } from "next/headers";
import { loadLocalProspectReview } from "@/server/agent-workforce/local-prospect-review";
import { ObservedProspectPanel } from "@/features/sales-agent/observed-prospect-panel";
import { InternalCompanyReview } from "@/features/agent-workforce/company-research/internal-review-client";
export const dynamic = "force-dynamic";
export default async function SignalOpportunityPage() {
  const user = await requireCurrentUser();
  const review = await loadLocalProspectReview(user.id, (await headers()).get("host"));
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Signal Opportunity Research</h1>
      <InternalCompanyReview />
      {review ? (
        <ObservedProspectPanel packet={review} />
      ) : (
        <p>No authorized local prospect snapshot loaded. No live eligibility is implied.</p>
      )}
      <h2 className="text-xl font-semibold">Separate fictional workflow demonstration</h2>
      <p>
        <strong>Offline demonstration only.</strong> All companies, metrics, ad observations, people
        and approval receipts below are synthetic. No live research, contact qualification or
        spending occurs on this page.
      </p>
      <p>
        Real-contact outbound readiness: HOLD. A licensed Similarweb data adapter, authorized dated
        SERP capture, independently verified Paid Search ownership and email, complete CRM/outbound
        history and human-approved Signal knowledge must be connected and validated separately.
      </p>
      <p>
        Company research is available independently of contact eligibility. Broad company context
        can inform hypotheses; it cannot substitute for missing paid-search or SERP evidence.
      </p>
      <Link href="/sales-agent/company-queue" className="underline">
        Isolated pilot review queue (requires separate Preview configuration)
      </Link>
      {examples.map(({ company, report: r, sources }) => (
        <section key={company} className="space-y-3 rounded border p-5">
          <h2 className="text-xl font-semibold">
            {company}: {r.eligibility} within simulation
          </h2>
          <p>
            Factual coverage: {r.judgement.factualCoverage}/100. Opportunity evidence coverage:{" "}
            {r.judgement.opportunityCoverage}/100. Neither score proves savings or authorizes
            outreach.
          </p>
          <ul>
            {r.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {r.insights.map((f) => (
            <article key={f.factId} className="space-y-2">
              <p>{f.statement}</p>
              {f.quotes.map((q) => (
                <blockquote key={q.sourceId} className="border-l-2 pl-4">
                  {q.text}
                  <p className="text-sm">
                    Synthetic source: {sources.find((s) => s.id === q.sourceId)?.url}
                  </p>
                </blockquote>
              ))}
            </article>
          ))}
          <p>
            {r.hypothesis ?? "No supported opportunity hypothesis."} Proven savings: not
            established.
          </p>
          <p>
            {r.contact
              ? `${r.contact.name} — ${r.contact.title}. ${r.contact.reason}`
              : "HOLD: no verified contact."}
          </p>
          <h3 className="font-semibold">Review-only email drafts</h3>
          {r.emails.length ? (
            r.emails.map((m) => (
              <article key={m.subject}>
                <h4>{m.subject}</h4>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </article>
            ))
          ) : (
            <p>No emails: strict gates have not passed.</p>
          )}
          <h3 className="font-semibold">Judgement and missing-data actions</h3>
          <ul>
            {[...r.judgement.reasons, ...r.judgement.missingDataActions].map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      ))}
      <p>
        Sending and enrollment disabled. Human approval remains mandatory. Historical Nike results
        are unchanged.
      </p>
    </main>
  );
}
