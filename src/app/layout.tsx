import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { getPublicUser } from "@/lib/auth/server";
import { isPreviewRestricted } from "@/lib/preview-policy.mjs";

import "./globals.css";

export const metadata: Metadata = {
  title: "Primelis Outbound Intelligence",
  description: "Internal sales intelligence foundation for Primelis Signal.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const viewer = await getPublicUser();

  return (
    <html lang="en">
      <body>
        <AppShell viewer={viewer} previewRestricted={isPreviewRestricted()}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
