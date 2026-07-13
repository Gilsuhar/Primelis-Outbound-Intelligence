import Link from "next/link";
import React from "react";
import type { ComponentType, ReactNode } from "react";
import { ArrowRight } from "lucide-react";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export function SignalHero({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-line bg-gradient-to-br from-[#F1F3C8] via-[#E2E8A8] to-[#C8D189] p-6 shadow-signal sm:p-8">
      <div className="max-w-3xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4f6624]">{eyebrow}</p>
        <h1 className="overflow-visible pb-3 font-display text-4xl font-semibold leading-[1.22] text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="max-w-2xl text-base leading-7 text-[#34352e]">{description}</p>
        {action ? (
          <Link className="signal-button-primary" href={action.href}>
            {action.label}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function SignalCard({
  title,
  description,
  href,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  icon?: IconComponent;
  children?: ReactNode;
}) {
  const content = (
    <div className="h-full rounded-2xl border border-line bg-cream p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-signal">
      {Icon ? (
        <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-lime text-ink">
          <Icon aria-hidden={true} className="h-5 w-5" />
        </span>
      ) : null}
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-[#6f6d5f]">{description}</p> : null}
      {children}
    </div>
  );

  return href ? (
    <Link className="block focus:outline-none" href={href}>
      {content}
    </Link>
  ) : (
    content
  );
}

export function EvidenceBadge({
  level,
}: {
  level: "PROVEN" | "STRONG_HYPOTHESIS" | "EXPLORATORY";
}) {
  const label =
    level === "STRONG_HYPOTHESIS"
      ? "Strong hypothesis"
      : level === "PROVEN"
        ? "Proven"
        : "Exploratory";
  const classes =
    level === "PROVEN"
      ? "bg-lime text-ink"
      : level === "STRONG_HYPOTHESIS"
        ? "bg-[#e8ecd1] text-[#485f22]"
        : "bg-white text-[#7A7868]";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-olive">{eyebrow}</p>
      ) : null}
      <h2 className="font-display text-3xl font-semibold text-ink">{title}</h2>
      {description ? (
        <p className="max-w-3xl text-sm leading-6 text-[#6f6d5f]">{description}</p>
      ) : null}
    </div>
  );
}
