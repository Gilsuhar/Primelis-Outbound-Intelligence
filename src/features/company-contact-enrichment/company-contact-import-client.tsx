"use client";

import { useState, useTransition } from "react";
import { FileUp, ShieldAlert } from "lucide-react";

import {
  confirmCompanyContactImportAction,
  previewCompanyContactImportAction,
} from "@/app/account-research/import/actions";
import type {
  CompanyContactCsvType,
  CompanyContactImportMode,
  CompanyContactImportPreview,
} from "@/features/company-contact-enrichment/types";
import type { UserRole } from "@/features/knowledge/types";

export function CompanyContactImportClient({ role }: { role: UserRole }) {
  const [importType, setImportType] = useState<CompanyContactCsvType>("COMPANY");
  const [mode, setMode] = useState<CompanyContactImportMode>("ADD_NEW_ONLY");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("company-contact-import.csv");
  const [preview, setPreview] = useState<CompanyContactImportPreview | null>(null);
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
          Only Knowledge Admin users can preview or confirm company and contact imports.
        </p>
      </section>
    );
  }

  function previewImport() {
    setMessage(null);
    startTransition(async () => {
      const response = await previewCompanyContactImportAction({
        csvText,
        filename,
        importType,
        mode,
      });
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
      const response = await confirmCompanyContactImportAction({
        csvText,
        filename,
        importType,
        mode,
      });
      setMessage(
        response.ok
          ? `Import complete: ${response.data.imported} imported, ${response.data.updated} updated, ${response.data.skipped} skipped.`
          : response.message,
      );
    });
  }

  const placeholder =
    importType === "COMPANY"
      ? "company_name,domain,industry,employee_range,revenue_range,headquarters_country,company_type,source\nNike,nike.com,,10000+,$50M+,United States,B2C,target list"
      : "full_name,title,company_name,domain,country,department,seniority,professional_profile_url,business_email,business_email_status,source";

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-olive">
          Knowledge Admin
        </p>
        <h1 className="font-display text-4xl font-semibold text-ink">
          Import Company and Contact CSV
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6f6d5f]">
          Paste a company or contact list, preview the automatic Signal classification, then confirm
          only when the rows look right.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <FileUp aria-hidden="true" className="h-5 w-5 text-olive" />
          <h2 className="text-lg font-semibold text-ink">CSV import</h2>
        </div>
        <div className="mt-4 rounded-lg border border-line bg-cream px-3 py-2 text-sm leading-6 text-[#34352e]">
          Minimum company columns: <span className="font-semibold">company_name, domain</span>.
          If industry, size, or revenue are missing, Signal will infer a suggested industry, ICP fit,
          persona, and outreach angle for review.
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1 text-sm font-medium text-[#34352e]">
            Filename
            <input
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              onChange={(event) => setFilename(event.target.value)}
              value={filename}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium text-[#34352e]">
            CSV type
            <select
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              onChange={(event) => setImportType(event.target.value as CompanyContactCsvType)}
              value={importType}
            >
              <option value="COMPANY">Company CSV</option>
              <option value="CONTACT">Contact CSV</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium text-[#34352e]">
            Import mode
            <select
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              onChange={(event) => setMode(event.target.value as CompanyContactImportMode)}
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
          placeholder={placeholder}
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
          {importType === "COMPANY" && preview.validRows.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-3 bg-cream px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f6d5f]">
                <span>Company</span>
                <span>Industry</span>
                <span>ICP fit</span>
                <span>Angle</span>
              </div>
              <div className="divide-y divide-line bg-white">
                {preview.validRows.slice(0, 8).map((row, index) => (
                  <div
                    className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-3 px-3 py-3 text-sm"
                    key={`${row.domain}-${index}`}
                  >
                    <div>
                      <p className="font-semibold text-ink">{row.company_name}</p>
                      <p className="text-xs text-[#6f6d5f]">{row.domain}</p>
                    </div>
                    <p className="text-[#34352e]">{row.signal_industry || row.industry}</p>
                    <p className="text-[#34352e]">{row.signal_icp_fit}</p>
                    <p className="text-[#34352e]">{row.recommended_outreach_angle}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
