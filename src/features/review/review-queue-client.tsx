"use client";

import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import {
  fixtureUsers,
  knowledgeSubmissionFixtures,
  sourceDocumentFixtures,
} from "@/data/fixtures/knowledge-fixtures";
import { filterReviewSubmissions } from "@/features/knowledge/filtering";
import {
  approvalStatuses,
  knowledgeTypes,
  type ApprovalStatus,
  type FixtureUser,
  type KnowledgeSubmissionFixture,
  type ReviewQueueFilters,
} from "@/features/knowledge/types";
import { applyReviewAction } from "@/features/review/actions";
import { getTransitionError, type ReviewAction } from "@/features/review/status-transition";
import { canSeeReviewActions } from "@/lib/permissions";
import { formatEnumLabel, getKnowledgeTypeLabel, getSourceTypeLabel } from "@/lib/status";

const defaultFilters: ReviewQueueFilters = {
  approvalStatus: "ALL",
  knowledgeType: "ALL",
  sourcePresence: "ALL",
};

const actionButtons: Array<{ label: string; status: ApprovalStatus; action: ReviewAction }> = [
  { label: "Approve", status: "APPROVED", action: "APPROVE" },
  { label: "Restrict", status: "RESTRICTED", action: "RESTRICT" },
  { label: "Reject", status: "REJECTED", action: "REJECT" },
  { label: "Archive", status: "ARCHIVED", action: "ARCHIVE" },
  { label: "Send back for review", status: "NEEDS_REVIEW", action: "RETURN_TO_REVIEW" },
];

export function ReviewQueueClient({
  initialSubmissions = knowledgeSubmissionFixtures,
  adapterMode = "fixture",
}: {
  initialSubmissions?: KnowledgeSubmissionFixture[];
  adapterMode?: "fixture" | "prisma";
}) {
  const [viewer, setViewer] = useState<FixtureUser>(fixtureUsers[1]);
  const [filters, setFilters] = useState<ReviewQueueFilters>(defaultFilters);
  const [submissions, setSubmissions] = useState<KnowledgeSubmissionFixture[]>(initialSubmissions);
  const [expandedId, setExpandedId] = useState<string | null>(initialSubmissions[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);

  const filteredSubmissions = useMemo(
    () => filterReviewSubmissions(submissions, filters),
    [filters, submissions],
  );

  function updateSubmissionAction(
    submission: KnowledgeSubmissionFixture,
    toStatus: ApprovalStatus,
  ) {
    const result = applyReviewAction(submission, viewer, toStatus);

    if (!result.ok) {
      setMessage(result.reason);
      return;
    }

    setSubmissions((current) =>
      current.map((item) => (item.id === submission.id ? result.submission : item)),
    );
    setMessage(`${submission.title} moved to ${formatEnumLabel(toStatus)}.`);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          Knowledge admin
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-ink">Review Queue</h1>
            <p className="max-w-2xl text-sm leading-6 text-stone-600">
              Review generic fixture submissions, inspect source presence, and record local review
              history entries.
            </p>
          </div>
          <span className="w-fit rounded-md border border-[#ead3a1] bg-[#fff7e8] px-3 py-2 text-xs font-semibold text-[#8a5a2b]">
            {adapterMode === "prisma" ? "Database mode" : "Development fixture data"}
          </span>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-sm lg:grid-cols-4">
        <label className="space-y-1 text-sm font-medium text-stone-700">
          Fixture viewer
          <select
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
            onChange={(event) =>
              setViewer(
                fixtureUsers.find((user) => user.id === event.target.value) ?? fixtureUsers[0],
              )
            }
            value={viewer.id}
          >
            {fixtureUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} - {formatEnumLabel(user.role)}
              </option>
            ))}
          </select>
        </label>
        <FilterSelect
          label="Status"
          onChange={(value) =>
            setFilters({
              ...filters,
              approvalStatus: value as ReviewQueueFilters["approvalStatus"],
            })
          }
          options={approvalStatuses.map((status) => [status, formatEnumLabel(status)])}
          value={filters.approvalStatus}
        />
        <FilterSelect
          label="Knowledge type"
          onChange={(value) =>
            setFilters({ ...filters, knowledgeType: value as ReviewQueueFilters["knowledgeType"] })
          }
          options={knowledgeTypes.map((type) => [type, getKnowledgeTypeLabel(type)])}
          value={filters.knowledgeType}
        />
        <FilterSelect
          label="Source presence"
          onChange={(value) =>
            setFilters({
              ...filters,
              sourcePresence: value as ReviewQueueFilters["sourcePresence"],
            })
          }
          options={[
            ["WITH_SOURCE", "With source"],
            ["MISSING_SOURCE", "Missing source"],
          ]}
          value={filters.sourcePresence}
        />
      </section>

      {message ? (
        <section className="rounded-lg border border-line bg-white p-4 text-sm text-stone-700 shadow-sm">
          {message}
        </section>
      ) : null}

      <section className="space-y-3">
        {filteredSubmissions.length === 0 ? (
          <div className="rounded-lg border border-line bg-white p-8 text-sm text-stone-600">
            No fixture submissions match the current filters.
          </div>
        ) : (
          filteredSubmissions.map((submission) => (
            <article
              className="rounded-lg border border-line bg-white shadow-sm"
              key={submission.id}
            >
              <button
                className="flex w-full flex-col gap-3 p-4 text-left lg:grid lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] lg:items-center"
                onClick={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
                type="button"
              >
                <span>
                  <span className="block font-semibold text-ink">{submission.title}</span>
                  <span className="mt-1 block text-xs font-medium text-stone-500">
                    {formatEnumLabel(submission.submitterRole)}
                  </span>
                </span>
                <span className="text-sm text-stone-700">
                  {getKnowledgeTypeLabel(submission.knowledgeType)}
                </span>
                <StatusBadge status={submission.approvalStatus} />
                <span className="text-sm text-stone-700">
                  {submission.sourceIds.length > 0 ? "Source attached" : "Missing source"}
                </span>
                <span className="text-sm text-stone-600">
                  {new Date(submission.submittedAt).toLocaleDateString("en-US")}
                </span>
                {expandedId === submission.id ? (
                  <ChevronUp aria-hidden="true" className="h-4 w-4 text-stone-500" />
                ) : (
                  <ChevronDown aria-hidden="true" className="h-4 w-4 text-stone-500" />
                )}
              </button>

              {expandedId === submission.id ? (
                <ReviewDetails
                  onAction={(status) => updateSubmissionAction(submission, status)}
                  submission={submission}
                  viewer={viewer}
                />
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function ReviewDetails({
  submission,
  viewer,
  onAction,
}: {
  submission: KnowledgeSubmissionFixture;
  viewer: FixtureUser;
  onAction: (status: ApprovalStatus) => void;
}) {
  const sources = sourceDocumentFixtures.filter((source) =>
    submission.sourceIds.includes(source.id),
  );
  const showActions = canSeeReviewActions(viewer);

  return (
    <div className="border-t border-line p-4">
      {submission.isClaim && submission.sourceIds.length === 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-[#f0bd9d] bg-[#fff7ed] p-3 text-sm text-[#9a4b22]">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-medium">Claims without a source cannot be approved.</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-stone-700">{submission.summary}</p>
          <p className="rounded-md border border-line bg-[#fbfaf7] p-3 text-sm leading-6 text-stone-700">
            {submission.content}
          </p>
          {showActions ? (
            <div className="flex flex-wrap gap-2">
              {actionButtons.map((action) => {
                const transitionError = getTransitionError(viewer, submission, action.action);
                const allowed = transitionError === null;

                return (
                  <button
                    className={[
                      "rounded-md border px-3 py-2 text-sm font-semibold transition",
                      allowed
                        ? "border-signal bg-white text-signal hover:bg-[#e7f0ed]"
                        : "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400",
                    ].join(" ")}
                    disabled={!allowed}
                    key={action.status}
                    onClick={() => onAction(action.status)}
                    title={transitionError?.message}
                    type="button"
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md border border-line bg-[#fbfaf7] p-3 text-sm text-stone-600">
              Sales users can view fixture submissions but cannot approve, restrict, reject, or
              archive knowledge.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Sources</h3>
            {sources.length === 0 ? (
              <p className="mt-2 text-sm text-stone-600">No source attached.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {sources.map((source) => (
                  <div
                    className="rounded-md border border-line bg-[#fbfaf7] p-3 text-sm"
                    key={source.id}
                  >
                    <p className="font-semibold text-ink">{source.title}</p>
                    <p className="mt-1 text-stone-600">{getSourceTypeLabel(source.sourceType)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">Review history</h3>
            {submission.reviewHistory.length === 0 ? (
              <p className="mt-2 text-sm text-stone-600">No review-history entries yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {submission.reviewHistory.map((entry) => (
                  <div
                    className="rounded-md border border-line bg-[#fbfaf7] p-3 text-sm"
                    key={entry.id}
                  >
                    <p className="font-semibold text-ink">{entry.action}</p>
                    <p className="mt-1 text-stone-600">
                      {entry.actorName} - {new Date(entry.createdAt).toLocaleDateString("en-US")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-stone-700">
      {label}
      <select
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="ALL">All</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
