"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  choiceHotelsContinuationId,
  internalDocumentSchema,
  type InternalCompanyDocument,
} from "./internal-review";

type ChoiceContinuationContact = { contactId: string; name: string };

export function automaticReviewState(result: NonNullable<InternalCompanyDocument["automatic"]>) {
  if (result.status === "RUNNING") {
    if (result.stage === "SEQUENCE") return "Drafting";
    if (result.stage === "QUALITY_REVIEW") return "Independent review";
    return "Researching";
  }
  if (result.status === "REVIEW_REQUIRED") return "Completed — human review required";
  if (result.issues.includes("EVIDENCE_REJECTED") || result.issues.includes("GROUNDING_REJECTED"))
    return "Evidence rejected — insufficient evidence for drafting";
  if (result.status === "NO_PITCH") return "Insufficient evidence — NO_PITCH";
  return "Blocked — execution incomplete";
}

export function AutomaticReview({
  result,
  suppliedProfile,
}: {
  result: NonNullable<InternalCompanyDocument["automatic"]>;
  suppliedProfile?: InternalCompanyDocument["suppliedProfile"];
}) {
  const run = result.run;
  const review = result.directReview ?? run?.critic;
  return (
    <div className="space-y-3">
      <h4 className="font-semibold">INTERNAL ONLY · {automaticReviewState(result)}</h4>
      {suppliedProfile && (
        <details>
          <summary>
            Supplied profile evidence · {suppliedProfile.status} · {suppliedProfile.source}
          </summary>
          <p>
            {suppliedProfile.name} · supplied {suppliedProfile.suppliedAt}
          </p>
          <pre className="whitespace-pre-wrap">{suppliedProfile.value}</pre>
          <p>SHA-256: {suppliedProfile.sha256}</p>
          <p>
            This input is provenance only and was not treated as independently verified evidence.
          </p>
        </details>
      )}
      {result.internalProfile && (
        <section aria-label="Profile verification">
          <h4>
            {result.internalProfile.name} · {result.internalProfile.label}
          </h4>
          <p>
            Independent profile verification: {result.internalProfile.verification} · eligibility
            HOLD.
          </p>
          {result.internalProfile.verifiedFacts.map((fact) => (
            <blockquote key={fact.evidenceId} className="border-l-2 pl-3">
              {fact.statement} — “{fact.supportingQuote}”{" "}
              <a className="underline" href={fact.sourceUrl} target="_blank" rel="noreferrer">
                Source
              </a>
            </blockquote>
          ))}
          {result.internalProfile.unresolved.map((item) => (
            <p key={item}>Unresolved: {item}</p>
          ))}
        </section>
      )}
      {result.status === "NO_PITCH" && (
        <p>NO_PITCH: no defensible approach cleared for drafting.</p>
      )}
      <p>
        Stage: {result.stage} · {result.modelCalls} model calls attempted · usage estimate $
        {result.usage.reduce((sum, u) => sum + (u.estimatedCostUsd ?? 0), 0).toFixed(4)}. Failed or
        uncertain calls may retain additional budget reservations.
      </p>
      {result.status === "RUNNING" && (
        <p>
          Running or interrupted. Refresh before submitting again. No automatic restart or retry
          occurs.
        </p>
      )}
      {result.issues.map((issue, i) => (
        <p key={i}>{issue}</p>
      ))}
      {result.reusedResearch && (
        <p>
          Reused verified research from run {result.reusedResearch.documentId} ·{" "}
          {result.reusedResearch.createdAt}. Only writing and independent review are new. No
          historical drafts reused.
        </p>
      )}
      {result.continuedResearch && (
        <p>
          Continuing saved evidence from run {result.continuedResearch.documentId} at independent
          grounding. No discovery or retrieval is repeated; the original rejection audit remains on
          that historical run.
        </p>
      )}
      <h4 className="font-semibold">
        {result.groundingAudit?.status === "ACCEPTED"
          ? "Source-backed findings"
          : "Research candidates — not yet independently verified"}
      </h4>
      {run?.research.facts.map((fact) => (
        <div key={fact.id}>
          <p>{fact.statement}</p>
          {fact.quotes.map((quote, i) => {
            const source = run.research.sources.find((s) => s.id === quote.sourceId);
            return (
              <blockquote key={i} className="border-l-2 pl-3">
                “{quote.text}”{" "}
                {source && (
                  <a className="underline" href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                )}
              </blockquote>
            );
          })}
          <p className="text-sm">{fact.limitations.join(" · ")}</p>
        </div>
      ))}
      <p>Independent grounding: {result.groundingAudit?.status ?? "NOT RUN"}</p>
      {!!result.groundingAudit?.reasonCodes.length && (
        <p>{result.groundingAudit.reasonCodes.join(", ")}</p>
      )}
      {!!result.rejectedEvidence?.length && (
        <details>
          <summary>Rejected candidates — excluded from findings and drafting</summary>
          {result.rejectedEvidence.map((candidate, index) => (
            <div key={index}>
              <p>
                {candidate.factId}: {candidate.statement}
              </p>
              <p>{candidate.reasons.join(" · ")}</p>
              {candidate.quotes.map((quote, i) => (
                <p key={i}>
                  Submitted quote (not verified): “{quote.text}” · {quote.sourceId} · exact match:{" "}
                  {quote.exactMatch ? "yes" : "no"}
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
      {!!result.quarantinedEvidence?.length && (
        <details>
          <summary>Quarantined quotations — omitted from surviving claim citations</summary>
          {result.quarantinedEvidence.map((candidate, index) => (
            <div key={index}>
              <p>
                {candidate.factId}: unchanged candidate claim: {candidate.statement}
              </p>
              <p>{candidate.reasons.join(" · ")}</p>
              {candidate.quotes.map((quote, i) => (
                <p key={i}>
                  Quarantined quote: “{quote.text}” · {quote.sourceId} · exact match: no
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
      {result.candidateGroundingAudit && (
        <details>
          <summary>Original independent review — only the supported subset was retained</summary>
          {result.candidateGroundingAudit.candidates.map((candidate) => (
            <p key={candidate.candidateId}>
              {candidate.factId ?? candidate.candidateId}: {candidate.reviewerDecision}
            </p>
          ))}
          {result.candidateGroundingAudit.reviewer?.concerns?.map((concern, i) => (
            <p key={i}>
              {concern.severity} · {concern.scope}: {concern.reason ?? "Explanation omitted"}
            </p>
          ))}
        </details>
      )}
      {result.screenshot && (
        <details>
          <summary>Checked screenshot — one observation, not persistent competition</summary>
          {(["query", "market", "device", "capturedAt"] as const).map((key) => (
            <p key={key}>
              {key}: {result.screenshot![key].value ?? "Unknown"} ({result.screenshot![key].basis})
            </p>
          ))}
          {!!result.screenshot.missingContext.length && (
            <p>
              Context still needed for snapshot-specific claims:{" "}
              {result.screenshot.missingContext.join(", ")}.
            </p>
          )}
          {result.screenshot.advertisers.map((a, i) => (
            <p key={i}>
              {a.displayName} · {a.placement} · {a.relationship}: {a.evidence}
            </p>
          ))}
          <p>{result.screenshot.limitation}</p>
        </details>
      )}
      {run?.strategy && (
        <>
          <h4 className="font-semibold">Selected hypothesis — not a proven result</h4>
          <p>{run.strategy.hypothesis}</p>
          <p>{run.strategy.companyRationale}</p>
          <p>Uncertainties: {run.strategy.uncertainties.join(" · ")}</p>
          <details>
            <summary>Other angles considered</summary>
            {run.strategy.alternatives.map((a, i) => (
              <p key={i}>
                <strong>{a.angle}:</strong> {a.reasonNotSelected}
              </p>
            ))}
          </details>
        </>
      )}
      {result.directDrafts && (
        <>
          <h4 className="font-semibold">Commercial approach — not a proven account problem</h4>
          <p>{result.directDrafts.approach}</p>
          <p>Limitations: {result.directDrafts.limitations.join(" · ")}</p>
        </>
      )}
      <h4 className="font-semibold">
        {result.internalContact
          ? `Four internal drafts · personalized for ${result.internalContact.displayName}`
          : "Four internal drafts · fictional recipient"}{" "}
        · not approved to send
      </h4>
      {result.internalContact && (
        <div>
          <p>
            INTERNAL REVIEW ONLY · contact eligibility remains {result.internalContact.eligibility}{" "}
            · OUTBOUND READY: no.
          </p>
          {result.internalContact.unresolved.map((item, index) => (
            <p key={index}>Unresolved: {item}</p>
          ))}
        </div>
      )}
      {!run?.sequence && !result.directDrafts && <p>No drafts generated. See blockers above.</p>}
      {result.directDrafts && (
        <>
          <p>
            {review
              ? `Independent review: ${review.verdict}. These are internal drafts, not approved outreach.`
              : "UNREVIEWED — factual and commercial review has not completed."}
          </p>
          {review?.unsupportedAssertions.length ? (
            <p>Unsupported claims flagged below. Do not use these drafts as verified facts.</p>
          ) : null}
          {result.directDrafts.emails.map((email, index) => (
            <div key={index} className="rounded border p-3">
              <h5>
                Email {index + 1}: {email.subject}
              </h5>
              <p className="whitespace-pre-wrap">{email.body}</p>
            </div>
          ))}
        </>
      )}
      {run?.sequence?.messages.map((email) => (
        <div key={email.step} className="rounded border p-3">
          <h5>
            Email {email.step}: {email.subject}
          </h5>
          <p className="whitespace-pre-wrap">{email.body}</p>
          <details>
            <summary>Internal evidence and purpose</summary>
            <p>{email.purpose}</p>
            <p>Facts: {email.supportingFactIds.join(", ") || "None"}</p>
            <p>
              Product references: {email.approvedKnowledgeIds.join(", ") || "None"} (internal only)
            </p>
          </details>
        </div>
      ))}
      <h4 className="font-semibold">Independent factual and commercial review</h4>
      {review ? (
        <>
          <p>{review.verdict} · Human review still required</p>
          {[...new Set([...review.unsupportedAssertions, ...review.concerns])].map((issue, i) => (
            <p key={i}>{issue}</p>
          ))}
        </>
      ) : (
        <p>NOT RUN — no independent quality clearance.</p>
      )}
      <details>
        <summary>Product context and research limitations</summary>
        {run?.knowledge.map((k) => (
          <p key={k.id}>
            {k.text} Source: {k.sourceIds.join(", ")}. {k.restrictions}
          </p>
        ))}
        {run?.research.gaps.map((gap, i) => (
          <p key={i}>{gap}</p>
        ))}
      </details>
    </div>
  );
}

export function InternalCompanyReview({ initialCompany = "" }: { initialCompany?: string }) {
  const [company, setCompany] = useState(initialCompany);
  const [profileName, setProfileName] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [profileText, setProfileText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<InternalCompanyDocument[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [reuseSaved, setReuseSaved] = useState(true);
  const [continueChoice, setContinueChoice] = useState(false);
  const [continuationContactId, setContinuationContactId] = useState("");
  const [choiceContacts, setChoiceContacts] = useState<ChoiceContinuationContact[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const hasSubmitted = useRef(false);
  const submission = useRef<{ company: string; previousIds: Set<string> } | null>(null);
  const normalizedCompany = company
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
  const reusable =
    !file &&
    documents.find(
      (doc) =>
        doc.automatic?.groundingAudit?.status === "ACCEPTED" &&
        doc.automatic.status !== "RUNNING" &&
        [
          doc.company.toLowerCase(),
          doc.automatic.run?.intake.companyDomain.replace(/^www\./, ""),
          doc.automatic.run?.intake.companyName.toLowerCase(),
        ].includes(normalizedCompany),
    );
  const choiceContinuation = documents.find(
    (doc) =>
      doc.id === choiceHotelsContinuationId &&
      doc.automatic?.status === "NO_PITCH" &&
      doc.automatic.modelCalls === 4 &&
      doc.owner.length > 0,
  );
  const choiceInputMatches = [
    "choice hotels",
    "choice hotels international, inc.",
    "media.choicehotels.com",
  ].includes(normalizedCompany);
  const useChoiceContinuation =
    continueChoice && !!choiceContinuation && choiceInputMatches && !file;
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/sales-agent/company-research/internal", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message ?? "Review unavailable");
      const received = internalDocumentSchema.array().parse(data.documents);
      setDocuments(received);
      const pending = submission.current;
      if (pending) {
        const current = received.find(
          (doc) => doc.company === pending.company && !pending.previousIds.has(doc.id),
        );
        if (current) setCurrentId(current.id);
      } else if (!hasSubmitted.current) {
        setCurrentId(
          (previous) =>
            previous ??
            received.find(
              (doc) =>
                doc.automatic &&
                (!initialCompany ||
                  [
                    doc.company.toLowerCase(),
                    doc.automatic.run?.intake.companyDomain.toLowerCase(),
                    doc.automatic.run?.intake.companyName.toLowerCase(),
                  ].includes(initialCompany.trim().toLowerCase())),
            )?.id ??
            null,
        );
      }
      setAiReady(data.aiReady === true);
    } catch {
      setNotice("Company review requires the authenticated localhost workspace.");
    }
  }, [initialCompany]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    let active = true;
    void fetch("/api/sales-agent/dashboard/prepare", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const items = Array.isArray(data?.data?.items) ? data.data.items : [];
        const contacts = items.flatMap((item: Record<string, unknown>) => {
          const context = item.contactDraftContext as Record<string, unknown> | undefined;
          const companyName = typeof context?.companyName === "string" ? context.companyName : "";
          const normalized = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            !["choicehotels", "choicehotelsinternational", "choicehotelsinternationalinc"].includes(
              normalized,
            ) ||
            typeof context?.contactId !== "string" ||
            typeof context.displayName !== "string"
          )
            return [];
          return [{ contactId: context.contactId, name: context.displayName }];
        });
        if (active) setChoiceContacts(contacts);
      })
      .catch(() => {
        if (active) setChoiceContacts([]);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [busy, refresh]);
  return (
    <section className="space-y-4 rounded border p-5">
      <h2 className="text-xl font-semibold">Research any company</h2>
      <p>
        No CRM record or eligible contact required. Company research and outbound clearance are
        separate.
      </p>
      <p className="text-sm">
        {aiReady
          ? "Local AI configured · $1/day · $5/month · one provider call at a time · zero retries. Research discovers sources, compares opportunities, writes four internal emails and independently reviews them."
          : "AI setup is not active. Research currently retrieves public text only; writing requires the one-time local API setup and spending approval."}
      </p>
      <form
        className="grid max-w-xl gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          if (profileUrl.trim() && profileText.trim()) {
            setNotice("Use either a LinkedIn URL or pasted profile text, not both.");
            return;
          }
          if ((profileUrl.trim() || profileText.trim()) && !profileName.trim()) {
            setNotice("Enter the person's name when supplying profile material.");
            return;
          }
          setBusy(true);
          setCurrentId(null);
          setShowHistory(false);
          hasSubmitted.current = true;
          submission.current = {
            company: company.trim(),
            previousIds: new Set(documents.map((d) => d.id)),
          };
          setNotice(
            useChoiceContinuation
              ? continuationContactId
                ? "Continuing saved Choice Hotels evidence for the selected HubSpot contact — INTERNAL ONLY; eligibility remains HOLD. No discovery or retrieval will repeat."
                : "Continuing saved Choice Hotels evidence for a generic fictional recipient — discovery and retrieval will not repeat."
              : "Researching — this submission has no generated drafts yet.",
          );
          try {
            let image;
            if (file) {
              if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 2_000_000)
                throw new Error("Use a PNG or JPEG under 2 MB.");
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(",")[1]);
                reader.onerror = () => reject(new Error("Image could not be read"));
                reader.readAsDataURL(file);
              });
              image = { mime: file.type, base64 };
            }
            const response = await fetch("/api/sales-agent/company-research/internal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                company,
                ...(profileUrl.trim() || profileText.trim()
                  ? {
                      profile: {
                        name: profileName.trim(),
                        ...(profileUrl.trim()
                          ? { linkedinUrl: profileUrl.trim() }
                          : { text: profileText }),
                      },
                    }
                  : {}),
                ...(image ? { image } : {}),
                ...(useChoiceContinuation && choiceContinuation
                  ? {
                      continueResearchId: choiceContinuation.id,
                      ...(continuationContactId
                        ? { continueContactId: continuationContactId }
                        : {}),
                    }
                  : reusable && reuseSaved
                    ? { reuseResearchId: reusable.id }
                    : {}),
              }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.message ?? "Research unavailable");
            const doc = internalDocumentSchema.parse(data.document);
            submission.current = null;
            setDocuments((current) => [doc, ...current.filter((d) => d.id !== doc.id)]);
            setCurrentId(doc.id);
            setNotice(
              doc.automatic
                ? `${automaticReviewState(doc.automatic)}. All drafts remain internal and require human review.`
                : doc.execution
                  ? "Execution finished with blockers. Retrieved text and stage outcomes are shown below; no drafts are approved."
                  : "No execution receipt returned. Research completion is unverified.",
            );
          } catch (error) {
            setNotice(error instanceof Error ? error.message : "Research unavailable");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Company name or domain
          <input
            className="block w-full rounded border p-2"
            required
            maxLength={240}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company name or example.com"
          />
        </label>
        <fieldset className="space-y-2 rounded border p-3">
          <legend>Optional professional profile — internal personalization only</legend>
          <label className="block">
            Person&apos;s name
            <input
              className="block w-full rounded border p-2"
              maxLength={180}
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Alice De Benetti"
            />
          </label>
          <label className="block">
            LinkedIn profile URL (or use the text field below)
            <input
              className="block w-full rounded border p-2"
              type="url"
              maxLength={500}
              value={profileUrl}
              onChange={(event) => setProfileUrl(event.target.value)}
              placeholder="https://www.linkedin.com/in/…"
            />
          </label>
          <label className="block">
            Or paste professional profile text
            <textarea
              className="block w-full rounded border p-2"
              rows={3}
              maxLength={12_000}
              value={profileText}
              onChange={(event) => setProfileText(event.target.value)}
              placeholder="Paste profile text to help locate independent public sources"
            />
          </label>
          <p className="text-sm">
            Supplied material is retained with its source and timestamp as UNVERIFIED user input.
            The name and optional LinkedIn URL can guide public-source lookup; pasted text itself is
            not evidence. Only independently retrieved and grounded facts may personalize drafts. No
            CRM record or email is created, and any drafts remain INTERNAL ONLY / NOT OUTBOUND
            READY.
          </p>
        </fieldset>
        {reusable && (
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={reuseSaved}
              onChange={(e) => setReuseSaved(e.target.checked)}
            />{" "}
            Use saved grounded research from {reusable.createdAt}. Research will generate four NEW
            internal emails and independently review them (at most two model calls); no repeated
            research or strategy.
          </label>
        )}
        {choiceContinuation && choiceInputMatches && (
          <div className="space-y-2 text-sm">
            <label className="block">
              <input
                type="checkbox"
                checked={continueChoice}
                disabled={!!file}
                onChange={(event) => setContinueChoice(event.target.checked)}
              />{" "}
              Continue the saved Choice Hotels evidence from independent grounding (claims 4–6
              only). No discovery or source retrieval will repeat; up to three model calls may be
              used.
            </label>
            {continueChoice && (
              <label className="block">
                Optional HubSpot contact link — internal drafts only; contact remains HOLD
                <select
                  className="block w-full rounded border p-2"
                  aria-label="HubSpot contact for internal-only drafts"
                  value={continuationContactId}
                  onChange={(event) => setContinuationContactId(event.target.value)}
                >
                  <option value="">Generic fictional recipient</option>
                  {choiceContacts.map((contact) => (
                    <option key={contact.contactId} value={contact.contactId}>
                      {contact.name} — HOLD
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        <label>
          Optional Google SERP screenshot
          <input
            className="block"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="text-sm">
          Keep sponsored labels and Google&apos;s location footer visible if possible. A VPN
          connection and upload time do not establish search location or capture time. With AI
          enabled, the image is sent to the configured model for analysis and independent checking.
          Unknown context stays unknown; the original image remains locally.
        </p>
        <button className="min-h-11 rounded border p-2" disabled={busy}>
          {busy ? "Researching and preparing review…" : "Research"}
        </button>
      </form>
      <p role="status">{notice}</p>
      <button type="button" className="underline" onClick={() => void refresh()}>
        Refresh internal reviews
      </button>
      {!currentId && (
        <p>No result for the current submission. Historical drafts are not current output.</p>
      )}
      <button
        type="button"
        className="underline"
        onClick={() => setShowHistory(!showHistory)}
        aria-expanded={showHistory}
      >
        {showHistory
          ? "Hide historical runs and demonstrations"
          : "Show historical runs and demonstrations"}
      </button>
      {[...documents]
        .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId))
        .filter((doc) => doc.id === currentId || showHistory)
        .map((doc) => (
          <article key={doc.id} className="space-y-3 border-t pt-4">
            <p className="font-semibold">
              {doc.id === currentId
                ? "Current research run"
                : "Historical record — not generated by the current submission"}
            </p>
            <p>
              Run {doc.id} · {doc.createdAt}
            </p>
            <h3 className="text-lg font-semibold">{doc.company} — internal company review</h3>
            <p>Research permitted · Contact clearance: HOLD · Sending and enrollment disabled</p>
            {doc.automatic && (
              <AutomaticReview result={doc.automatic} suppliedProfile={doc.suppliedProfile} />
            )}
            {doc.execution && (
              <div className="space-y-3">
                <h4 className="font-semibold">Automatic execution — BLOCKED before drafting</h4>
                <p>
                  {doc.execution.startedAt} — {doc.execution.completedAt}
                </p>
                {doc.execution.stages.map((stage) => (
                  <div key={stage.stage}>
                    <p>
                      <strong>
                        {stage.stage.replaceAll("_", " ")}: {stage.status}
                      </strong>{" "}
                      · {stage.code}
                    </p>
                    <p>{stage.detail}</p>
                  </div>
                ))}
                <h4 className="font-semibold">Retrieved source text — not validated findings</h4>
                {doc.execution.sources.length === 0 && (
                  <p>No usable public source was retrieved.</p>
                )}
                {doc.execution.sources.map((source) => (
                  <details key={source.url}>
                    <summary>
                      {source.title} · {source.text.length} characters
                    </summary>
                    <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                      {source.url}
                    </a>
                    <p>Retrieved {source.retrievedAt}</p>
                    <p className="break-all text-xs">SHA-256: {source.sha256}</p>
                    <blockquote className="whitespace-pre-wrap border-l-2 pl-3">
                      {source.text}
                    </blockquote>
                  </details>
                ))}
                <p>
                  Candidate angles and four internal drafts: NOT GENERATED. Independent Grounding
                  and quality review: NOT RUN.
                </p>
              </div>
            )}
            {doc.image && (
              <details>
                <summary>Original screenshot evidence</summary>
                {/* The bounded local raster is evidence, not a remote image or executable SVG. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${doc.image.mime};base64,${doc.image.base64}`}
                  alt={`Original SERP evidence for ${doc.company}`}
                  className="max-w-full"
                />
                <p className="break-all text-xs">SHA-256: {doc.image.sha256}</p>
              </details>
            )}
            {doc.execution || doc.automatic ? null : !doc.review ? (
              <p>
                Historical saved intake only; no execution receipt. No automatic research or
                background worker was started for this document.
              </p>
            ) : (
              <>
                <p className="font-semibold">
                  Historical agent-assisted review — not an automatic UI execution
                </p>
                <p>{doc.review.summary}</p>
                <p>{doc.review.conclusion.replaceAll("_", " ")} · Generic recipient only</p>
                <h4 className="font-semibold">Observed evidence — not independently grounded</h4>
                {doc.review.evidence.map((e) => (
                  <div key={e.id}>
                    <p>{e.statement}</p>
                    <blockquote className="border-l-2 pl-3">{e.quote}</blockquote>
                    <a className="underline" href={e.url} target="_blank" rel="noreferrer">
                      {e.id}: source
                    </a>
                    <p className="text-sm">
                      {e.observedAt} · {e.limitation}
                    </p>
                  </div>
                ))}
                {doc.review.screenshot && (
                  <div>
                    <h4 className="font-semibold">Screenshot observation</h4>
                    {(["query", "market", "device", "capturedAt"] as const).map((key) => (
                      <p key={key}>
                        {key}: {doc.review!.screenshot![key].value ?? "Unknown"} (
                        {doc.review!.screenshot![key].basis})
                      </p>
                    ))}
                    {!!doc.review.screenshot.missingContext.length && (
                      <p>
                        Only context still needed: {doc.review.screenshot.missingContext.join(", ")}
                        .
                      </p>
                    )}
                    {doc.review.screenshot.advertisers.map((a, i) => (
                      <p key={i}>
                        {a.displayName} · {a.placement} · {a.relationship}: {a.evidence}
                      </p>
                    ))}
                    <p>{doc.review.screenshot.limitation}</p>
                  </div>
                )}
                <h4 className="font-semibold">Candidate commercial angles</h4>
                {doc.review.angles.map((a) => (
                  <div key={a.id}>
                    <p>
                      <strong>{a.title}</strong> · {a.decision}
                    </p>
                    <p>Hypothesis: {a.hypothesis}</p>
                    <p>{a.reason}</p>
                    <p>Limitations: {a.limitations}</p>
                    <p>Evidence: {a.evidenceIds.join(", ")}</p>
                  </div>
                ))}
                <h4 className="font-semibold">Internal writing examples — NOT outbound-ready</h4>
                <p>{doc.review.recipient}. No real-contact personalization or clearance.</p>
                {doc.review.emails.map((e, i) => (
                  <div key={i} className="rounded border p-3">
                    <h5>
                      Email {i + 1}: {e.subject}
                    </h5>
                    <p className="whitespace-pre-wrap">{e.body}</p>
                    <p className="text-sm">
                      Internal purpose: {e.intent} · Evidence:{" "}
                      {e.evidenceIds.join(", ") || "No factual assertion"}
                    </p>
                  </div>
                ))}
                <p>Independent Grounding: NOT RUN · Independent semantic quality review: NOT RUN</p>
                <p>Writer&apos;s assessment (not independent): {doc.review.writerAssessment}</p>
                <ul>
                  {doc.review.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
    </section>
  );
}
