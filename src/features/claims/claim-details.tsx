import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { getClaimDetailsState } from "@/features/claims/queries";
import { formatEnumLabel, getSourceTypeLabel } from "@/lib/status";

export function ClaimDetails({ claimId }: { claimId: string }) {
  const details = getClaimDetailsState(claimId);

  if (details === "NOT_FOUND") {
    return (
      <div className="space-y-6">
        <BackLink />
        <section className="rounded-lg border border-line bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
            Claim details
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-ink">Claim not found</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            No development fixture claim exists for this ID.
          </p>
        </section>
      </div>
    );
  }

  const { claim, sources, warnings } = details;

  return (
    <div className="space-y-8">
      <BackLink />

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
              Claim safety
            </p>
            <h1 className="text-3xl font-semibold text-ink">{claim.title}</h1>
          </div>
          <StatusBadge status={claim.approvalStatus} />
        </div>
        <span className="inline-flex rounded-md border border-[#ead3a1] bg-[#fff7e8] px-3 py-2 text-xs font-semibold text-[#8a5a2b]">
          Development fixture data only
        </span>
      </section>

      {(warnings.missingSource || warnings.restricted || warnings.notApproved) && (
        <section className="space-y-2">
          {warnings.missingSource ? (
            <Warning message="This claim is missing source support and cannot be approved." />
          ) : null}
          {warnings.restricted ? (
            <Warning message="This claim is restricted and must not be used in standard generation workflows." />
          ) : null}
          {warnings.notApproved ? (
            <Warning message="This claim is not approved and must not be treated as approved factual knowledge." />
          ) : null}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Claim text</h2>
          <dl className="mt-5 space-y-5 text-sm">
            <Detail label="Exact claim text" value={claim.exactText} />
            <Detail label="Approved wording" value={claim.approvedWording ?? "Not approved yet"} />
            <Detail label="Usage restrictions" value={claim.usageRestrictions ?? "None listed"} />
            <Detail label="Internal notes" value={claim.internalNotes ?? "None listed"} />
          </dl>
        </div>

        <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Review context</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <Detail
              label="Allowed channels"
              value={claim.allowedChannels.map(formatEnumLabel).join(", ")}
            />
            <Detail label="Relevant personas" value={claim.personas.join(", ")} />
            <Detail label="Relevant industries" value={claim.industries.join(", ")} />
            <Detail label="Review owner" value={claim.reviewOwner} />
            <Detail label="Last reviewed" value={claim.lastReviewedDate ?? "Not reviewed"} />
          </dl>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Supporting sources</h2>
        {sources.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No supporting sources are attached.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {sources.map((source) => (
              <article className="rounded-md border border-line bg-[#fbfaf7] p-4" key={source.id}>
                <h3 className="font-semibold text-ink">{source.title}</h3>
                <p className="mt-1 text-sm text-stone-600">
                  {getSourceTypeLabel(source.sourceType)}
                </p>
                <p className="mt-2 text-sm text-stone-600">{source.description}</p>
                <p className="mt-3 text-xs font-medium text-stone-500">
                  Source date: {source.sourceDate ?? "Not provided"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Review history</h2>
        {claim.reviewHistory.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No review-history entries yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {claim.reviewHistory.map((entry) => (
              <article
                className="rounded-md border border-line bg-[#fbfaf7] p-4 text-sm"
                key={entry.id}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold text-ink">{entry.action}</p>
                  <p className="text-stone-500">
                    {new Date(entry.createdAt).toLocaleDateString("en-US")}
                  </p>
                </div>
                <p className="mt-2 text-stone-600">
                  {entry.actorName} · {formatEnumLabel(entry.actorRole)}
                </p>
                {entry.notes ? <p className="mt-2 text-stone-600">{entry.notes}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-ink"
      href="/knowledge-library"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Knowledge Library
    </Link>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">{label}</dt>
      <dd className="mt-1 leading-6 text-stone-700">{value}</dd>
    </div>
  );
}

function Warning({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#f0bd9d] bg-[#fff7ed] p-4 text-sm text-[#9a4b22]">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="font-medium">{message}</p>
    </div>
  );
}
