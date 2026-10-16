import React from "react";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/server";
export default async function DevelopmentDraftPreview() {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL_ENV) notFound();
  await requireCurrentUser();
  const { SyntheticDraftPreview } =
    await import("@/features/agent-workforce/development/synthetic-draft-preview");
  return <SyntheticDraftPreview />;
}
