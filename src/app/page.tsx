import Link from "next/link";
import { ArrowRight, Brain, Layers3, MessageSquareReply, Send } from "lucide-react";

import { secondaryNavigation } from "@/lib/navigation";

const primaryActions = [
  {
    title: "Create Outreach",
    description: "Prepare a cold email or LinkedIn message using approved Signal knowledge.",
    href: "/create-outreach",
    icon: Send,
  },
  {
    title: "Reply to Prospect",
    description: "Draft a professional response from a pasted prospect message.",
    href: "/reply-to-prospect",
    icon: MessageSquareReply,
  },
  {
    title: "Build Sequence",
    description: "Plan a non-repetitive multistep sales sequence.",
    href: "/build-sequence",
    icon: Layers3,
  },
  {
    title: "Ask Signal Brain",
    description: "Ask questions against approved Signal knowledge.",
    href: "/ask-signal-brain",
    icon: Brain,
  },
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="max-w-3xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          Primelis Signal
        </p>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-ink sm:text-4xl">
            Outbound intelligence for safer, sharper sales messaging.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-stone-600">
            Start with one of the core salesperson workflows. Approved knowledge, review history,
            and source visibility stay close to the work without crowding the screen.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {primaryActions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              className="group rounded-lg border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-signal hover:shadow-md focus:outline-none focus:ring-2 focus:ring-signal focus:ring-offset-2 focus:ring-offset-paper"
              href={action.href}
              key={action.href}
            >
              <div className="flex min-h-40 flex-col justify-between gap-6">
                <div className="space-y-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#e7f0ed] text-signal">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-ink">{action.title}</h2>
                    <p className="text-sm leading-6 text-stone-600">{action.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-signal">
                  Open workflow
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 transition group-hover:translate-x-1"
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="border-t border-line pt-6">
        <div className="flex flex-wrap gap-3">
          {secondaryNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-stone-600 transition hover:border-stone-400 hover:text-ink"
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
    </div>
  );
}
