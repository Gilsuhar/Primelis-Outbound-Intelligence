import type { ReactNode } from "react";

type WorkflowPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  badge?: ReactNode;
  children: ReactNode;
};

export function WorkflowPage({
  eyebrow,
  title,
  description,
  badge,
  children,
}: WorkflowPageProps) {
  return (
    <div className="relative -mx-2 space-y-6 px-2 pb-10 sm:-mx-4 sm:px-4">
      <section className="overflow-hidden rounded-[1.6rem] border border-white/70 bg-[linear-gradient(135deg,#f7ffb9_0%,#dce88f_100%)] p-6 shadow-[0_24px_70px_rgba(20,20,20,0.22)] sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-olive">
              {eyebrow}
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
              {title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-[#34352e] sm:text-base">
              {description}
            </p>
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      </section>

      {children}
    </div>
  );
}

export function WorkflowBadge({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-2 text-xs font-semibold text-[#34352e] shadow-sm backdrop-blur">
      {children}
    </div>
  );
}

export function WorkflowCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-2xl border border-line bg-white/95 p-5 shadow-[0_16px_45px_rgba(20,20,20,0.07)]",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}

export function WorkflowSectionTitle({
  icon,
  title,
}: {
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line pb-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime text-ink">
        {icon}
      </span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
    </div>
  );
}
