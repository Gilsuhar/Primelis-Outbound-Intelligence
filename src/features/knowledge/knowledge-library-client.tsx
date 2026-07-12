"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { knowledgeItemFixtures } from "@/data/fixtures/knowledge-fixtures";
import {
  filterKnowledgeItems,
  getEmptyKnowledgeLibraryFilters,
  getUniqueTagValues,
} from "@/features/knowledge/filtering";
import {
  approvalStatuses,
  channelTags,
  knowledgeTypes,
  type KnowledgeLibraryFilters,
} from "@/features/knowledge/types";
import { formatEnumLabel, getKnowledgeTypeLabel } from "@/lib/status";

function updateFilter<K extends keyof KnowledgeLibraryFilters>(
  filters: KnowledgeLibraryFilters,
  key: K,
  value: KnowledgeLibraryFilters[K],
) {
  return {
    ...filters,
    [key]: value,
  };
}

export function KnowledgeLibraryClient() {
  const [filters, setFilters] = useState<KnowledgeLibraryFilters>(getEmptyKnowledgeLibraryFilters);

  const filteredItems = useMemo(
    () => filterKnowledgeItems(knowledgeItemFixtures, filters),
    [filters],
  );
  const personas = useMemo(() => getUniqueTagValues(knowledgeItemFixtures, "personas"), []);
  const industries = useMemo(() => getUniqueTagValues(knowledgeItemFixtures, "industries"), []);
  const competitors = useMemo(() => getUniqueTagValues(knowledgeItemFixtures, "competitors"), []);

  const hasActiveFilters =
    JSON.stringify(filters) !== JSON.stringify(getEmptyKnowledgeLibraryFilters());

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">Knowledge</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-ink">Knowledge Library</h1>
            <p className="max-w-2xl text-sm leading-6 text-stone-600">
              Fixture-backed view of knowledge records, approval status, sources, and claim links.
            </p>
          </div>
          <span className="w-fit rounded-md border border-[#ead3a1] bg-[#fff7e8] px-3 py-2 text-xs font-semibold text-[#8a5a2b]">
            Development fixture data only
          </span>
        </div>
      </section>

      {knowledgeItemFixtures.length === 0 ? (
        <section className="rounded-lg border border-line bg-white p-8 text-sm text-stone-600">
          No development fixture records are available yet.
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-sm font-medium text-stone-700 xl:col-span-2">
                Search
                <span className="relative block">
                  <Search
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  />
                  <input
                    className="w-full rounded-md border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/20"
                    onChange={(event) =>
                      setFilters(updateFilter(filters, "search", event.target.value))
                    }
                    placeholder="Search title, summary, or fixture label"
                    value={filters.search}
                  />
                </span>
              </label>

              <FilterSelect
                label="Knowledge type"
                onChange={(value) =>
                  setFilters(
                    updateFilter(
                      filters,
                      "knowledgeType",
                      value as KnowledgeLibraryFilters["knowledgeType"],
                    ),
                  )
                }
                options={knowledgeTypes.map((type) => [type, getKnowledgeTypeLabel(type)])}
                value={filters.knowledgeType}
              />
              <FilterSelect
                label="Approval status"
                onChange={(value) =>
                  setFilters(
                    updateFilter(
                      filters,
                      "approvalStatus",
                      value as KnowledgeLibraryFilters["approvalStatus"],
                    ),
                  )
                }
                options={approvalStatuses.map((status) => [status, formatEnumLabel(status)])}
                value={filters.approvalStatus}
              />
              <FilterSelect
                label="Channel"
                onChange={(value) =>
                  setFilters(
                    updateFilter(filters, "channel", value as KnowledgeLibraryFilters["channel"]),
                  )
                }
                options={channelTags.map((channel) => [channel, formatEnumLabel(channel)])}
                value={filters.channel}
              />
              <FilterSelect
                label="Persona"
                onChange={(value) => setFilters(updateFilter(filters, "persona", value))}
                options={personas.map((persona) => [persona, persona])}
                value={filters.persona}
              />
              <FilterSelect
                label="Industry"
                onChange={(value) => setFilters(updateFilter(filters, "industry", value))}
                options={industries.map((industry) => [industry, industry])}
                value={filters.industry}
              />
              <FilterSelect
                label="Competitor"
                onChange={(value) => setFilters(updateFilter(filters, "competitor", value))}
                options={competitors.map((competitor) => [competitor, competitor])}
                value={filters.competitor}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-stone-600">
                Showing <span className="font-semibold text-ink">{filteredItems.length}</span> of{" "}
                {knowledgeItemFixtures.length} development records
              </p>
              {hasActiveFilters ? (
                <button
                  className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-stone-600 transition hover:border-stone-400 hover:text-ink"
                  onClick={() => setFilters(getEmptyKnowledgeLibraryFilters())}
                  type="button"
                >
                  Clear filters
                </button>
              ) : null}
            </div>

            {filteredItems.length === 0 ? (
              <div className="rounded-lg border border-line bg-white p-8 text-sm text-stone-600">
                No fixture records match the current filters.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
                <div className="hidden grid-cols-[1.5fr_1fr_1fr_0.7fr_1fr_1fr] gap-4 border-b border-line bg-[#f5f1e9] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 lg:grid">
                  <span>Title</span>
                  <span>Type</span>
                  <span>Status</span>
                  <span>Sources</span>
                  <span>Channels</span>
                  <span>Last reviewed</span>
                </div>
                <div className="divide-y divide-line">
                  {filteredItems.map((item) => (
                    <article
                      className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1.5fr_1fr_1fr_0.7fr_1fr_1fr] lg:items-center lg:gap-4"
                      key={item.id}
                    >
                      <div className="space-y-1">
                        {item.claimId ? (
                          <Link
                            className="font-semibold text-signal hover:text-ink"
                            href={`/claims/${item.claimId}`}
                          >
                            {item.title}
                          </Link>
                        ) : (
                          <h2 className="font-semibold text-ink">{item.title}</h2>
                        )}
                        <p className="text-xs text-stone-500">{item.fixtureLabel}</p>
                        <p className="text-sm leading-6 text-stone-600 lg:hidden">{item.summary}</p>
                      </div>
                      <span className="text-stone-700">
                        {getKnowledgeTypeLabel(item.knowledgeType)}
                      </span>
                      <StatusBadge status={item.approvalStatus} />
                      <span className="text-stone-700">{item.sourceIds.length}</span>
                      <span className="text-stone-700">
                        {item.channels.map(formatEnumLabel).join(", ")}
                      </span>
                      <span className="text-stone-600">
                        {item.lastReviewedDate ?? "Not reviewed"}
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
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
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/20"
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
