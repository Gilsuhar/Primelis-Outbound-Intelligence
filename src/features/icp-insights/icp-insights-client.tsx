import Link from "next/link";
import { BarChart3, Database, ExternalLink, ShieldAlert, Target, UsersRound } from "lucide-react";

import { AnimatedShareBar } from "@/components/animated-share-bar";

import { hubspotIcpSnapshot } from "./hubspot-icp-insights";

const maxShare = Math.max(...hubspotIcpSnapshot.segments.map((segment) => segment.share));
const maxTitleShare = Math.max(...hubspotIcpSnapshot.titleInsights.map((title) => title.share));

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-line bg-cream p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olive">{label}</p>
      <p className="mt-3 font-display text-4xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[#6f6d5f]">{detail}</p>
    </article>
  );
}

function InsightCallout() {
  return (
    <section className="rounded-2xl border border-line bg-lime/80 p-4 shadow-soft sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4f6624]">Best first targets</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_260px] lg:items-center">
        <p className="max-w-4xl text-lg font-semibold leading-8 text-ink">
          Start with Paid Media, Growth, Acquisition, Digital, and E-commerce managers. Move to Directors of
          Performance or Digital for larger accounts. Use C-level mainly for expansion, referrals, or warm
          commercial context.
        </p>
        <div className="rounded-xl border border-[#d8ec42] bg-white/80 p-3 text-sm font-medium leading-6 text-[#4f4e45]">
          Directional HubSpot snapshot, not full meeting attribution yet. Meeting Events still need
          reauthorization for exact source-of-meeting analysis.
        </div>
      </div>
    </section>
  );
}

export function IcpInsightsClient() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">HubSpot intelligence</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-4xl font-semibold text-ink">Signal ICP Insights</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6f6d5f]">
              See which titles and industries are already showing up in Signal and legacy Cross Brand meetings,
              advanced opportunities, and customer records, then use that evidence to choose better targets.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-[#6f6d5f]">
            <Database aria-hidden="true" className="h-4 w-4 text-olive" />
            Snapshot {hubspotIcpSnapshot.pulledAt}
          </span>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {hubspotIcpSnapshot.stageMetrics.map((metric) => (
          <MetricCard detail={metric.detail} key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </section>

      <InsightCallout />

      <section className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">Title ranking</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">
              Who actually turns into meetings and opportunities
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[#6f6d5f]">
            Based on {hubspotIcpSnapshot.contactSample.count} matched HubSpot contacts associated with advanced
            Signal / Cross Brand deals. Use this as the targeting order before writing outreach.
          </p>
        </div>

        <div className="mt-5 grid gap-3">
          {hubspotIcpSnapshot.titleInsights.map((title, index) => (
            <article className="rounded-2xl border border-line bg-cream p-3 sm:p-4" key={title.titleGroup}>
              <div className="grid gap-3 lg:grid-cols-[300px_1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-lime px-2 py-1 text-xs font-semibold text-ink">
                      #{title.rank}
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#6f6d5f]">
                      {title.contacts} matched contacts
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-olive">
                      {title.share}%
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold leading-6 text-ink">{title.titleGroup}</h3>
                </div>

                <div className="min-w-0">
                  <AnimatedShareBar
                    delayMs={index * 90}
                    label={`${title.titleGroup}: ${title.share}%`}
                    widthPercent={Math.max(10, (title.share / maxTitleShare) * 100)}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {title.strongestIndustries.slice(0, 3).map((industry) => (
                      <span
                        className="rounded-full border border-line bg-white px-2 py-1 text-xs font-medium text-[#6f6d5f]"
                        key={industry}
                      >
                        {industry}
                      </span>
                    ))}
                  </div>
                </div>

                <details className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
                  <summary className="cursor-pointer list-none font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive">
                    View guidance
                  </summary>
                  <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">Example titles</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {title.exampleTitles.map((example) => (
                          <span className="rounded-full bg-cream px-2 py-1 text-xs font-medium text-ink" key={example}>
                            {example}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#34352e]">{title.whatItMeans}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">Targeting rule</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-ink">{title.targetingRule}</p>
                    </div>
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex items-start gap-3 border-b border-line pb-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-ink">
            <Target aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">Industry x title fit</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">Which titles to target by industry</h2>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-[0.14em] text-[#6f6d5f]">
                <th className="py-3 pr-4 font-semibold">Industry</th>
                <th className="px-4 py-3 font-semibold">Best titles</th>
                <th className="px-4 py-3 font-semibold">Why it works</th>
                <th className="px-4 py-3 font-semibold">Examples</th>
              </tr>
            </thead>
            <tbody>
              {hubspotIcpSnapshot.industryTitleFit.map((fit) => (
                <tr className="border-b border-line align-top last:border-b-0" key={fit.industry}>
                  <td className="py-4 pr-4 font-semibold text-ink">{fit.industry}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {fit.bestTitles.map((title) => (
                        <span className="rounded-full bg-cream px-2 py-1 text-xs font-medium text-ink" key={title}>
                          {title}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 leading-6 text-[#34352e]">{fit.meetingSignal}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {fit.examples.map((example) => (
                        <span
                          className="rounded-full border border-line bg-cream px-2 py-1 text-xs font-medium text-[#6f6d5f]"
                          key={example}
                        >
                          {example}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">ICP mix</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">Where Signal already has traction</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[#6f6d5f]">
            Percentages are based on the HubSpot customer and advanced-opportunity snapshot used for suppression
            and social-proof safety.
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {hubspotIcpSnapshot.segments.map((segment, index) => (
            <article className="grid gap-3 lg:grid-cols-[220px_1fr] lg:items-center" key={segment.segment}>
              <div>
                <h3 className="font-semibold text-ink">{segment.segment}</h3>
                <p className="mt-1 text-xs font-medium text-[#6f6d5f]">
                  {segment.accounts} accounts - {segment.share}%
                </p>
              </div>
              <div className="min-w-0">
                <AnimatedShareBar
                  delayMs={index * 90}
                  label={`${segment.segment}: ${segment.share}%`}
                  trackClassName="h-3 bg-cream"
                  widthPercent={Math.max(12, (segment.share / maxShare) * 100)}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {segment.examples.map((example) => (
                    <span
                      className="rounded-full border border-line bg-cream px-2 py-1 text-xs font-medium text-[#6f6d5f]"
                      key={example}
                    >
                      {example}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex items-start gap-3 border-b border-line pb-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-ink">
            <Target aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">Targeting table</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">ICP guidance by segment</h2>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-[0.14em] text-[#6f6d5f]">
                <th className="py-3 pr-4 font-semibold">Segment</th>
                <th className="px-4 py-3 font-semibold">Best roles</th>
                <th className="px-4 py-3 font-semibold">Why it books</th>
                <th className="px-4 py-3 font-semibold">Outbound move</th>
              </tr>
            </thead>
            <tbody>
              {hubspotIcpSnapshot.segments.map((segment) => (
                <tr className="border-b border-line align-top last:border-b-0" key={segment.segment}>
                  <td className="py-4 pr-4">
                    <p className="font-semibold text-ink">{segment.segment}</p>
                    <p className="mt-1 text-xs text-[#6f6d5f]">
                      {segment.share}% of snapshot - {segment.accounts} accounts
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {segment.strongestRoles.map((role) => (
                        <span className="rounded-full bg-cream px-2 py-1 text-xs font-medium text-ink" key={role}>
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 leading-6 text-[#34352e]">{segment.whyItBooks}</td>
                  <td className="px-4 py-4 leading-6 text-[#34352e]">{segment.outreachMove}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="flex items-start gap-3 border-b border-line pb-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-ink">
              <UsersRound aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">Deal examples</p>
              <h2 className="mt-1 text-2xl font-semibold text-ink">Records worth learning from</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {hubspotIcpSnapshot.dealExamples.map((deal) => (
              <div className="rounded-xl border border-line bg-cream p-3" key={`${deal.company}-${deal.stage}`}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold text-ink">{deal.company}</p>
                  <span className="w-fit rounded-full bg-white px-2 py-1 text-xs font-semibold text-olive">
                    {deal.stage}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#6f6d5f]">
                  {deal.signal} - {deal.segment}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-cream p-4 shadow-soft sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-olive">
              <ShieldAlert aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">Data confidence</p>
              <h2 className="mt-1 text-2xl font-semibold text-ink">What is live now</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[#34352e]">{hubspotIcpSnapshot.sourceNote}</p>
          <div className="mt-4 space-y-2">
            {hubspotIcpSnapshot.hubspotSearches.map((search) => (
              <Link
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink transition hover:border-olive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
                href={search.href}
                key={search.label}
                target="_blank"
              >
                <span className="inline-flex items-center gap-2">
                  <BarChart3 aria-hidden="true" className="h-4 w-4 text-olive" />
                  {search.label}
                </span>
                <span className="inline-flex items-center gap-2 text-[#6f6d5f]">
                  {search.count}
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-line bg-white p-3 text-sm leading-6 text-[#6f6d5f]">
            Next upgrade: reconnect HubSpot Meeting Events, then this page can switch from deal-field evidence to
            exact meeting-level ICP attribution.
          </div>
        </section>
      </div>
    </div>
  );
}
