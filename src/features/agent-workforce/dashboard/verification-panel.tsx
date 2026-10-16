"use client";
import React, { useState } from "react";
import type { DashboardProspect } from "./contracts";
import type { VerificationKind } from "@/features/sales-agent/verification/contracts";
import { sameVerificationIdentity } from "@/features/sales-agent/verification/contracts";
export function VerificationPanel({ prospect }: { prospect: DashboardProspect }) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function retry(kind: VerificationKind) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/sales-agent/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: prospect.contact.hubspotRecordId,
          kind,
          requestKey: crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Verification unavailable");
      setNotice(`${result.data.message}. Refresh the workspace to inspect the persisted result.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Verification unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-6"
      aria-label="Evidence verification gates"
    >
      <h2 className="font-semibold">Evidence verification · {prospect.qualification.status}</h2>
      <p className="mt-2 text-xs text-stone-600">
        Eligibility is not outreach approval. Evaluated {prospect.qualification.evaluatedAt}.
      </p>
      <ul className="mt-4 space-y-3">
        {prospect.qualification.gates.map((gate) => (
          <li key={gate.id} className="border-t border-line pt-3 text-sm">
            <p className="flex flex-wrap justify-between gap-2 font-medium">
              <span>{gate.label}</span>
              <span>{gate.state}</span>
            </p>
            <p className="mt-1 break-words text-xs text-stone-600">
              {gate.reason} · {gate.resolution.replaceAll("_", " ")} · checked{" "}
              {gate.checkedAt ?? "not verified"}
            </p>
            {gate.state !== "CLEAR" && <p className="mt-1 text-xs">Next: {gate.nextAction}</p>}
            {gate.evidence.map((proof, i) => (
              <p key={i} className="mt-1 break-words text-xs text-stone-500">
                {proof.provider}: {proof.sourceRecordId} · {proof.freshness} ·{" "}
                {proof.verifiedAt ?? "no validation timestamp"}
              </p>
            ))}
          </li>
        ))}
      </ul>
      {!!prospect.qualification.missingPermissions.length && (
        <p className="mt-3 break-words text-xs">
          Permissions to review: {prospect.qualification.missingPermissions.join("; ")}
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["EMAIL", "EMPLOYMENT"] as const).map((kind) => {
          const attempt = prospect.verification[kind],
            result = attempt?.result;
          const matches = !!attempt && sameVerificationIdentity(attempt.identity, prospect.contact);
          const age = result
            ? Date.parse(prospect.evaluatedAt) - Date.parse(result.proof.checkedAt)
            : Infinity;
          const status = !matches
            ? "UNKNOWN"
            : attempt?.state !== "COMPLETED"
              ? attempt?.state === "RUNNING" &&
                Date.parse(attempt.leaseUntil) <= Date.parse(prospect.evaluatedAt)
                ? "UNKNOWN"
                : (attempt?.state ?? "UNKNOWN")
              : age < 0
                ? "UNKNOWN"
                : age > 30 * 86400000
                  ? "STALE"
                  : (result?.status ?? "UNKNOWN");
          return (
            <div key={kind} className="min-w-0 rounded-xl bg-stone-50 p-3 text-xs">
              <h3 className="font-semibold">
                {kind === "EMAIL" ? "Business email" : "Current employment"}: {status}
              </h3>
              <p className="mt-1 break-words">
                {matches
                  ? attempt?.message
                  : "No evidence bound to the current identity and email source"}
              </p>
              {result && matches && (
                <p className="mt-1 break-words">
                  {result.proof.providerId} · {result.proof.checkedAt}
                  {result.kind === "EMPLOYMENT"
                    ? ` · ${result.role} · ${result.seniority} · ${result.responsibilityScope}`
                    : ""}
                </p>
              )}
              <button
                type="button"
                className="mt-2 min-h-11 rounded-lg border border-line bg-white px-3 py-2 font-semibold disabled:opacity-50"
                disabled={busy || ["VERIFIED", "INVALID", "CATCH_ALL", "RUNNING"].includes(status)}
                onClick={() => void retry(kind)}
              >
                {kind === "EMAIL" ? "Retry email verification" : "Retry employment verification"}
              </button>
            </div>
          );
        })}
      </div>
      <p role="status" className="mt-3 break-words text-sm">
        {notice}
      </p>
    </section>
  );
}
