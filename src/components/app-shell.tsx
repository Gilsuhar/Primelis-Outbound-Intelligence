"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";

import type { UserRole } from "@/features/knowledge/types";
import { signOutAction } from "@/app/auth/actions";
import type { PublicUser } from "@/lib/private-preview-auth";
import { getNavigationForRole, adminNavigation, salesNavigation } from "@/lib/navigation";
import { LanguageSelector, useOutputLanguage } from "@/components/language-selector";
import { translateNavigationLabel, translateUi } from "@/lib/ui-translations";

type NavigationItem = (typeof salesNavigation | typeof adminNavigation)[number];

function NavigationSection({
  label,
  items,
  muted = false,
  language,
}: {
  label: string;
  items: readonly NavigationItem[];
  muted?: boolean;
  language: ReturnType<typeof useOutputLanguage>;
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
                  ? "bg-lime text-ink"
                  : muted
                    ? "text-[#6f6d5f] hover:bg-white hover:text-ink"
                    : "text-[#34352e] hover:bg-white hover:text-ink",
              ].join(" ")}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{translateNavigationLabel(item.label, language)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppShell({
  children,
  viewer,
}: {
  children: React.ReactNode;
  viewer: PublicUser | null;
}) {
  const language = useOutputLanguage();

  if (!viewer) {
    return <main className="min-h-screen bg-cream">{children}</main>;
  }

  const role: UserRole = viewer.role;
  const navigation = getNavigationForRole(role);

  return (
    <div className="min-h-screen bg-white lg:flex">
      <aside className="border-b border-line bg-cream/95 px-4 py-4 lg:fixed lg:inset-y-0 lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 lg:block">
          <Link className="flex min-w-0 items-center gap-3" href="/">
            <Image
              alt="Signal"
              className="h-10 w-10 rounded-xl object-cover"
              height={40}
              priority
              src="/brand/logo signal.jpg"
              width={40}
            />
            <span className="block min-w-0">
              <span className="block truncate text-xs font-semibold uppercase tracking-[0.18em] text-olive">
                Primelis
              </span>
              <span className="block truncate text-lg font-semibold text-ink">Signal</span>
            </span>
          </Link>
          <div className="hidden flex-col gap-2 sm:flex lg:mt-5">
            <div className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-xs font-medium text-[#6f6d5f]">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-olive" />
              {role === "KNOWLEDGE_ADMIN"
                ? translateUi("shell.adminView", language)
                : translateUi("shell.salesView", language)}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs text-[#6f6d5f]">
              <span className="min-w-0 truncate">{viewer.email}</span>
              <form action={signOutAction}>
                <button
                  aria-label="Sign out"
                  className="rounded-full p-1 text-olive transition hover:bg-cream hover:text-ink"
                  type="submit"
                >
                  <LogOut aria-hidden="true" className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-6xl space-y-6 lg:mt-8">
          <NavigationSection
            label={translateUi("nav.sales", language)}
            items={navigation.sales}
            language={language}
          />
          {navigation.admin.length > 0 ? (
            <NavigationSection
              label={translateUi("nav.admin", language)}
              items={navigation.admin}
              language={language}
              muted
            />
          ) : null}
        </div>
      </aside>

      <main className="min-w-0 flex-1 lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-10 lg:py-6">
          <div className="mb-5 flex justify-end">
            <LanguageSelector />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
