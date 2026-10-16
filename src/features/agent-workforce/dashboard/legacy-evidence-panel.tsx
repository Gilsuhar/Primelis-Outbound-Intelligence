"use client";
import React, { useState } from "react";
import dynamic from "next/dynamic";
const EvidenceReview = dynamic(
  () =>
    import("@/features/sales-agent/evidence-review-client").then(
      (module) => module.EvidenceReviewClient,
    ),
  { loading: () => <p className="p-4 text-sm">Loading legacy evidence review…</p> },
);
export function LegacyEvidencePanel() {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-2xl border border-line bg-cream p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer font-semibold">
        Legacy evidence review & manual SERP verification
      </summary>
      {open && <EvidenceReview />}
    </details>
  );
}
