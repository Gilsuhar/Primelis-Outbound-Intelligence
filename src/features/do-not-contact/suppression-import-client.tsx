"use client";

import { useState, useTransition } from "react";
import { FileUp, ShieldAlert } from "lucide-react";

import {
  confirmSuppressionImportAction,
  previewSuppressionImportAction,
} from "@/app/do-not-contact/import/actions";
import type { UserRole } from "@/features/knowledge/types";
import type { SuppressionImportMode, SuppressionImportPreview } from "./import-types";

export function SuppressionImportClient({ role }: { role: UserRole }) {
  const [mode, setMode] = useState<SuppressionImportMode>("ADD_NEW_ONLY");
  const [preview, setPreview] = useState<SuppressionImportPreview | null>(null);
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("suppression-import.csv");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (role !== "KNOWLEDGE_ADMIN") {
    return (
      <section className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center gap-2 text-[#9a3f24]">
          <ShieldAlert aria-hidden="true" className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Import access denied</h1>
        </div>
        <p className="mt-2 text-sm text-[#6f6d5f]">
          Only Knowledge Admin users can preview or confirm suppression imports.
        </p>
      </section>
    );
  }

  function previewImport() {
    setMessage(null);
    startTransition(async () => {
      const response = await previewSuppressionImportAction({ csvText, filename, mode });
      if (!response.ok) {
        setPreview(null);
        setMessage(response.message);
        return;
      }
      setPreview(response.data);
    });
  }

  function confirmImport() {
    setMessage(null);
    startTransition(async () => {
      const response = await confirmSuppressionImportAction({ csvText, filename, mode });
      setMessage(
        response.ok
          ? `Import complete: ${response.data.imported} imported, ${response.data.updated} updated.`
          : response.message,
      );
    });
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-olive">
          Knowledge Admin
        </p>
        <h1 className="font-display text-4xl font-semibold text-ink">Import Do Not Contact CSV</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6f6d5f]">
          Preview and confirm suppression records. Nothing is written until confirmation.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <FileUp aria-hidden="true" className="h-5 w-5 text-olive" />
          <h2 className="text-lg font-semibold text-ink">Step 1: Upload CSV</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm font-medium text-[#34352e]">
            Filename
            <input
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              onChange={(event) => setFilename(event.target.value)}
              value={filename}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium text-[#34352e]">
            Import mode
            <select
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              onChange={(event) => setMode(event.target.value as SuppressionImportMode)}
              value={mode}
            >
              <option value="ADD_NEW_ONLY">Add new only</option>
              <option value="ADD_NEW_AND_UPDATE">Add new and update matching records</option>
            </select>
          </label>
        </div>
        <textarea
          className="mt-3 min-h-48 w-full rounded-md border border-line px-3 py-2 text-sm"
          onChange={(event) => setCsvText(event.target.value)}
          placeholder="company_name,status,domain,account_owner,reason,source,last_contact_date,notes"
          value={csvText}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="signal-button-primary"
            disabled={isPending || !csvText.trim()}
            onClick={previewImport}
            type="button"
          >
            Preview import
          </button>
          <button
            className="signal-button-secondary"
            disabled={isPending || !preview || preview.invalidRows.length > 0}
            onClick={confirmImport}
            type="button"
          >
            Confirm import
          </button>
        </div>
        {message ? (
          <p className="mt-3 rounded-md bg-cream px-3 py-2 text-sm text-ink">{message}</p>
        ) : null}
      </section>

      {preview ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold text-ink">Preview</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            {Object.entries(preview.summary).map(([key, value]) => (
              <div className="rounded-xl border border-line p-3" key={key}>
                <p className="text-xs uppercase text-[#6f6d5f]">{key}</p>
                <p className="text-xl font-semibold text-ink">{value}</p>
              </div>
            ))}
          </div>
          <details className="mt-4 rounded-xl border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Invalid, duplicate, and conflict details
            </summary>
            <pre className="mt-3 overflow-auto text-xs text-[#34352e]">
              {JSON.stringify(
                {
                  invalidRows: preview.invalidRows,
                  duplicates: preview.duplicates,
                  conflicts: preview.conflicts,
                  skippedRows: preview.skippedRows,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}
