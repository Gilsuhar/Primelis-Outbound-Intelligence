"use client";

import React from "react";
import { useMemo, useState } from "react";
import { Ban, Search } from "lucide-react";

import { SectionHeader } from "@/components/signal-ui";
import { useOutputLanguage } from "@/components/language-selector";
import { translateUi } from "@/lib/ui-translations";
import { searchDoNotContactRecords } from "./do-not-contact-policy";
import type { DoNotContactRecord } from "./types";

export function DoNotContactClient({ records }: { records: DoNotContactRecord[] }) {
  const language = useOutputLanguage();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchDoNotContactRecords(records, query), [query, records]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-olive">
          {translateUi("dnc.eyebrow", language)}
        </p>
        <h1 className="text-3xl font-semibold text-ink">{translateUi("dnc.title", language)}</h1>
        <p className="max-w-2xl text-sm leading-6 text-[#6f6d5f]">
          {translateUi("dnc.description", language)}
        </p>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title={translateUi("dnc.listTitle", language)}
          description={translateUi("dnc.listDescription", language)}
        />
        <label className="block max-w-xl text-sm font-semibold text-ink">
          {translateUi("dnc.searchLabel", language)}
          <span className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
            <Search aria-hidden="true" className="h-4 w-4 text-[#7A7868]" />
            <input
              className="w-full border-0 bg-transparent text-sm outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translateUi("dnc.searchPlaceholder", language)}
              value={query}
            />
          </span>
        </label>
      </section>

      {records.length === 0 ? (
        <section className="rounded-2xl border border-line bg-cream p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lime text-ink">
            <Ban aria-hidden="true" className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-xl font-semibold text-ink">
            {translateUi("dnc.emptyTitle", language)}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#6f6d5f]">
            {translateUi("dnc.emptyDescription", language)}
          </p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {results.map(({ record, blocked, label }) => (
            <article className="rounded-2xl border border-line bg-white p-5" key={record.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink">{record.companyName}</h2>
                  <p className="text-sm text-[#6f6d5f]">
                    {record.domain ?? translateUi("dnc.domainMissing", language)}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    blocked ? "bg-[#fff0e8] text-[#9a3f24]" : "bg-lime text-ink",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm text-[#5c5a4f] sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-ink">Status</dt>
                  <dd>{translateUi(`status.${record.status}` as never, language)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">{translateUi("dnc.product", language)}</dt>
                  <dd>{record.product ?? translateUi("dnc.notSpecified", language)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">{translateUi("dnc.country", language)}</dt>
                  <dd>{record.country ?? translateUi("dnc.notSpecified", language)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">{translateUi("dnc.owner", language)}</dt>
                  <dd>{record.owner ?? translateUi("dnc.notSpecified", language)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">
                    {translateUi("dnc.lastContact", language)}
                  </dt>
                  <dd>{record.lastContactDate ?? translateUi("dnc.notRecorded", language)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">{translateUi("dnc.reason", language)}</dt>
                  <dd>{record.reason ?? translateUi("dnc.notSpecified", language)}</dd>
                </div>
              </dl>
              {record.notes ? <p className="mt-3 text-sm text-[#6f6d5f]">{record.notes}</p> : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
