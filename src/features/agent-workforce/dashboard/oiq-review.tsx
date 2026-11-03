import React from "react";
import { oiqComponents, type OiqAssessment } from "../oiq-contracts";

function safeUrl(url: string | null) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? url : undefined;
  } catch {
    return undefined;
  }
}
export function OiqReview({
  assessment,
  historical = false,
}: {
  assessment?: OiqAssessment;
  historical?: boolean;
}) {
  return (
    <section
      aria-label="Outreach Insight Quality"
      className="mt-4 min-w-0 rounded-xl border border-line p-3 text-sm sm:p-4"
    >
      <h3 className="font-semibold">Outreach Insight Quality (OIQ)</h3>
      <p className="mt-1 text-xs text-stone-600">
        Editorial heuristic across this four-email thread, not a prediction of replies or meetings.
        Eligibility and suppression checks remain separate.
      </p>
      {!assessment ? (
        <p className="mt-3">
          OIQ not assessed for this content. Complete quality review before approval.
        </p>
      ) : (
        <>
          <p className="mt-3 font-semibold">
            {assessment.score}/100 · {assessment.decision.replaceAll("_", " ")}
          </p>
          {historical && (
            <p className="mt-2 text-amber-900">
              Historical assessment only. Edited content or changed eligibility/evidence requires a
              fresh review; this score cannot authorize outreach.
            </p>
          )}
          <p className="mt-2">Core insight: {assessment.coreInsight.summary}</p>
          {assessment.weakPersonalization && (
            <p className="mt-2 font-semibold text-amber-900">
              Weak personalization · interchangeable company-name messaging
            </p>
          )}
          <p className="mt-2">
            Company-name substitution test: {assessment.companySwapTest.reason}
          </p>
          <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
            {(Object.keys(oiqComponents) as (keyof typeof oiqComponents)[]).map((key) => (
              <div key={key} className="min-w-0 break-words">
                <dt className="font-medium">
                  {assessment.mode === "INSIGHT_LED" && key === "companyInsight"
                    ? "Professional insight specificity"
                    : assessment.mode === "INSIGHT_LED" && key === "verifiedEvidence"
                      ? "Approved knowledge grounding and accuracy"
                      : oiqComponents[key].label}
                </dt>
                <dd>
                  {assessment.components[key].score}/{oiqComponents[key].max} ·{" "}
                  {assessment.components[key].reason}
                </dd>
              </div>
            ))}
          </dl>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer font-medium">
              Core insight evidence references · {assessment.references.length}
            </summary>
            {!assessment.references.length && (
              <p>
                No traceable core-insight references. Review supporting research or approved
                knowledge.
              </p>
            )}
            {assessment.references.map((ref, i) => (
              <p
                className="mt-2 min-w-0 break-words text-xs"
                key={`${ref.id}:${ref.sourceId}:${i}`}
              >
                Email {ref.messageSteps.join(", ")} · {ref.kind} {ref.id} ·{" "}
                {safeUrl(ref.url) ? (
                  <a
                    className="break-all underline"
                    href={safeUrl(ref.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {ref.sourceId}
                  </a>
                ) : (
                  ref.sourceId
                )}{" "}
                ·{" "}
                {ref.observedAt
                  ? `observed ${ref.observedAt}`
                  : "approved knowledge registry; observation date not supplied"}
              </p>
            ))}
          </details>
          {assessment.blockingReasons.length > 0 && (
            <div className="mt-2 break-words text-amber-900">
              <h4 className="font-semibold">Approval blocked</h4>
              <ul className="mt-1 list-inside list-disc">
                {assessment.blockingReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
          <h4 className="mt-3 font-semibold">Concrete improvements</h4>
          {assessment.improvements.length ? (
            <ul className="mt-1 list-inside list-disc break-words">
              {assessment.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p>No improvements flagged. Human review is still required.</p>
          )}
          <p className="mt-3 text-xs text-stone-600">
            85–100: human quality review, subject to all gates. 65–84: revise. Below 65: blocked
            pending better research. Unsupported claims or missing core evidence block approval at
            any score.
          </p>
        </>
      )}
    </section>
  );
}
