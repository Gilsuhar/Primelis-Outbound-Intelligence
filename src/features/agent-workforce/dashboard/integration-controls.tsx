"use client";
import React, { useState } from "react";
import type { IntegrationHealth } from "./contracts";
export function IntegrationControls({
  integration,
  refresh,
}: {
  integration: IntegrationHealth;
  refresh?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (integration.id !== "HUBSPOT" && integration.id !== "OUTREACH") return null;
  const job = integration.sync?.job;
  async function act(action: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/sales-agent/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: integration.id, action, requestKey: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Sync unavailable");
      setNotice(
        action === "CHECK"
          ? "Authenticated read checks passed"
          : "Job checkpoint saved. Refresh or resume to continue; incomplete history remains HOLD.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Integration unavailable");
    } finally {
      setBusy(false);
      refresh?.();
    }
  }
  return (
    <div className="mt-2 space-y-2 text-xs text-stone-600">
      {integration.sync && (
        <>
          <p>Last successful sync: {integration.sync.lastSuccessfulSync ?? "Never"}</p>
          <p>Historical coverage: {integration.sync.coverage.replaceAll("_", " ")}</p>
          {!!integration.sync.missingScopes.length && (
            <p className="break-words">
              Review required scopes / user visibility: {integration.sync.missingScopes.join(", ")}
            </p>
          )}
          {job && (
            <p>
              Job: {job.status}. Imported {job.imported}, updated {job.updated}.{" "}
              {job.pending.length} queued in this batch. {job.error ?? ""}
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {[
          "CHECK",
          integration.sync?.lastSuccessfulSync ? "INCREMENTAL" : "INITIAL",
          ...(job && job.status !== "COMPLETED" ? ["RESUME"] : []),
        ].map((action) => (
          <button
            key={action}
            type="button"
            disabled={busy}
            onClick={() => void act(action)}
            className="rounded-lg border border-line px-2 py-2 font-medium disabled:opacity-50"
          >
            {action === "CHECK"
              ? "Check access"
              : action === "RESUME"
                ? "Resume sync"
                : "Sync read-only"}
          </button>
        ))}
      </div>
      <p role="status" className="break-words">
        {notice}
      </p>
    </div>
  );
}
