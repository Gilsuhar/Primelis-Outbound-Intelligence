"use client";
import React, { useState } from "react";
import type { DailyReviewRow } from "@/server/services/sales-agent-collection-service";
import { researchKinds, type DraftResearch } from "./draft-engine";
import { DEMO_LABEL } from "./demo-fixtures";

export function DraftReview({
  row,
  demo,
  onSaved,
}: {
  row: DailyReviewRow;
  demo: boolean;
  onSaved: () => Promise<void>;
}) {
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<DraftResearch["kind"]>("COMPANY_FACT");
  const [saving, setSaving] = useState(false);
  const drafting = row.drafting;
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const text = (name: string) => String(fields.get(name) ?? "");
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/sales-agent/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `${row.contact.hubspotRecordId}:${kind}`,
          contactId: row.contact.hubspotRecordId,
          companyDomain: row.contact.companyDomain,
          kind,
          text: text("text"),
          sourceUrl: text("sourceUrl"),
          observedAt: text("observedAt"),
          verifiedAt: null,
          manuallyVerified: fields.has("verified"),
          approvedForOutbound: fields.has("approved"),
          ...(kind === "CASE_STUDY" ? { caseStudyId: text("caseStudyId") } : {}),
          ...(kind === "SERP"
            ? {
                keyword: text("keyword"),
                market: text("market"),
                device: text("device"),
                screenshotUrl: text("screenshotUrl"),
                searchEngine: "GOOGLE",
              }
            : {}),
        }),
      });
      const result = await response.json();
      if (response.redirected || !response.ok || !result.ok)
        throw new Error(result.message || "Research was not saved");
      await onSaved();
      setNotice("Research saved locally. Qualification and draft evidence have been rechecked.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Research was not saved");
    } finally {
      setSaving(false);
    }
  }
  async function copy(email: NonNullable<typeof drafting>["emails"][number]) {
    try {
      await navigator.clipboard.writeText(
        `${demo ? `${DEMO_LABEL}\n\n` : ""}DRAFT FOR HUMAN REVIEW — NOT APPROVED\nSubject: ${email.subject}\n\n${email.body}\n\n${email.cta}`,
      );
      setNotice(`Email ${email.step} copied for review.`);
    } catch {
      setNotice("Clipboard unavailable. Select the draft text and copy it manually.");
    }
  }
  // Older saved API clients may not yet include the newly derived drafting view.
  if (!drafting) return <p>Refresh saved review to generate the drafting view.</p>;
  return (
    <section className="space-y-4" aria-label={`Draft review for ${row.contact.fullName}`}>
      <h3 className="font-semibold">Four-email drafts — {drafting.status}</h3>
      <p>
        One email thread; suggested days 1, 4, 9 and 15. These are review drafts, not scheduled
        messages. Human approval is required and has not been granted.
      </p>
      {drafting.status === "BLOCKED" && (
        <p>
          Drafting is blocked by qualification. Resolve the requirements above; manual research
          cannot clear suppression or contact-history restrictions.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {drafting.emails.map((email) => (
          <div key={email.step} className="min-w-0 space-y-2 rounded border p-3">
            <h4 className="font-semibold">
              Email {email.step} · Day {email.day}: {email.angle}
            </h4>
            <p>
              {email.status === "REQUIRES_RESEARCH"
                ? "HOLD — research required"
                : "Pending human review"}{" "}
              · {email.threadMode === "NEW_THREAD" ? "Start thread" : "Reply to email 1"}
            </p>
            <p>Subject: {email.subject}</p>
            <p className="whitespace-pre-wrap break-words">{email.body}</p>
            <p>{email.cta}</p>
            {email.missingEvidence.length > 0 && <p>Missing: {email.missingEvidence.join(", ")}</p>}
            {email.sources.map((source) => (
              <p className="break-words text-sm" key={source.id}>
                <a className="underline" href={source.url} target="_blank" rel="noreferrer">
                  Source: {source.id}
                </a>{" "}
                · verified {source.verifiedAt}
              </p>
            ))}
            <button
              className="rounded border px-3 py-2 disabled:opacity-50"
              disabled={email.status === "REQUIRES_RESEARCH"}
              onClick={() => void copy(email)}
            >
              Copy email {email.step} for review
            </button>
          </div>
        ))}
      </div>
      <details>
        <summary>Draft research: verified findings and missing evidence</summary>
        <ul className="space-y-3 py-3">
          {drafting.findings.map((finding) => (
            <li key={finding.kind}>
              <strong>
                {finding.kind}: {finding.status}
              </strong>
              <p>{finding.reason}</p>
              {finding.evidence.map((entry) => (
                <div className="break-words" key={entry.id}>
                  <p>{entry.text}</p>
                  <a className="underline" href={entry.sourceUrl} target="_blank" rel="noreferrer">
                    Research source
                  </a>
                  <p>
                    Observed {entry.observedAt} · human verified {entry.verifiedAt ?? "No"} ·{" "}
                    {entry.companyDomain}
                  </p>
                  {entry.screenshotUrl && (
                    <a
                      className="underline"
                      href={entry.screenshotUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Google screenshot — {entry.keyword}, {entry.market}, {entry.device}
                    </a>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </details>
      {!demo && row.contact.companyDomain && (
        <details>
          <summary>Add or update manually reviewed research</summary>
          <p>
            Use source wording that is suitable for an email. Check it yourself before attesting.
            Case-study wording and every metric need approval for outbound. This does not verify
            qualification. Research is retained for the same contact and company during
            recollection, and rechecked for expiry.
          </p>
          <form onSubmit={(event) => void save(event)} className="grid gap-3 py-3 sm:grid-cols-2">
            <label>
              Research kind
              <select
                name="kind"
                className="block w-full rounded border p-2"
                value={kind}
                onChange={(event) => setKind(event.target.value as DraftResearch["kind"])}
              >
                {researchKinds.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              HTTPS source URL
              <input
                className="block w-full rounded border p-2"
                name="sourceUrl"
                type="url"
                required
                maxLength={1000}
              />
            </label>
            <label className="sm:col-span-2">
              Verified email-ready wording
              <textarea
                className="block w-full rounded border p-2"
                name="text"
                required
                minLength={10}
                maxLength={240}
              />
            </label>
            <label>
              Observation time (ISO 8601 with timezone)
              <input
                className="block w-full rounded border p-2"
                name="observedAt"
                placeholder="2026-10-15T08:00:00Z"
                required
              />
            </label>
            {kind === "SERP" && (
              <>
                <label>
                  Google branded keyword
                  <input
                    className="block w-full rounded border p-2"
                    name="keyword"
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Market
                  <input
                    className="block w-full rounded border p-2"
                    name="market"
                    required
                    maxLength={100}
                  />
                </label>
                <label>
                  Device
                  <select className="block w-full rounded border p-2" name="device">
                    <option>desktop</option>
                    <option>mobile</option>
                    <option>tablet</option>
                  </select>
                </label>
                <label>
                  HTTPS Google screenshot URL
                  <input
                    className="block w-full rounded border p-2"
                    name="screenshotUrl"
                    type="url"
                    required
                  />
                </label>
              </>
            )}
            <label className="sm:col-span-2">
              <input name="verified" type="checkbox" required /> I personally checked this source
              and its wording against the current contact and company.
            </label>
            {kind === "CASE_STUDY" && (
              <label>
                Approved case-study library ID
                <input
                  className="block w-full rounded border p-2"
                  name="caseStudyId"
                  required
                  maxLength={200}
                />
              </label>
            )}
            {kind === "CASE_STUDY" && (
              <label className="sm:col-span-2">
                <input name="approved" type="checkbox" required /> This exact case-study wording,
                including any metrics, is approved for outbound use.
              </label>
            )}
            <button className="rounded border px-3 py-2" disabled={saving}>
              {saving ? "Saving…" : "Save local research"}
            </button>
          </form>
        </details>
      )}
      {demo && <p>Fictional research is simulated. It cannot be saved to live evidence.</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
