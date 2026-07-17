import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { getPublicUser } from "@/lib/auth/server";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
  weight: ["500", "600", "700"],
});

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
      <body className={`${inter.variable} ${cormorant.variable}`}>
        <AppShell viewer={viewer}>{children}</AppShell>
      </body>
    </html>
  );
}
