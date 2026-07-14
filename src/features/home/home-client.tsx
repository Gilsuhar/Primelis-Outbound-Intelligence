"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Ban, BookOpen, Brain, Building2, Layers3, MessageSquareReply, Send } from "lucide-react";

import { useOutputLanguage } from "@/components/language-selector";
import { SignalCard, SignalHero } from "@/components/signal-ui";
import { adminNavigation } from "@/lib/navigation";
import { translateNavigationLabel, translateUi } from "@/lib/ui-translations";

const primaryActions = [
  {
    titleKey: "home.learnSignal.title",
    descriptionKey: "home.learnSignal.description",
    href: "/playbook",
    icon: BookOpen,
  },
  {
    titleKey: "home.createOutreach.title",
    descriptionKey: "home.createOutreach.description",
    href: "/create-outreach",
    icon: Send,
  },
  {
    titleKey: "home.buildSequence.title",
    descriptionKey: "home.buildSequence.description",
    href: "/build-sequence",
    icon: Layers3,
  },
  {
    titleKey: "home.replyToProspect.title",
    descriptionKey: "home.replyToProspect.description",
    href: "/reply-to-prospect",
    icon: MessageSquareReply,
  },
  {
    titleKey: "home.doNotContact.title",
    descriptionKey: "home.doNotContact.description",
    href: "/do-not-contact",
    icon: Ban,
  },
] as const;

const mobileWorkspaceActions = [
  {
    titleKey: "home.learnSignal.title",
    descriptionKey: "home.learnSignal.description",
    href: "/playbook",
    icon: BookOpen,
  },
  {
    titleKey: "home.createOutreach.title",
    descriptionKey: "home.createOutreach.description",
    href: "/create-outreach",
    icon: Send,
  },
  {
    titleKey: "home.accountResearch.title",
    descriptionKey: "home.accountResearch.description",
    href: "/account-research",
    icon: Building2,
  },
  {
    titleKey: "home.buildSequence.title",
    descriptionKey: "home.buildSequence.description",
    href: "/build-sequence",
    icon: Layers3,
  },
  {
    titleKey: "home.replyToProspect.title",
    descriptionKey: "home.replyToProspect.description",
    href: "/reply-to-prospect",
    icon: MessageSquareReply,
  },
  {
    titleKey: "home.doNotContact.title",
    descriptionKey: "home.doNotContact.description",
    href: "/do-not-contact",
    icon: Ban,
  },
  {
    titleKey: "home.askSignalBrain.title",
    descriptionKey: "home.askSignalBrain.description",
    href: "/ask-signal-brain",
    icon: Brain,
  },
] as const;

export function HomeClient({ showAdmin }: { showAdmin: boolean }) {
  const language = useOutputLanguage();
  const [activeMobileHref, setActiveMobileHref] = useState<(typeof mobileWorkspaceActions)[number]["href"]>(
    mobileWorkspaceActions[0].href,
  );
  const activeMobileAction =
    mobileWorkspaceActions.find((action) => action.href === activeMobileHref) ?? mobileWorkspaceActions[0];
  const ActiveMobileIcon = activeMobileAction.icon;

  return (
    <div className="space-y-8">
      <SignalHero
        action={{ href: "/playbook", label: translateUi("home.openPlaybook", language) }}
        compactOnMobile
        description={translateUi("home.description", language)}
        eyebrow={translateUi("home.eyebrow", language)}
        title={translateUi("home.title", language)}
      />

      <section
        aria-label="Mobile workspace"
        className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 overflow-x-hidden lg:hidden"
      >
        <div
          aria-label="Workspace tools"
          className="sticky top-[calc(env(safe-area-inset-top)+0.75rem)] max-h-[calc(100svh-env(safe-area-inset-top)-1.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white p-1.5 shadow-soft"
          role="tablist"
        >
          <div className="space-y-1">
            {mobileWorkspaceActions.map((action) => {
              const Icon = action.icon;
              const isActive = action.href === activeMobileHref;

              return (
                <button
                  aria-controls="mobile-workspace-panel"
                  aria-current={isActive ? "page" : undefined}
                  aria-selected={isActive}
                  className={[
                    "flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center text-[11px] font-semibold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive",
                    isActive
                      ? "border-[#d8ec42] bg-lime text-ink shadow-soft"
                      : "border-transparent bg-transparent text-[#6f6d5f] hover:border-line hover:bg-cream hover:text-ink",
                  ].join(" ")}
                  id={`mobile-tab-${action.href.replaceAll("/", "-") || "home"}`}
                  key={action.href}
                  onClick={() => setActiveMobileHref(action.href)}
                  role="tab"
                  type="button"
                >
                  <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="max-w-full break-words">
                    {translateUi(action.titleKey, language)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <article
          aria-labelledby={`mobile-tab-${activeMobileAction.href.replaceAll("/", "-") || "home"}`}
          className="min-w-0 rounded-2xl border border-line bg-cream p-4 shadow-soft"
          id="mobile-workspace-panel"
          role="tabpanel"
        >
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-lime text-ink">
            <ActiveMobileIcon aria-hidden="true" className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-semibold leading-tight text-ink">
            {translateUi(activeMobileAction.titleKey, language)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#6f6d5f]">
            {translateUi(activeMobileAction.descriptionKey, language)}
          </p>
          <Link
            className="mt-5 inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-full bg-signal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-[#1d4e5f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
            href={activeMobileAction.href}
          >
            {translateUi("home.openTool", language)}
            <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </Link>
        </article>
      </section>

      <section aria-label="Primary actions" className="hidden gap-4 lg:grid lg:grid-cols-5">
        {primaryActions.map((action) => (
          <SignalCard
            description={translateUi(action.descriptionKey, language)}
            href={action.href}
            icon={action.icon}
            key={action.href}
            title={translateUi(action.titleKey, language)}
          />
        ))}
      </section>

      {showAdmin ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">
            {translateUi("home.adminShortcuts", language)}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {adminNavigation.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-cream px-3 py-2 text-sm font-medium text-[#6f6d5f] transition hover:text-ink"
                  href={item.href}
                  key={item.href}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {translateNavigationLabel(item.label, language)}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
