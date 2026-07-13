"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckSquare, RotateCcw, ShieldAlert } from "lucide-react";

import {
  bulkReviewImportedSignalRecordsAction,
  reviewImportedSignalRecordAction,
} from "@/app/imported-signal-review/actions";
import { StatusBadge } from "@/components/status-badge";
import {
  canBulkReviewRecord,
  filterImportedSignalRecords,
  getImportedReviewError,
  getImportedSignalProgress,
  isRestrictedUsage,
  type ImportedSignalBulkAction,
  type ImportedSignalReviewAction,
} from "@/features/imported-signal-review/review-policy";
import {
  caseStudyUsageScopes,
  importedSignalCategories,
  type CaseStudyUsageScope,
  type ImportedSignalFilters,
  type ImportedSignalProgress,
  type ImportedSignalRecord,
  type ImportedSignalSource,
  type ReviewActor,
} from "@/features/imported-signal-review/types";
import {
  approvalStatuses,
  channelTags,
  type ApprovalStatus,
  type ChannelTag,
} from "@/features/knowledge/types";
import { formatEnumLabel } from "@/lib/status";

const adminActor: ReviewActor = {
  id: "seed-admin-user",
  name: "Development Knowledge Admin",
  role: "KNOWLEDGE_ADMIN",
};

const salesActor: ReviewActor = {
  id: "seed-sales-user",
  name: "Development Sales User",
  role: "SALES_USER",
};

const defaultFilters: ImportedSignalFilters = {
  category: "ALL",
  status: "ALL",
  sourceId: "ALL",
  industry: "ALL",
  missingApprovedWording: false,
  restrictedUsage: false,
};

const categoryLabels = {
  PRODUCT_TRUTH: "Product Truth",
  CASE_STUDY: "Case Studies",
  OBJECTION: "Objections",
  MESSAGE_RULE: "Messaging Rules",
  SOURCE: "Sources",
} as const;

const reviewActions: Array<{ label: string; action: ImportedSignalReviewAction }> = [
  { label: "Approve", action: "APPROVE" },
  { label: "Restrict", action: "RESTRICT" },
  { label: "Reject", action: "REJECT" },
  { label: "Return to review", action: "RETURN_TO_REVIEW" },
];

export function ImportedSignalReviewClient({
  initialRecords = [],
  initialProgress,
  initialSources = [],
  initialIndustries = [],
}: {
  initialRecords?: ImportedSignalRecord[];
  initialProgress?: ImportedSignalProgress;
  initialSources?: ImportedSignalSource[];
  initialIndustries?: string[];
}) {
  const [records, setRecords] = useState(initialRecords);
  const [filters, setFilters] = useState(defaultFilters);
  const [selectedId, setSelectedId] = useState(initialRecords[0]?.id ?? "");
  const [actor, setActor] = useState<ReviewActor>(adminActor);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const progress = useMemo(
    () =>
      initialProgress && records === initialRecords
        ? initialProgress
        : getImportedSignalProgress(records),
    [initialProgress, initialRecords, records],
  );
  const filteredRecords = useMemo(
    () => filterImportedSignalRecords(records, filters),
    [filters, records],
  );
  const selectedRecord =
    records.find((record) => record.id === selectedId) ?? filteredRecords[0] ?? records[0];

  function updateRecordStatus(recordId: string, status: ApprovalStatus) {
    setRecords((current) =>
      current.map((record) =>
        record.id === recordId
          ? {
              ...record,
              status,
              lastReviewedDate: new Date().toISOString(),
            }
          : record,
      ),
    );
  }

  function handleBulk(action: ImportedSignalBulkAction) {
    startTransition(async () => {
      const result = await bulkReviewImportedSignalRecordsAction({
        actorId: actor.id,
        recordIds: selectedIds,
        action,
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      const status =
        action === "APPROVE_MESSAGING_RULES"
          ? "APPROVED"
          : action === "RESTRICT"
            ? "RESTRICTED"
            : "NEEDS_REVIEW";
      setRecords((current) =>
        current.map((record) =>
          selectedIds.includes(record.id)
            ? { ...record, status, lastReviewedDate: new Date().toISOString() }
            : record,
        ),
      );
      setSelectedIds([]);
      setMessage(`${result.data.updated} imported records updated.`);
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          Knowledge admin
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-ink">Imported Signal Review</h1>
            <p className="max-w-3xl text-sm leading-6 text-stone-600">
              Inspect imported Signal records, edit review fields, and approve or restrict content
              only after source-backed review.
            </p>
          </div>
          <label className="w-full max-w-xs space-y-1 text-sm font-medium text-stone-700">
            Reviewer
            <select
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              onChange={(event) =>
                setActor(event.target.value === "admin" ? adminActor : salesActor)
              }
              value={actor.role === "KNOWLEDGE_ADMIN" ? "admin" : "sales"}
            >
              <option value="admin">Development Knowledge Admin</option>
              <option value="sales">Development Sales User</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ProgressStat label="Total" value={progress.total} />
        <ProgressStat label="Approved" value={progress.approved} />
        <ProgressStat label="Restricted" value={progress.restricted} />
        <ProgressStat label="Rejected" value={progress.rejected} />
        <ProgressStat label="Needs Review" value={progress.needsReview} />
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-sm lg:grid-cols-6">
        <FilterSelect
          label="Category"
          onChange={(value) =>
            setFilters({ ...filters, category: value as ImportedSignalFilters["category"] })
          }
          options={importedSignalCategories.map((category) => [category, categoryLabels[category]])}
          value={filters.category}
        />
        <FilterSelect
          label="Status"
          onChange={(value) =>
            setFilters({ ...filters, status: value as ImportedSignalFilters["status"] })
          }
          options={approvalStatuses.map((status) => [status, formatEnumLabel(status)])}
          value={filters.status}
        />
        <FilterSelect
          label="Source"
          onChange={(value) => setFilters({ ...filters, sourceId: value })}
          options={initialSources.map((source) => [source.id, source.title])}
          value={filters.sourceId}
        />
        <FilterSelect
          label="Industry"
          onChange={(value) => setFilters({ ...filters, industry: value })}
          options={initialIndustries.map((industry) => [industry, industry])}
          value={filters.industry}
        />
        <ToggleFilter
          checked={filters.missingApprovedWording}
          label="Missing wording"
          onChange={(checked) => setFilters({ ...filters, missingApprovedWording: checked })}
        />
        <ToggleFilter
          checked={filters.restrictedUsage}
          label="Restricted usage"
          onChange={(checked) => setFilters({ ...filters, restrictedUsage: checked })}
        />
      </section>

      {message ? (
        <section className="rounded-lg border border-line bg-white p-3 text-sm text-stone-700">
          {message}
        </section>
      ) : null}

      <section className="grid min-w-0 gap-4 lg:grid-cols-[0.95fr_1.35fr]">
        <div className="min-w-0 space-y-4">
          <BulkActions
            actor={actor}
            disabled={isPending || selectedIds.length === 0}
            onAction={handleBulk}
            records={records.filter((record) => selectedIds.includes(record.id))}
          />
          {importedSignalCategories.map((category) => {
            const categoryRecords = filteredRecords.filter(
              (record) => record.category === category,
            );
            if (categoryRecords.length === 0) {
              return null;
            }
            return (
              <section className="space-y-2" key={category}>
                <h2 className="text-sm font-semibold text-ink">{categoryLabels[category]}</h2>
                <div className="space-y-2">
                  {categoryRecords.map((record) => (
                    <RecordRow
                      checked={selectedIds.includes(record.id)}
                      key={record.id}
                      onCheckedChange={(checked) =>
                        setSelectedIds((current) =>
                          checked
                            ? [...current, record.id]
                            : current.filter((id) => id !== record.id),
                        )
                      }
                      onSelect={() => setSelectedId(record.id)}
                      record={record}
                      selected={record.id === selectedRecord?.id}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {selectedRecord ? (
          <RecordReviewPanel
            actor={actor}
            disabled={isPending}
            key={selectedRecord.id}
            onMessage={setMessage}
            onReviewed={updateRecordStatus}
            record={selectedRecord}
            setRecords={setRecords}
          />
        ) : (
          <div className="rounded-lg border border-line bg-white p-6 text-sm text-stone-600">
            No imported Signal records match the current filters.
          </div>
        )}
      </section>
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function RecordRow({
  record,
  selected,
  checked,
  onSelect,
  onCheckedChange,
}: {
  record: ImportedSignalRecord;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <article
      className={[
        "min-w-0 rounded-lg border bg-white p-3 shadow-sm",
        selected ? "border-signal" : "border-line",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <input
          checked={checked}
          className="mt-1"
          onChange={(event) => onCheckedChange(event.target.checked)}
          type="checkbox"
        />
        <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
          <span className="block truncate text-sm font-semibold text-ink">{record.title}</span>
          <span className="mt-1 block break-all text-xs text-stone-500">{record.id}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={record.status} />
            <span className="text-xs text-stone-600">{record.contentType}</span>
            {isRestrictedUsage(record) ? (
              <span className="rounded-md bg-[#fff7ed] px-2 py-1 text-xs font-medium text-[#9a4b22]">
                Restricted
              </span>
            ) : null}
          </span>
        </button>
      </div>
    </article>
  );
}

function RecordReviewPanel({
  record,
  actor,
  disabled,
  onReviewed,
  onMessage,
  setRecords,
}: {
  record: ImportedSignalRecord;
  actor: ReviewActor;
  disabled: boolean;
  onReviewed: (recordId: string, status: ApprovalStatus) => void;
  onMessage: (message: string | null) => void;
  setRecords: React.Dispatch<React.SetStateAction<ImportedSignalRecord[]>>;
}) {
  const [approvedWording, setApprovedWording] = useState(record.approvedWording ?? "");
  const [internalNotes, setInternalNotes] = useState(record.internalNotes ?? "");
  const [usageRestrictions, setUsageRestrictions] = useState(record.usageRestrictions ?? "");
  const [usageScope, setUsageScope] = useState<CaseStudyUsageScope | "">(record.usageScope ?? "");
  const [channels, setChannels] = useState<ChannelTag[]>(record.channels);
  const [isPending, startTransition] = useTransition();

  function submitReview(action: ImportedSignalReviewAction) {
    startTransition(async () => {
      const result = await reviewImportedSignalRecordAction({
        actorId: actor.id,
        recordId: record.id,
        category: record.category,
        action,
        approvedWording,
        internalNotes,
        usageRestrictions,
        usageScope: usageScope || undefined,
        channels,
        reason: `Imported Signal review action: ${action}`,
      });
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      setRecords((current) =>
        current.map((item) =>
          item.id === record.id
            ? {
                ...item,
                status: result.data.status,
                approvedWording,
                internalNotes,
                usageRestrictions,
                usageScope: usageScope || undefined,
                channels,
                lastReviewedDate: new Date().toISOString(),
              }
            : item,
        ),
      );
      onReviewed(record.id, result.data.status);
      onMessage(`${record.title} moved to ${formatEnumLabel(result.data.status)}.`);
    });
  }

  return (
    <article className="min-w-0 rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            {record.contentType}
          </p>
          <h2 className="text-xl font-semibold text-ink">{record.title}</h2>
          <p className="break-all text-xs text-stone-500">{record.id}</p>
        </div>
        <StatusBadge status={record.status} />
      </div>

      <div className="grid gap-4 py-4 lg:grid-cols-2">
        <InfoBlock label="Original imported text" value={record.originalText || "No text."} />
        <div className="space-y-3">
          <InfoBlock
            label="Source details"
            value={record.sources.map((source) => source.title).join("\n") || "No source."}
          />
          <InfoBlock label="Source date" value={record.sourceDate ?? "Not provided"} />
          <InfoBlock label="Last reviewed" value={record.lastReviewedDate ?? "Not reviewed"} />
        </div>
      </div>

      {record.category === "CASE_STUDY" ? <CaseStudyDetails record={record} /> : null}

      {record.isCompetitorRelated ? (
        <div className="mb-4 flex gap-2 rounded-md border border-[#f0bd9d] bg-[#fff7ed] p-3 text-sm text-[#9a4b22]">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4" />
          Competitor-related objection or source context requires manual verification before
          approval.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <TextArea
          label="Proposed approved wording"
          onChange={setApprovedWording}
          value={approvedWording}
        />
        <TextArea label="Internal notes" onChange={setInternalNotes} value={internalNotes} />
        <TextArea
          label="Usage restrictions"
          onChange={setUsageRestrictions}
          value={usageRestrictions}
        />
        <div className="space-y-3">
          {record.category === "CASE_STUDY" ? (
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Case-study usage scope
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                onChange={(event) => setUsageScope(event.target.value as CaseStudyUsageScope | "")}
                value={usageScope}
              >
                <option value="">Select before approval</option>
                {caseStudyUsageScopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {formatEnumLabel(scope)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <ChannelPicker channels={channels} onChange={setChannels} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {reviewActions.map((item) => {
          const policyError = getImportedReviewError({
            actor,
            record,
            action: item.action,
            usageScope: usageScope || undefined,
          });
          return (
            <button
              className={[
                "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold",
                policyError || disabled || isPending
                  ? "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400"
                  : "border-signal bg-white text-signal hover:bg-[#e7f0ed]",
              ].join(" ")}
              disabled={Boolean(policyError) || disabled || isPending}
              key={item.action}
              onClick={() => submitReview(item.action)}
              title={policyError ?? undefined}
              type="button"
            >
              {item.action === "RESTRICT" ? <ShieldAlert className="h-4 w-4" /> : null}
              {item.action === "RETURN_TO_REVIEW" ? <RotateCcw className="h-4 w-4" /> : null}
              {item.action === "APPROVE" ? <CheckSquare className="h-4 w-4" /> : null}
              {item.label}
            </button>
          );
        })}
      </div>

      <section className="mt-6 space-y-2">
        <h3 className="text-sm font-semibold text-ink">Review history</h3>
        {record.reviewHistory.length === 0 ? (
          <p className="text-sm text-stone-600">No review decisions yet.</p>
        ) : (
          record.reviewHistory.map((entry) => (
            <div className="rounded-md border border-line bg-[#fbfaf7] p-3 text-sm" key={entry.id}>
              <p className="font-semibold text-ink">{entry.action ?? "Review decision"}</p>
              <p className="text-stone-600">
                {entry.actorName} - {new Date(entry.createdAt).toLocaleDateString("en-US")}
              </p>
            </div>
          ))
        )}
      </section>
    </article>
  );
}

function CaseStudyDetails({ record }: { record: ImportedSignalRecord }) {
  return (
    <section className="mb-4 grid gap-3 rounded-md border border-line bg-[#fbfaf7] p-3 text-sm lg:grid-cols-2">
      <InfoBlock label="Company" value={record.companyName ?? "Not provided"} />
      <InfoBlock label="Industry" value={record.industries.join(", ") || "Not tagged"} />
      <InfoBlock label="Problem" value={record.initialProblem ?? "Not provided"} />
      <InfoBlock label="Signal approach" value={record.signalApproach ?? "Not provided"} />
      <InfoBlock label="Activation duration" value={record.activationDuration ?? "Not provided"} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Metrics</p>
        <ul className="mt-1 space-y-1 text-stone-700">
          {record.metrics.map((metric) => (
            <li key={metric.id}>
              {metric.metricName}: {metric.value}
              {metric.unit ? ` ${metric.unit}` : ""} ({formatEnumLabel(metric.direction)})
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BulkActions({
  records,
  actor,
  disabled,
  onAction,
}: {
  records: ImportedSignalRecord[];
  actor: ReviewActor;
  disabled: boolean;
  onAction: (action: ImportedSignalBulkAction) => void;
}) {
  const actions: Array<{ label: string; action: ImportedSignalBulkAction }> = [
    { label: "Return selected to review", action: "RETURN_TO_REVIEW" },
    { label: "Restrict selected", action: "RESTRICT" },
    { label: "Approve selected messaging rules", action: "APPROVE_MESSAGING_RULES" },
  ];

  return (
    <section className="rounded-lg border border-line bg-white p-3 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-ink">Bulk actions</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((item) => {
          const allowed =
            records.length > 0 &&
            records.every((record) => canBulkReviewRecord({ actor, record, action: item.action }));
          return (
            <button
              className={[
                "rounded-md border px-3 py-2 text-sm font-semibold",
                disabled || !allowed
                  ? "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400"
                  : "border-signal bg-white text-signal hover:bg-[#e7f0ed]",
              ].join(" ")}
              disabled={disabled || !allowed}
              key={item.action}
              onClick={() => onAction(item.action)}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-stone-700">
        {value}
      </p>
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-stone-700">
      {label}
      <textarea
        className="min-h-28 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function ChannelPicker({
  channels,
  onChange,
}: {
  channels: ChannelTag[];
  onChange: (channels: ChannelTag[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-stone-700">Channels</legend>
      <div className="flex flex-wrap gap-2">
        {channelTags.map((channel) => (
          <label className="flex items-center gap-2 text-sm text-stone-700" key={channel}>
            <input
              checked={channels.includes(channel)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...channels, channel]
                    : channels.filter((item) => item !== channel),
                )
              }
              type="checkbox"
            />
            {formatEnumLabel(channel)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ToggleFilter({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 self-end rounded-md border border-line px-3 py-2 text-sm font-medium text-stone-700">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
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
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
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
