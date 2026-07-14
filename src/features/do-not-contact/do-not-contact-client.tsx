"use client";

import React from "react";
import { useMemo, useState } from "react";
import { Ban, Search } from "lucide-react";

import { SectionHeader } from "@/components/signal-ui";
import { searchDoNotContactRecords } from "./do-not-contact-policy";
import type { DoNotContactRecord } from "./types";

const statusLabels: Record<DoNotContactRecord["status"], string> = {
  EXISTING_CUSTOMER: "Existing customer",
  ACTIVE_OPPORTUNITY: "Active opportunity",
  OWNED_BY_ANOTHER_REP: "Owned by another rep",
  RECENTLY_CONTACTED: "Recently contacted",
  PARTNER: "Partner",
  DO_NOT_CONTACT: "Do not contact",
  RESTRICTED_TERRITORY: "Restricted territory",
};

export function DoNotContactClient({ records }: { records: DoNotContactRecord[] }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchDoNotContactRecords(records, query), [query, records]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-olive">
          Sales safety
        </p>
        <h1 className="text-3xl font-semibold text-ink">Do Not Contact check</h1>
        <p className="max-w-2xl text-sm leading-6 text-[#6f6d5f]">
          Search the company or domain before outreach. If there is a match, do not send until it is
          reviewed.
        </p>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Suppression list"
          description="Supported statuses: existing customer, active opportunity, owned by another rep, recently contacted, partner, do not contact, and restricted territory."
        />
        <label className="block max-w-xl text-sm font-semibold text-ink">
          Company or domain search
          <span className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
            <Search aria-hidden="true" className="h-4 w-4 text-[#7A7868]" />
            <input
              className="w-full border-0 bg-transparent text-sm outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company or domain"
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
          <h2 className="mt-4 text-xl font-semibold text-ink">No suppression records yet</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#6f6d5f]">
            No blocked accounts have been imported yet. Add real suppression data before using this
            as the final approval step.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {results.map(({ record, blocked, label }) => (
            <article className="rounded-2xl border border-line bg-white p-5" key={record.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink">{record.companyName}</h2>
                  <p className="text-sm text-[#6f6d5f]">{record.domain ?? "Domain not provided"}</p>
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
                  <dd>{statusLabels[record.status]}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Product</dt>
                  <dd>{record.product ?? "Not specified"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Country</dt>
                  <dd>{record.country ?? "Not specified"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Owner</dt>
                  <dd>{record.owner ?? "Not specified"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Last contact</dt>
                  <dd>{record.lastContactDate ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Reason</dt>
                  <dd>{record.reason ?? "Not specified"}</dd>
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
