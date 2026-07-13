import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { getTrustedRoleContext } from "@/lib/role-context";

import "./globals.css";

export const metadata: Metadata = {
  title: "Primelis Outbound Intelligence",
  description: "Internal sales intelligence foundation for Primelis Signal.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const viewer = getTrustedRoleContext();

  return (
    <html lang="en">
      <body>
        <AppShell role={viewer.role}>{children}</AppShell>
      </body>
    </html>
  );
}
