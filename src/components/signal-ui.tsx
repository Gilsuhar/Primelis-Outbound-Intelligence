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
  compactOnMobile = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: { href: string; label: string };
  compactOnMobile?: boolean;
}) {
  return (
    <section
      className={[
        "overflow-hidden rounded-[20px] border border-line bg-gradient-to-br from-[#F1F3C8] via-[#E2E8A8] to-[#C8D189] shadow-signal",
        compactOnMobile ? "p-3.5 sm:p-8" : "p-6 sm:p-8",
      ].join(" ")}
    >
      <div className={["max-w-3xl", compactOnMobile ? "space-y-2.5 sm:space-y-4" : "space-y-4"].join(" ")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4f6624] sm:text-xs sm:tracking-[0.2em]">{eyebrow}</p>
        <h1
          className={[
            "overflow-visible pb-1 font-display font-semibold leading-[1.1] text-ink sm:pb-3 sm:leading-[1.22]",
            compactOnMobile ? "text-[1.95rem] sm:text-5xl" : "text-4xl sm:text-5xl",
          ].join(" ")}
        >
          {title}
        </h1>
        <p
          className={[
            "max-w-2xl text-[#34352e]",
            compactOnMobile ? "text-[13px] leading-5 sm:text-base sm:leading-7" : "text-base leading-7",
          ].join(" ")}
        >
          {description}
        </p>
        {action ? (
          <Link
            className={[
              "signal-button-primary",
              compactOnMobile ? "mt-1 px-3.5 py-2 text-[13px] sm:px-4 sm:py-[0.7rem] sm:text-sm" : "",
            ].join(" ")}
            href={action.href}
          >
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
