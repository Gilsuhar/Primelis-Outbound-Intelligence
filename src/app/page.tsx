import Link from "next/link";
import { Ban, BookOpen, Layers3, MessageSquareReply, Send } from "lucide-react";

import { SignalCard, SignalHero } from "@/components/signal-ui";
import { adminNavigation } from "@/lib/navigation";
import { requireCurrentUser } from "@/lib/auth/server";

const primaryActions = [
  {
    title: "Learn Signal",
    description: "Review ICP, personas, objections, and US-market guidance.",
    href: "/playbook",
    icon: BookOpen,
  },
  {
    title: "Create Outreach",
    description: "Draft a concise email or LinkedIn message from approved Signal knowledge.",
    href: "/create-outreach",
    icon: Send,
  },
  {
    title: "Build Sequence",
    description: "Plan a short multi-step sequence with a clear angle.",
    href: "/build-sequence",
    icon: Layers3,
  },
  {
    title: "Reply to Prospect",
    description: "Answer a prospect message with source-backed guidance.",
    href: "/reply-to-prospect",
    icon: MessageSquareReply,
  },
  {
    title: "Check Do Not Contact",
    description: "Search account suppression guidance before outreach.",
    href: "/do-not-contact",
    icon: Ban,
  },
];

export default async function HomePage() {
  const viewer = await requireCurrentUser();
  const showAdmin = viewer.role === "KNOWLEDGE_ADMIN";

  return (
    <div className="space-y-8">
      <SignalHero
        action={{ href: "/playbook", label: "Open Signal Playbook" }}
        description="A focused workspace for learning Signal, checking fit, and creating careful outbound messages for the US market."
        eyebrow="Primelis Signal"
        title="Simple tools for sharper Signal selling."
      />

      <section aria-label="Primary actions" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {primaryActions.map((action) => (
          <SignalCard
            description={action.description}
            href={action.href}
            icon={action.icon}
            key={action.href}
            title={action.title}
          />
        ))}
      </section>

      {showAdmin ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">
            Admin shortcuts
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
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
