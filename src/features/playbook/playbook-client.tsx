"use client";

import React from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Layers3,
  MessageSquareReply,
  Send,
} from "lucide-react";

import { EvidenceBadge, SectionHeader, SignalCard, SignalHero } from "@/components/signal-ui";
import type { ViewerRole } from "@/features/playbook/types";
import {
  calculateProgress,
  companySizeGuidance,
  coreIcpSignals,
  emptyProgress,
  evidenceDescriptions,
  qualificationChecklist,
  workSteps,
} from "@/features/playbook/playbook-content";
import type { PlaybookData, PlaybookProgressKey, PlaybookProgressState } from "./types";

const sectionLinks = [
  ["learn", "Learn Signal"],
  ["icp", "Signal ICP"],
  ["industries", "Industries"],
  ["personas", "Personas"],
  ["transition", "US Market"],
  ["qualify", "Qualify"],
  ["work", "How to Work"],
  ["objections", "Objections"],
  ["case-studies", "Case Studies"],
  ["dnc", "Do Not Contact"],
  ["practice", "Practice"],
  ["progress", "Progress"],
] as const;

function WarningLabel({ text }: { text: string }) {
  return (
    <span className="inline-flex rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-[#6f6d5f]">
      {text}
    </span>
  );
}

function ProgressToggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2 text-sm">
      <span className={disabled ? "text-[#9b9889]" : "text-ink"}>{label}</span>
      <input
        checked={checked}
        className="h-4 w-4 accent-[#5F7F28]"
        disabled={disabled}
        onChange={onChange}
        type="checkbox"
      />
    </label>
  );
}

export function PlaybookClient({
  data,
  viewerRole,
}: {
  data: PlaybookData;
  viewerRole: ViewerRole;
}) {
  const [progress, setProgress] = useState<PlaybookProgressState>(emptyProgress);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>({});
  const progressView = useMemo(
    () => calculateProgress(progress, viewerRole),
    [progress, viewerRole],
  );

  function toggleProgress(key: PlaybookProgressKey) {
    setProgress((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="space-y-8">
      <SignalHero
        description="A concise internal guide for experienced Primelis sellers learning Signal in the US market. Use it to qualify accounts, choose the right persona, and stay careful with evidence."
        eyebrow="Signal Playbook"
        title="Learn the product. Pick the right accounts. Keep the message sharp."
      />

      <nav
        aria-label="Playbook sections"
        className="flex gap-2 overflow-x-auto rounded-2xl border border-line bg-cream p-2"
      >
        {sectionLinks.map(([id, label]) => (
          <a
            className="shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-[#5c5a4f] hover:bg-white hover:text-ink"
            href={`#${id}`}
            key={id}
          >
            {label}
          </a>
        ))}
      </nav>

      <section className="space-y-4" id="learn">
        <SectionHeader
          eyebrow="A. Learn Signal"
          title="What Signal helps teams decide"
          description="Use approved product truth for factual claims. Treat guidance as internal unless it is explicitly approved for external wording."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {data.approvedProductTruth.length > 0 ? (
            data.approvedProductTruth.slice(0, 3).map((record) => (
              <SignalCard
                description={record.approvedWording ?? record.originalText}
                key={record.id}
                title={record.title}
              >
                <div className="mt-4 flex flex-wrap gap-2">
                  <WarningLabel text="Approved product truth" />
                  {record.usageRestrictions ? (
                    <WarningLabel text="External use restricted" />
                  ) : null}
                </div>
              </SignalCard>
            ))
          ) : (
            <SignalCard
              description="Approved product truth was not available from the configured database. Use reviewed knowledge before sending factual claims."
              title="Approved facts unavailable"
            />
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            "Solo scenario: branded search where paid presence may not be incrementally useful.",
            "Competitive scenario: competitors or intermediaries may change the paid-search decision.",
            "Ghost scenario: paid brand activity may appear useful while organic outcomes tell a different story.",
            "Signal does not promise guaranteed traffic, conversions, exact savings, or universal spend cuts.",
          ].map((item) => (
            <div
              className="rounded-2xl border border-line bg-white p-4 text-sm leading-6 text-[#5c5a4f]"
              key={item}
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4" id="icp">
        <SectionHeader
          eyebrow="B. Signal ICP"
          title="Approved Signal ICP v1"
          description="A strong candidate usually has most of these signals. Revenue or company size alone never qualifies an account."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <SignalCard title="Core ICP">
            <ul className="mt-4 space-y-2 text-sm leading-6 text-[#5c5a4f]">
              {coreIcpSignals.map((signal) => (
                <li key={signal}>• {signal}</li>
              ))}
            </ul>
          </SignalCard>
          <SignalCard title="Company size and spend guidance">
            <ul className="mt-4 space-y-2 text-sm leading-6 text-[#5c5a4f]">
              {companySizeGuidance.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </SignalCard>
        </div>
      </section>

      <section className="space-y-4" id="industries">
        <SectionHeader
          eyebrow="C. Industries"
          title="Prioritize proven segments first"
          description="Strong hypothesis and exploratory segments are useful for testing, not proof."
        />
        <div className="grid gap-4 xl:grid-cols-3">
          {data.industries.map((industry) => (
            <article className="rounded-2xl border border-line bg-cream p-5" key={industry.name}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-ink">{industry.name}</h3>
                <EvidenceBadge level={industry.evidenceLevel} />
              </div>
              <p className="mt-2 text-xs text-[#6f6d5f]">
                {evidenceDescriptions[industry.evidenceLevel]}
              </p>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-[#5c5a4f]">
                {industry.whySignalMayFit.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm font-semibold text-ink">Best angle</p>
              <p className="mt-1 text-sm text-[#6f6d5f]">{industry.bestAngles.join(", ")}</p>
              <p className="mt-3 text-sm font-semibold text-ink">Likely objection</p>
              <p className="mt-1 text-sm text-[#6f6d5f]">{industry.likelyObjection}</p>
              {industry.eligibleProof ? (
                <p className="mt-3 text-sm text-[#6f6d5f]">
                  Eligible proof: {industry.eligibleProof.join(", ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4" id="personas">
        <SectionHeader
          eyebrow="D. Personas"
          title="Target ownership, not title seniority alone"
          description="Direct Paid Search ownership is often best, but Performance, Growth, Acquisition, Digital, or E-commerce leaders can be equally important when they own the outcome."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {data.personas.map((persona) => (
            <details className="rounded-2xl border border-line bg-white p-5" key={persona.name}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span>
                  <span className="block text-lg font-semibold text-ink">{persona.name}</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                    {persona.tier.replace("_", " ")}
                  </span>
                </span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 text-[#6f6d5f]" />
              </summary>
              <div className="mt-4 space-y-3 text-sm leading-6 text-[#5c5a4f]">
                <p>
                  <strong>Cares about:</strong> {persona.caresAbout}
                </p>
                <p>
                  <strong>Best angle:</strong> {persona.bestAngle}
                </p>
                <p>
                  <strong>CTA:</strong> {persona.suitableCta}
                </p>
                <p>
                  <strong>Common objection:</strong> {persona.commonObjection}
                </p>
                <p>
                  <strong>Secondary stakeholder:</strong> {persona.secondaryStakeholder}
                </p>
                <p>
                  <strong>Prioritize when:</strong> {persona.prioritizeWhen}
                </p>
                <p>
                  <strong>Do not prioritize when:</strong> {persona.doNotPrioritizeWhen}
                </p>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-4" id="transition">
        <SectionHeader eyebrow="E. US Market Transition" title="Practical shifts for US outreach" />
        <div className="grid gap-4 md:grid-cols-2">
          {[
            "Expect titles like VP Performance Marketing, Head of Growth, Director of Demand Generation, SEM Manager, and PPC Lead.",
            "Use shorter, more direct outreach with a professional but less formal tone.",
            "Lead with relevance and a specific reason for writing, not company history.",
            "Use soft, specific CTAs and respect US time zones when scheduling.",
            "Check whether ownership sits at HQ, regional, or global level before assuming the buyer.",
          ].map((item) => (
            <SignalCard description={item} key={item} title="Guidance" />
          ))}
        </div>
      </section>

      <section className="space-y-4" id="qualify">
        <SectionHeader
          eyebrow="F. Qualify an Account"
          title="Keep the fit decision simple"
          description="Use Strong fit, Possible fit, or Do not target. Do not build a fake score."
        />
        <SignalCard title="Checklist">
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#5c5a4f] sm:grid-cols-2">
            {qualificationChecklist.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </SignalCard>
      </section>

      <section className="space-y-4" id="work">
        <SectionHeader eyebrow="G. How to Work" title="One operating flow" />
        <div className="flex flex-wrap gap-2">
          {workSteps.map((step) => (
            <span
              className="rounded-full border border-line bg-cream px-3 py-2 text-sm font-semibold text-ink"
              key={step}
            >
              {step}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="signal-button-secondary" href="/do-not-contact">
            <Ban className="h-4 w-4" />
            Check Do Not Contact
          </Link>
          <Link className="signal-button-secondary" href="/create-outreach">
            <Send className="h-4 w-4" />
            Create Outreach
          </Link>
          <Link className="signal-button-secondary" href="/build-sequence">
            <Layers3 className="h-4 w-4" />
            Build Sequence
          </Link>
          <Link className="signal-button-secondary" href="/reply-to-prospect">
            <MessageSquareReply className="h-4 w-4" />
            Handle Reply
          </Link>
        </div>
      </section>

      <section className="space-y-4" id="objections">
        <SectionHeader
          eyebrow="H. Objections"
          title="Respond without unsupported claims"
          description="Competitor language stays cautious. Restricted wording is not send-ready proof."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {[
            "We already use Adthena",
            "We already use Revvim",
            "We use Auction Insights",
            "We handle this internally",
            "Our agency manages this",
            "This is not a priority",
            "Send me a deck",
            "We are happy with the current setup",
            "We tried lowering brand spend before",
            "We always have competitors",
          ].map((objection) => (
            <SignalCard key={objection} title={objection}>
              <p className="mt-3 text-sm leading-6 text-[#5c5a4f]">
                Understand what they mean, answer the real concern, avoid competitor weakness
                claims, and use Reply to Prospect for a careful response.
              </p>
              <Link
                className="mt-4 inline-flex text-sm font-semibold text-olive"
                href="/reply-to-prospect"
              >
                Open Reply to Prospect
              </Link>
            </SignalCard>
          ))}
        </div>
      </section>

      <section className="space-y-4" id="case-studies">
        <SectionHeader
          eyebrow="I. Case Studies"
          title="Use customer evidence carefully"
          description="Case studies retain their review and usage state. Do not treat restricted stories as universally approved."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {data.caseStudies.length > 0 ? (
            data.caseStudies.map((record) => (
              <article className="rounded-2xl border border-line bg-white p-5" key={record.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink">{record.title}</h3>
                  <WarningLabel
                    text={
                      record.usageScope === "EMAIL_AND_LINKEDIN" ||
                      record.usageScope === "PUBLIC_MARKETING"
                        ? "Verify before external use"
                        : record.usageScope === "SALES_REPLY_ONLY"
                          ? "Reply use only"
                          : "Internal use only"
                    }
                  />
                </div>
                <p className="mt-2 text-sm text-[#6f6d5f]">
                  {record.industries.join(", ") || "Industry not tagged"}
                </p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-[#5c5a4f]">
                  {record.metrics.map((metric) => (
                    <p key={metric.id}>
                      <strong>{metric.metricName}:</strong> {metric.value} {metric.unit ?? ""}
                    </p>
                  ))}
                  <p>
                    Source:{" "}
                    {record.sources.map((source) => source.title).join(", ") ||
                      "Source relationship retained"}
                  </p>
                  <p>Best-fit persona: {record.personas.join(", ") || "Verify before use"}</p>
                </div>
              </article>
            ))
          ) : (
            <SignalCard
              description="No imported case studies were available from the configured database. Do not invent customer evidence."
              title="No case studies available"
            />
          )}
        </div>
      </section>

      <section className="space-y-4" id="dnc">
        <SectionHeader eyebrow="J. Do Not Contact" title="Check suppression before outreach" />
        <SignalCard
          description="Use the Do Not Contact list before creating outreach or sequences. The current phase does not connect a CRM or collect external data."
          href="/do-not-contact"
          icon={Ban}
          title="Open Do Not Contact"
        />
      </section>

      <section className="space-y-4" id="practice">
        <SectionHeader
          eyebrow="K. Practice"
          title="Five quick non-AI scenarios"
          description="Write or choose an answer, reveal guidance, and mark practice complete."
        />
        <div className="space-y-3">
          {data.practiceScenarios.map((scenario) => (
            <details className="rounded-2xl border border-line bg-cream p-5" key={scenario.id}>
              <summary className="cursor-pointer list-none text-lg font-semibold text-ink">
                {scenario.title}
              </summary>
              <p className="mt-3 text-sm leading-6 text-[#5c5a4f]">{scenario.prompt}</p>
              <label className="mt-3 block text-sm font-semibold text-ink">
                Your answer
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
                  onChange={(event) =>
                    setPracticeAnswers((current) => ({
                      ...current,
                      [scenario.id]: event.target.value,
                    }))
                  }
                  value={practiceAnswers[scenario.id] ?? ""}
                />
              </label>
              <details className="mt-3 rounded-xl bg-white p-3">
                <summary className="cursor-pointer text-sm font-semibold text-olive">
                  Reveal guidance
                </summary>
                <p className="mt-2 text-sm leading-6 text-[#5c5a4f]">{scenario.guidance}</p>
              </details>
            </details>
          ))}
        </div>
        <button
          className="signal-button-primary"
          onClick={() => toggleProgress("practice")}
          type="button"
        >
          <GraduationCap className="h-4 w-4" />
          {progress.practice ? "Practice complete" : "Mark practice complete"}
        </button>
      </section>

      <section className="space-y-4" id="progress">
        <SectionHeader
          eyebrow="L. Progress"
          title="Lightweight readiness"
          description="No time tracking, behavioral monitoring, or productivity scoring."
        />
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <SignalCard title={`${progressView.completionPercentage}% complete`}>
            <p className="mt-2 text-sm text-[#6f6d5f]">{progressView.readinessStatus}</p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-lime"
                style={{ width: `${progressView.completionPercentage}%` }}
              />
            </div>
          </SignalCard>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(progress) as PlaybookProgressKey[]).map((key) => (
              <ProgressToggle
                checked={progress[key]}
                disabled={key === "managerApproval" && !progressView.managerApprovalVisible}
                key={key}
                label={
                  key === "managerApproval" && !progressView.managerApprovalVisible
                    ? "Manager approval (manager only)"
                    : key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())
                }
                onChange={() => toggleProgress(key)}
              />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CheckCircle2 className="h-4 w-4 text-olive" />
            Manager view
          </div>
          <p className="mt-2 text-sm leading-6 text-[#6f6d5f]">
            Shows completion percentage, completed sections, remaining sections, readiness status,
            and manager approval only.
          </p>
        </div>
      </section>
    </div>
  );
}
