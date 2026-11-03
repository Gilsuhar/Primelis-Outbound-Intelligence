import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/server";
import { requirePilotConfig } from "@/server/agent-workforce/company-queue/auth";
import { PrismaQueueStore } from "@/server/agent-workforce/company-queue/store";
export const dynamic = "force-dynamic";

export default async function CompanyQueuePage() {
  let config;
  try {
    config = requirePilotConfig();
  } catch {
    notFound();
  }
  const actor = await requireCurrentUser();
  if (actor.id !== config.actor) notFound();
  const state = await new PrismaQueueStore().read(actor.id);
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Signal Opportunity Research review queue</h1>
      <p>
        <strong>SIMULATED pilot — no live research or AI spending.</strong> Fixture findings are
        test data and cannot qualify contacts or authorize outreach.
      </p>
      <p>
        Sending and enrollment disabled. Future estimated limits: $1/day, $5/month, one provider
        call, zero retries.
      </p>
      <p>Last worker wake: {state.lastWorkerAt ?? "Not yet observed"}</p>
      <Link href="/sales-agent/company-queue" prefetch={false} className="underline">
        Refresh queue
      </Link>
      {!state.jobs.length && (
        <p>
          No queued fixtures. The separately enabled company worker will enqueue the approved
          fixture cohort after 09:00 Asia/Jerusalem.
        </p>
      )}
      {state.jobs.map((job) => (
        <section key={job.id} className="space-y-3 rounded border p-5">
          <h2 className="text-xl font-semibold">
            {job.run.input.companyName} — {job.status}
          </h2>
          <p>
            {job.mode} · {job.stage} · {job.checkpoints.length} saved checkpoints
          </p>
          {job.reason && <p>Attention required: {job.reason}</p>}
          {job.status === "COMPLETE" && (
            <>
              {job.signalReport && (
                <section className="space-y-3">
                  <h3 className="font-semibold">
                    Signal opportunity: {job.signalReport.eligibility} (simulation only)
                  </h3>
                  <p>
                    {job.signalReport.hypothesis ??
                      "No evidence-backed Signal hypothesis available."}
                  </p>
                  <p>
                    Proven savings: not established. Human sending and enrollment approval still
                    required.
                  </p>
                  <ul>
                    {job.signalReport.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  {job.signalReport.contact && (
                    <p>
                      {job.signalReport.contact.name} — {job.signalReport.contact.title}.{" "}
                      {job.signalReport.contact.reason}
                    </p>
                  )}
                  <h4>Review-only email drafts</h4>
                  {job.signalReport.emails.length ? (
                    job.signalReport.emails.map((m) => (
                      <article key={m.subject}>
                        <strong>{m.subject}</strong>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </article>
                    ))
                  ) : (
                    <p>HOLD — no emails generated.</p>
                  )}
                </section>
              )}
              <p>
                Research outcome: {job.run.status}. Grounding:{" "}
                {job.run.groundingAudit?.status ?? "Unavailable"}.
              </p>
              <h3 className="font-semibold">Accepted within this simulation</h3>
              {job.run.research.facts.length ? (
                job.run.research.facts.map((f) => (
                  <div key={f.id}>
                    <p>{f.statement}</p>
                    {f.quotes.map((q, i) => (
                      <blockquote key={i} className="border-l-2 pl-4">
                        {q.text}
                        <br />
                        <small>{q.sourceId}</small>
                      </blockquote>
                    ))}
                  </div>
                ))
              ) : (
                <p>No accepted findings.</p>
              )}
              <details>
                <summary>Grounding decisions and rejected candidates — not verified facts</summary>
                <pre className="whitespace-pre-wrap break-words text-sm">
                  {JSON.stringify(job.run.groundingAudit, null, 2)}
                </pre>
              </details>
              <details open>
                <summary>Independent Judgement report</summary>
                <pre className="whitespace-pre-wrap break-words text-sm">
                  {job.judgement
                    ? JSON.stringify(JSON.parse(job.judgement), null, 2)
                    : "Unavailable"}
                </pre>
              </details>
            </>
          )}
        </section>
      ))}
    </main>
  );
}
