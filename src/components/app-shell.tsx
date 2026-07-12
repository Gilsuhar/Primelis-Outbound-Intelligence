"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { primaryNavigation, secondaryNavigation } from "@/lib/navigation";

type NavigationItem = (typeof primaryNavigation | typeof secondaryNavigation)[number];

function NavigationSection({
  label,
  items,
  muted = false,
}: {
  label: string;
  items: readonly NavigationItem[];
  muted?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-2">
      <p className="px-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
        {label}
      </p>
      <nav aria-label={label} className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              className={[
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-[#e7f0ed] text-signal"
                  : muted
                    ? "text-stone-500 hover:bg-white hover:text-ink"
                    : "text-stone-700 hover:bg-white hover:text-ink",
              ].join(" ")}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-line bg-[#f2eee6]/95 px-4 py-4 lg:fixed lg:inset-y-0 lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 lg:block">
          <Link className="block min-w-0" href="/">
            <p className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-signal">
              Primelis
            </p>
            <p className="truncate text-lg font-semibold text-ink">Outbound Intelligence</p>
          </Link>
          <div className="hidden items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-stone-600 sm:flex lg:mt-5">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[#32795d]" />
            Signal only
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-6xl space-y-6 lg:mt-8">
          <NavigationSection label="Workflows" items={primaryNavigation} />
          <NavigationSection label="Knowledge" items={secondaryNavigation} muted />
        </div>
      </aside>

      <main className="min-w-0 flex-1 lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
