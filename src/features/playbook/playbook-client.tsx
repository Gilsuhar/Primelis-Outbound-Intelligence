"use client";

import React from "react";
import { useMemo, useState } from "react";
import Image from "next/image";
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

import { useOutputLanguage } from "@/components/language-selector";
import { EvidenceBadge, SectionHeader, SignalCard, SignalHero } from "@/components/signal-ui";
import type { ViewerRole } from "@/features/playbook/types";
import {
  calculateProgress,
  companySizeGuidance,
  coreIcpSignals,
  emptyProgress,
  evidenceDescriptions,
  outreachReplyEvidence,
  qualificationChecklist,
  replyBackedSequenceSteps,
  teamProspectReplyEvidence,
  winningMessageGroups,
  winningMessages,
  workSteps,
} from "@/features/playbook/playbook-content";
import { translateUi, type UiTextKey } from "@/lib/ui-translations";
import type { PlaybookData, PlaybookProgressKey, PlaybookProgressState } from "./types";

const sectionLinks = [
  ["learn", "Learn Signal"],
  ["icp", "Signal ICP"],
  ["industries", "Industries"],
  ["personas", "Personas"],
  ["transition", "US Market"],
  ["qualify", "Qualify"],
  ["work", "How to Work"],
  ["winning-messages", "Winning Messages"],
  ["objections", "Objections"],
  ["case-studies", "Case Studies"],
  ["dnc", "Do Not Contact"],
  ["practice", "Practice"],
  ["progress", "Progress"],
] as const;

type SectionId = (typeof sectionLinks)[number][0];

function PlaybookTabs({
  activeSection,
  onChange,
  translate,
}: {
  activeSection: SectionId;
  onChange: (section: SectionId) => void;
  translate: (key: UiTextKey) => string;
}) {
  const translatedLabels: Record<SectionId, string> = {
    learn: "Learn Signal",
    icp: "Signal ICP",
    industries: "Industries",
    personas: "Personas",
    transition: "US Market",
    qualify: "Qualify",
    work: "How to Work",
    "winning-messages": "Winning Messages",
    objections: "Objections",
    "case-studies": "Case Studies",
    dnc: translate("nav.Do Not Contact"),
    practice: "Practice",
    progress: "Progress",
  };

  return (
    <div className="rounded-2xl border border-line bg-cream p-2">
      <div className="flex gap-2 overflow-x-auto">
        {sectionLinks.map(([id, label]) => (
          <button
            className={[
              "shrink-0 rounded-full px-3 py-2 text-sm font-semibold transition",
              activeSection === id
                ? "bg-lime text-ink shadow-soft"
                : "bg-white text-[#5c5a4f] hover:text-ink",
            ].join(" ")}
            key={id}
            onClick={() => onChange(id)}
            type="button"
          >
            {translatedLabels[id] ?? label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompactDetails({
  title,
  eyebrow,
  badge,
  children,
}: {
  title: string;
  eyebrow?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-2xl border border-line bg-cream p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <span>
          {eyebrow ? (
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-olive">
              {eyebrow}
            </span>
          ) : null}
          <span className="block text-base font-semibold text-ink">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-[#6f6d5f]" />
        </span>
      </summary>
      <div className="mt-4 border-t border-line pt-4 text-sm leading-6 text-[#5c5a4f]">
        {children}
      </div>
    </details>
  );
}

function PlaybookSection({
  id,
  eyebrow,
  title,
  description,
  hidden = false,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  if (hidden) {
    return null;
  }

  return (
    <section
      className="scroll-mt-6 rounded-2xl border border-line bg-white p-5 shadow-soft"
      id={id}
    >
      <SectionHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function WarningLabel({ text }: { text: string }) {
  return (
    <span className="inline-flex rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-[#6f6d5f]">
      {text}
    </span>
  );
}

const caseStudyPreviews = [
  {
    match: "appsflyer",
    imageSrc: "/case-studies/appsflyer-signal-case-study.png",
    imageAlt: "AppsFlyer Signal case study preview",
  },
  {
    match: "apollo",
    imageSrc: "/case-studies/apollo-signal-case-study.png",
    imageAlt: "Apollo.io Signal case study preview",
  },
] as const;

function findCaseStudyPreview(title: string) {
  const normalizedTitle = title.toLowerCase();
  return caseStudyPreviews.find((preview) => normalizedTitle.includes(preview.match));
}

type WinningLibraryId = "email" | "linkedin" | "reply";

const winningLibraries: Array<{
  id: WinningLibraryId;
  title: string;
  subtitle: string;
  stepLabels: string[];
}> = [
  {
    id: "email",
    title: "Email sequence library",
    subtitle: "Subjects, first touch, follow-up, proof angle, and close-loop examples.",
    stepLabels: ["Subject", "Email 1", "Email 2", "Email 3", "Close"],
  },
  {
    id: "linkedin",
    title: "LinkedIn message library",
    subtitle: "Connection request, after-connect notes, comment follow-up, and quick chat asks.",
    stepLabels: ["Connection request", "After connect 1", "After connect 2", "Comment follow-up"],
  },
  {
    id: "reply",
    title: "Reply handling library",
    subtitle: "Short responses for deck requests, existing vendors, and common objections.",
    stepLabels: ["Deck request", "Existing vendor", "No competitors", "Close"],
  },
];

function messageLibraryId(channel: string): WinningLibraryId {
  if (channel === "Email") return "email";
  if (channel === "LinkedIn") return "linkedin";
  return "reply";
}

function messageStepLabel(title: string, libraryId: WinningLibraryId) {
  const lowerTitle = title.toLowerCase();

  if (libraryId === "email") {
    if (lowerTitle.includes("subject")) return "Subject";
    if (lowerTitle.includes("first touch")) return "Email 1";
    if (lowerTitle.includes("email 2")) return "Email 2";
    if (lowerTitle.includes("email 3")) return "Email 3";
    if (lowerTitle.includes("email 4")) return "Email 4";
    if (lowerTitle.includes("close loop")) return "Close";
    if (lowerTitle.includes("optimize")) return "Email 2";
    if (lowerTitle.includes("incrementality")) return "Email 3";
    if (lowerTitle.includes("close")) return "Close";
    return "Email example";
  }

  if (libraryId === "linkedin") {
    if (lowerTitle.includes("connection request")) return "Connection request";
    if (lowerTitle.includes("comment")) return "Comment follow-up";
    if (lowerTitle.includes("first touch")) return "Connection request";
    if (lowerTitle.includes("ultra short")) return "After connect 1";
    if (lowerTitle.includes("two-outcome") || lowerTitle.includes("quick chat")) {
      return "After connect 2";
    }
    if (lowerTitle.includes("proof") || lowerTitle.includes("paid strategy")) {
      return "After connect 3";
    }
    return "LinkedIn example";
  }

  if (lowerTitle.includes("deck")) return "Deck request";
  if (lowerTitle.includes("vendor")) return "Existing vendor";
  if (lowerTitle.includes("competitors")) return "No competitors";
  if (lowerTitle.includes("legacy")) return "Rewrite old wording";
  return "Reply example";
}

function messageDisplayTitle(title: string) {
  return title
    .replace(/^Email subject - /, "")
    .replace(/^After connect - /, "")
    .replace(/^LinkedIn /, "")
    .replace(/^Email /, "");
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
  const outputLanguage = useOutputLanguage();
  const t = (key: UiTextKey) => translateUi(key, outputLanguage);
  const [progress, setProgress] = useState<PlaybookProgressState>(emptyProgress);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<SectionId>("learn");
  const [activeWinningLibrary, setActiveWinningLibrary] = useState<WinningLibraryId>("email");
  const [activeWinningStep, setActiveWinningStep] = useState("All");
  const progressView = useMemo(
    () => calculateProgress(progress, viewerRole),
    [progress, viewerRole],
  );
  const activeWinningLibraryConfig = winningLibraries.find(
    (library) => library.id === activeWinningLibrary,
  );
  const activeWinningMessages = winningMessages.filter((message) => {
    if (messageLibraryId(message.channel) !== activeWinningLibrary) return false;
    if (activeWinningStep === "All") return true;
    return messageStepLabel(message.title, activeWinningLibrary) === activeWinningStep;
  });
  const winningStepLabels = ["All", ...(activeWinningLibraryConfig?.stepLabels ?? [])];
  const hasApolloCaseStudy = data.caseStudies.some((record) =>
    record.title.toLowerCase().includes("apollo"),
  );

  function selectWinningLibrary(libraryId: WinningLibraryId) {
    setActiveWinningLibrary(libraryId);
    setActiveWinningStep("All");
  }

  function selectWinningStep(libraryId: WinningLibraryId, stepLabel: string) {
    setActiveWinningLibrary(libraryId);
    setActiveWinningStep(stepLabel);
  }

  function toggleProgress(key: PlaybookProgressKey) {
    setProgress((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="space-y-8">
      <SignalHero
        description={t("playbook.description")}
        eyebrow={t("playbook.eyebrow")}
        title={t("playbook.title")}
      />

      <PlaybookTabs activeSection={activeSection} onChange={setActiveSection} translate={t} />

      <PlaybookSection
        description={t("playbook.learn.description")}
        eyebrow="A. Learn Signal"
        hidden={activeSection !== "learn"}
        id="learn"
        title={t("playbook.learn.title")}
      >
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
        <CompactDetails title={t("playbook.learn.details")}>
          <ul className="space-y-2">
            {[
              "Solo scenario: branded search where paid presence may not be incrementally useful.",
              "Competitive scenario: competitors or intermediaries may change the paid-search decision.",
              "Ghost scenario: paid brand activity may appear useful while organic outcomes tell a different story.",
              "Signal does not promise guaranteed traffic, conversions, exact savings, or universal spend cuts.",
            ].map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </CompactDetails>
      </PlaybookSection>

      <PlaybookSection
        description={t("playbook.icp.description")}
        eyebrow="B. Signal ICP"
        hidden={activeSection !== "icp"}
        id="icp"
        title={t("playbook.icp.title")}
      >
        <div className="grid gap-3 md:grid-cols-2">
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
      </PlaybookSection>

      <PlaybookSection
        description="Strong hypothesis and exploratory segments are useful for testing, not proof."
        eyebrow="C. Industries"
        hidden={activeSection !== "industries"}
        id="industries"
        title={t("playbook.industries.title")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {data.industries.map((industry) => (
            <CompactDetails
              badge={<EvidenceBadge level={industry.evidenceLevel} />}
              key={industry.name}
              title={industry.name}
            >
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
            </CompactDetails>
          ))}
        </div>
      </PlaybookSection>

      <PlaybookSection
        description="Direct Paid Search ownership is often best, but Performance, Growth, Acquisition, Digital, or E-commerce leaders can be equally important when they own the outcome."
        eyebrow="D. Personas"
        hidden={activeSection !== "personas"}
        id="personas"
        title={t("playbook.personas.title")}
      >
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
      </PlaybookSection>

      <PlaybookSection
        eyebrow="E. US Market Transition"
        hidden={activeSection !== "transition"}
        id="transition"
        title={t("playbook.transition.title")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {[
            "Expect titles like VP Performance Marketing, Head of Growth, Director of Demand Generation, SEM Manager, and PPC Lead.",
            "Use shorter, more direct outreach with a professional but less formal tone.",
            "Lead with relevance and a specific reason for writing, not company history.",
            "Use soft, specific CTAs and respect US time zones when scheduling.",
            "Check whether ownership sits at HQ, regional, or global level before assuming the buyer.",
          ].map((item) => (
            <CompactDetails key={item} title="Guidance">
              {item}
            </CompactDetails>
          ))}
        </div>
      </PlaybookSection>

      <PlaybookSection
        description="Use Strong fit, Possible fit, or Do not target. Do not build a fake score."
        eyebrow="F. Qualify an Account"
        hidden={activeSection !== "qualify"}
        id="qualify"
        title={t("playbook.qualify.title")}
      >
        <SignalCard title="Checklist">
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#5c5a4f] sm:grid-cols-2">
            {qualificationChecklist.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </SignalCard>
      </PlaybookSection>

      <PlaybookSection
        eyebrow="G. How to Work"
        hidden={activeSection !== "work"}
        id="work"
        title={t("playbook.work.title")}
      >
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
            {t("home.doNotContact.title")}
          </Link>
          <Link className="signal-button-secondary" href="/create-outreach">
            <Send className="h-4 w-4" />
            {t("workflow.create.title")}
          </Link>
          <Link className="signal-button-secondary" href="/build-sequence">
            <Layers3 className="h-4 w-4" />
            {t("workflow.sequence.title")}
          </Link>
          <Link className="signal-button-secondary" href="/reply-to-prospect">
            <MessageSquareReply className="h-4 w-4" />
            {t("workflow.reply.title")}
          </Link>
        </div>
      </PlaybookSection>

      <PlaybookSection
        description="Start with the channel, choose the step, then copy a proven pattern. Evidence is available below without crowding the page."
        eyebrow="H. Winning Messages"
        hidden={activeSection !== "winning-messages"}
        id="winning-messages"
        title="Winning messages library"
      >
        <div className="grid gap-3 md:grid-cols-3">
          {winningLibraries.map((library) => (
            <button
              aria-pressed={activeWinningLibrary === library.id}
              className={[
                "rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive",
                activeWinningLibrary === library.id
                  ? "border-lime bg-lime text-ink shadow-soft"
                  : "border-line bg-cream text-[#5c5a4f] hover:text-ink",
              ].join(" ")}
              key={library.id}
              onClick={() => selectWinningLibrary(library.id)}
              type="button"
            >
              <span className="block text-base font-semibold text-ink">{library.title}</span>
              <span className="mt-2 block text-sm leading-5">{library.subtitle}</span>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                Reply-backed sequence
              </p>
              <h3 className="mt-2 text-xl font-semibold text-ink">
                Build sequences from the steps that actually got replies
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c5a4f]">
                The CSV exports include subjects, replied templates, and replied steps. They do not
                include full sent bodies, so use this as the proven order and angle map.
              </p>
            </div>
            <WarningLabel text={`${outreachReplyEvidence.relatedReplyRows} reply rows`} />
          </div>
          <div className="mt-5 grid gap-3">
            {replyBackedSequenceSteps.map((step) => (
              <details className="rounded-xl border border-line bg-cream" key={step.step}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4">
                  <span>
                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-olive">
                      {step.step} · {step.replyRows} replies
                    </span>
                    <span className="mt-2 block text-base font-semibold text-ink">
                      {step.role}
                    </span>
                    <span className="mt-1 block text-sm text-[#6f6d5f]">
                      Outreach reply source: {step.replyStep}
                    </span>
                  </span>
                  <ChevronDown aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#6f6d5f]" />
                </summary>
                <div className="grid gap-3 border-t border-line p-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                      Subjects that got replies
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {step.bestSubjects.map((subject) => (
                        <span
                          className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-[#5c5a4f]"
                          key={subject}
                        >
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                      Replied template names
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {step.repliedTemplates.map((template) => (
                        <span
                          className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-[#5c5a4f]"
                          key={template}
                        >
                          {template}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  className="mx-4 mb-4 inline-flex min-h-9 items-center justify-center rounded-full border border-line bg-white px-3 text-xs font-semibold text-olive transition hover:border-lime hover:bg-lime hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
                  onClick={() => selectWinningStep("email", step.step === "Close loop" ? "Close" : step.step)}
                  type="button"
                >
                  Show matching {step.step} patterns
                </button>
              </details>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                {activeWinningLibraryConfig?.title}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-ink">Copy-ready patterns</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c5a4f]">
                {activeWinningLibraryConfig?.subtitle}
              </p>
            </div>
            <WarningLabel text={`${activeWinningMessages.length} examples`} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Winning message steps">
            {winningStepLabels.map((label) => {
              const matchingCount =
                label === "All"
                  ? winningMessages.filter(
                      (message) => messageLibraryId(message.channel) === activeWinningLibrary,
                    ).length
                  : winningMessages.filter(
                      (message) =>
                        messageLibraryId(message.channel) === activeWinningLibrary &&
                        messageStepLabel(message.title, activeWinningLibrary) === label,
                    ).length;

              return (
              <button
                aria-selected={activeWinningStep === label}
                className={[
                  "min-h-9 rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive",
                  activeWinningStep === label
                    ? "border-lime bg-lime text-ink shadow-soft"
                    : "border-line bg-cream text-[#5c5a4f] hover:text-ink",
                ].join(" ")}
                key={label}
                onClick={() => setActiveWinningStep(label)}
                role="tab"
                type="button"
              >
                {label}
                <span className="ml-1 text-[10px] opacity-70">{matchingCount}</span>
              </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-3">
            {activeWinningMessages.length > 0 ? (
              activeWinningMessages.map((item) => (
              <details className="rounded-xl border border-line bg-cream" key={item.title}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4">
                  <span>
                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-olive">
                      {messageStepLabel(item.title, activeWinningLibrary)}
                    </span>
                    <span className="mt-2 block text-base font-semibold text-ink">
                      {messageDisplayTitle(item.title)}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-[#6f6d5f]">
                      {item.useWhen}
                    </span>
                  </span>
                  <ChevronDown aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#6f6d5f]" />
                </summary>
                <div className="space-y-4 border-t border-line p-4 pt-4">
                  {"subject" in item && item.subject ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                        Subject
                      </p>
                      <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ink">
                        {item.subject}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                      Message
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white px-3 py-3 font-sans text-sm leading-6 text-[#34352e]">
                      {item.message}
                    </pre>
                  </div>
                  <details className="rounded-xl border border-line bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">
                      Why this works
                    </summary>
                    <p className="mt-2 text-sm leading-6 text-[#5c5a4f]">{item.whyItWorks}</p>
                  </details>
                </div>
              </details>
              ))
            ) : (
              <div className="rounded-xl border border-line bg-cream p-4 text-sm leading-6 text-[#5c5a4f]">
                No saved pattern for this step yet. Add one from a winning sequence or use the
                reply-backed map above to draft it.
              </div>
            )}
          </div>
        </div>

        <details className="rounded-2xl border border-line bg-cream p-5">
          <summary className="cursor-pointer text-base font-semibold text-ink">
            Evidence, rules, and raw examples
          </summary>
          <div className="mt-4 space-y-6">
        <div className="mb-6 rounded-2xl border border-line bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                Outreach reply evidence
              </p>
              <h3 className="mt-2 text-xl font-semibold text-ink">
                Signal and legacy Cross Brand replies
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c5a4f]">
                {outreachReplyEvidence.scope}
              </p>
            </div>
            <WarningLabel text={`${outreachReplyEvidence.relatedReplyRows} relevant replies`} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {outreachReplyEvidence.strongestSubjectClusters.map((cluster) => (
              <div className="rounded-xl border border-line bg-cream p-4" key={cluster.label}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{cluster.label}</p>
                  <WarningLabel text={`${cluster.replyRows} replies`} />
                </div>
                <p className="mt-2 text-sm leading-6 text-[#5c5a4f]">{cluster.useFor}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {outreachReplyEvidence.strongestTemplateClusters.map((cluster) => (
              <div className="rounded-xl border border-line bg-cream p-4" key={cluster.label}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{cluster.label}</p>
                  <WarningLabel text={`${cluster.replyRows} replies`} />
                </div>
                <p className="mt-2 text-sm leading-6 text-[#5c5a4f]">{cluster.useFor}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-line bg-cream p-4 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                Copy rules
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[#34352e]">
                {outreachReplyEvidence.copyRules.map((rule) => (
                  <li key={rule}>- {rule}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-cream p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                Product naming
              </p>
              <p className="mt-3 text-sm leading-6 text-[#34352e]">
                {outreachReplyEvidence.currentProductName}
              </p>
              <p className="mt-3 text-xs leading-5 text-[#6f6d5f]">
                {outreachReplyEvidence.limitation}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-cream p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                Sequence rules from replies
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[#34352e]">
                {outreachReplyEvidence.stepLearning.map((rule) => (
                  <li key={rule}>- {rule}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-cream p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                Persona language
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[#34352e]">
                {outreachReplyEvidence.titleLearning.map((rule) => (
                  <li key={rule}>- {rule}</li>
                ))}
              </ul>
            </div>
          </div>

          <details className="mt-4 rounded-xl border border-line bg-cream p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Account examples from relevant replies
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {outreachReplyEvidence.replyingAccountExamples.map((account) => (
                <span
                  className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-[#5c5a4f]"
                  key={account}
                >
                  {account}
                </span>
              ))}
            </div>
          </details>
        </div>

        <div className="mb-6 rounded-2xl border border-line bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                Team reply prospect evidence
              </p>
              <h3 className="mt-2 text-xl font-semibold text-ink">
                Who replied across the team
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c5a4f]">
                {teamProspectReplyEvidence.scope}
              </p>
            </div>
            <WarningLabel
              text={`${teamProspectReplyEvidence.relatedBrandOrPaidMediaProspects} brand / paid media matches`}
            />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {teamProspectReplyEvidence.personaLearning.map((persona) => (
              <div className="rounded-xl border border-line bg-cream p-4" key={persona.label}>
                <p className="font-semibold text-ink">{persona.label}</p>
                <p className="mt-2 text-sm leading-6 text-[#5c5a4f]">{persona.guidance}</p>
                <div className="mt-3 space-y-1 text-xs leading-5 text-[#6f6d5f]">
                  {persona.examples.map((example) => (
                    <p key={example}>• {example}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-cream p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                Copy rules by persona
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[#34352e]">
                {teamProspectReplyEvidence.copyRules.map((rule) => (
                  <li key={rule}>- {rule}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-cream p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                Useful account and industry signals
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...teamProspectReplyEvidence.industryLearning, ...teamProspectReplyEvidence.accountExamples].map(
                  (item) => (
                    <span
                      className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-[#5c5a4f]"
                      key={item}
                    >
                      {item}
                    </span>
                  ),
                )}
              </div>
              <p className="mt-3 text-xs leading-5 text-[#6f6d5f]">
                {teamProspectReplyEvidence.limitation}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {winningMessageGroups.map((group) => {
            const groupMessages = winningMessages.filter((item) =>
              group.channels.includes(item.channel),
            );

            return (
              <div className="rounded-2xl border border-line bg-white p-5" key={group.label}>
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                      {group.label} examples
                    </p>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c5a4f]">
                      {group.description}
                    </p>
                  </div>
                  <WarningLabel text={`${groupMessages.length} unique examples`} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {groupMessages.map((item) => (
                    <details
                      className="rounded-2xl border border-line bg-cream p-5"
                      key={item.title}
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                        <span>
                          <span className="block text-lg font-semibold text-ink">
                            {item.title}
                          </span>
                          <span className="mt-1 block text-sm text-[#6f6d5f]">
                            {item.useWhen}
                          </span>
                        </span>
                        <WarningLabel text={item.channel} />
                      </summary>
                      <div className="mt-4 space-y-4 border-t border-line pt-4">
                        {"subject" in item && item.subject ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                              Subject
                            </p>
                            <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ink">
                              {item.subject}
                            </p>
                          </div>
                        ) : null}
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                            Message
                          </p>
                          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white px-3 py-3 font-sans text-sm leading-6 text-[#34352e]">
                            {item.message}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                            Why it works
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[#5c5a4f]">
                            {item.whyItWorks}
                          </p>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
          </div>
        </details>
      </PlaybookSection>

      <PlaybookSection
        description="Competitor language stays cautious. Restricted wording is not send-ready proof."
        eyebrow="I. Objections"
        hidden={activeSection !== "objections"}
        id="objections"
        title={t("playbook.objections.title")}
      >
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
            <CompactDetails key={objection} title={objection}>
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
            </CompactDetails>
          ))}
        </div>
      </PlaybookSection>

      <PlaybookSection
        description="Case studies retain their review and usage state. Do not treat restricted stories as universally approved."
        eyebrow="J. Case Studies"
        hidden={activeSection !== "case-studies"}
        id="case-studies"
        title={t("playbook.caseStudies.title")}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {data.caseStudies.length > 0 ? (
            <>
              {data.caseStudies.map((record) => {
                const preview = findCaseStudyPreview(record.title);

                return (
                  <details
                    className="overflow-hidden rounded-2xl border border-line bg-white"
                    key={record.id}
                  >
                    {preview ? (
                      <Image
                        alt={preview.imageAlt}
                        className="aspect-[16/9] w-full border-b border-line object-cover object-top"
                        height={800}
                        src={preview.imageSrc}
                        width={1400}
                      />
                    ) : null}
                    <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-5">
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
                    </summary>
                    <div className="space-y-2 px-5 pb-5 text-sm leading-6 text-[#5c5a4f]">
                      <p>{record.industries.join(", ") || "Industry not tagged"}</p>
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
                  </details>
                );
              })}
              {!hasApolloCaseStudy ? (
                <details className="overflow-hidden rounded-2xl border border-line bg-white">
                  <Image
                    alt="Apollo.io Signal case study preview"
                    className="aspect-[16/9] w-full border-b border-line object-cover object-top"
                    height={800}
                    src="/case-studies/apollo-signal-case-study.png"
                    width={1400}
                  />
                  <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-5">
                    <h3 className="text-lg font-semibold text-ink">
                      Apollo.io reduces blended CPC while increasing conversion rate
                    </h3>
                    <WarningLabel text="Internal use only" />
                  </summary>
                  <div className="space-y-2 px-5 pb-5 text-sm leading-6 text-[#5c5a4f]">
                    <p>SaaS</p>
                    <p>
                      <strong>Blended CPC:</strong> -43% North America data
                    </p>
                    <p>
                      <strong>Cumulative savings:</strong> $1M+
                    </p>
                    <p>
                      <strong>Conversion rate:</strong> +14% aggregated across all markets
                    </p>
                    <p>Source: Case Study Signal AppsFlyer / Apollo.io PDF</p>
                    <p>Best-fit persona: Paid Acquisition, Paid Search, Performance Marketing</p>
                  </div>
                </details>
              ) : null}
            </>
          ) : (
            <SignalCard
              description="No imported case studies were available from the configured database. Do not invent customer evidence."
              title="No case studies available"
            />
          )}
        </div>
      </PlaybookSection>

      <PlaybookSection
        eyebrow="K. Do Not Contact"
        hidden={activeSection !== "dnc"}
        id="dnc"
        title={t("playbook.dnc.title")}
      >
        <SignalCard
          description="Use the Do Not Contact list before creating outreach or sequences. The current phase does not connect a CRM or collect external data."
          href="/do-not-contact"
          icon={Ban}
          title="Open Do Not Contact"
        />
      </PlaybookSection>

      <PlaybookSection
        description="Write or choose an answer, reveal guidance, and mark practice complete."
        eyebrow="L. Practice"
        hidden={activeSection !== "practice"}
        id="practice"
        title={t("playbook.practice.title")}
      >
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
      </PlaybookSection>

      <PlaybookSection
        description="No time tracking, behavioral monitoring, or productivity scoring."
        eyebrow="M. Progress"
        hidden={activeSection !== "progress"}
        id="progress"
        title={t("playbook.progress.title")}
      >
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
      </PlaybookSection>
    </div>
  );
}
