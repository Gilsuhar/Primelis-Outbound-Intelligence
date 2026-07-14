"use client";

import Link from "next/link";
import { Ban, BookOpen, Layers3, MessageSquareReply, Send } from "lucide-react";

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

export function HomeClient({ showAdmin }: { showAdmin: boolean }) {
  const language = useOutputLanguage();

  return (
    <div className="space-y-8">
      <SignalHero
        action={{ href: "/playbook", label: translateUi("home.openPlaybook", language) }}
        description={translateUi("home.description", language)}
        eyebrow={translateUi("home.eyebrow", language)}
        title={translateUi("home.title", language)}
      />

      <section aria-label="Primary actions" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
