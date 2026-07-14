"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Building2, CheckCircle2, ClipboardCheck, SearchCheck } from "lucide-react";

import {
  assessAccountResearchAction,
  enrichCompanyAndContactsAction,
  researchCompanyWebsiteAction,
} from "@/app/account-research/actions";
import type { CompanyContactEnrichmentResult } from "@/features/company-contact-enrichment/types";
import type { WebsiteFinding, WebsiteResearchResult } from "@/features/connected-research/types";
import type {
  AccountAssessmentResult,
  CompanyType,
  FactStatus,
  YesNoUnknown,
} from "@/features/account-research/types";
import { industries } from "@/features/playbook/playbook-content";

const yesNoUnknown: Array<{ label: string; value: YesNoUnknown }> = [
  { label: "Unknown", value: "UNKNOWN" },
  { label: "Yes", value: "YES" },
  { label: "No", value: "NO" },
];

const companyTypes: Array<{ label: string; value: CompanyType }> = [
  { label: "B2B", value: "B2B" },
  { label: "B2C", value: "B2C" },
  { label: "E-commerce", value: "E_COMMERCE" },
  { label: "Marketplace", value: "MARKETPLACE" },
  { label: "Subscription", value: "SUBSCRIPTION" },
  { label: "Multi-brand", value: "MULTI_BRAND" },
  { label: "Other", value: "OTHER" },
];

const factStatusOptions: Array<{ label: string; value: FactStatus }> = [
  { label: "User provided", value: "USER_PROVIDED" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Assumption", value: "ASSUMPTION" },
  { label: "Unknown", value: "UNKNOWN" },
];

const marketOptions = [
  "United States",
  "US and Europe",
  "Multi-country",
  "Regional market",
  "Global brand",
];
const revenueOptions = [
  "Core ICP: brand demand + paid-search ownership",
  "Possible ICP: validate brand demand first",
  "Do not target yet: missing paid-search signal",
  "$20M-$50M revenue",
  "$50M+ revenue",
  "$20K+ monthly branded-search spend",
  "Unknown",
];
const employeeOptions = ["100-200 employees", "200+ employees", "Enterprise team", "Unknown"];

const statusFields = [
  "industry",
  "marketsOrCountries",
  "revenueContext",
  "employeeContext",
  "brandedSearchAdsActive",
  "strongOrganicBrandVisibility",
  "meaningfulBrandedSearchDemand",
  "multiMarketOrBrandComplexity",
  "dedicatedPaidSearchOrPerformanceTeam",
  "knownPaidSearchOwner",
  "knownCurrentToolOrVendor",
  "meaningfulPaidSearchInvestment",
  "observedTrigger",
  "knownPain",
  "existingCustomer",
  "activeOpportunity",
  "ownedByAnotherRep",
  "doNotContactStatus",
] as const;

function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function ynu(formData: FormData, key: string): YesNoUnknown {
  const value = formData.get(key);
  return value === "YES" || value === "NO" || value === "UNKNOWN" ? value : "UNKNOWN";
}

function fieldStatus(formData: FormData) {
  return Object.fromEntries(
    statusFields.map((field) => {
      const value = formData.get(`${field}Status`);
      return [
        field,
        value === "VERIFIED" || value === "ASSUMPTION" || value === "UNKNOWN"
          ? value
          : "USER_PROVIDED",
      ];
    }),
  ) as Record<string, FactStatus>;
}

function SelectYesNoUnknown({ name, label }: { name: string; label: string }) {
  return (
    <label className="block space-y-1 text-sm font-medium text-[#34352e]">
      {label}
      <select
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
        name={name}
      >
        {yesNoUnknown.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusSelect({ name }: { name: string }) {
  return (
    <select
      aria-label={`${name} fact status`}
      className="w-full rounded-md border border-line bg-white px-2 py-2 text-xs"
      name={`${name}Status`}
    >
      {factStatusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SmartSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: string[];
}) {
  const [value, setValue] = useState("");
  const [custom, setCustom] = useState("");
  const isCustom = value === "__custom";

  return (
    <label className="block min-w-0 space-y-1 text-sm font-medium text-[#34352e]">
      {label}
      <select
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      >
        <option value="">Choose...</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="__custom">Other / enter manually</option>
      </select>
      {isCustom ? (
        <input
          className="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm"
          onChange={(event) => setCustom(event.target.value)}
          placeholder="Enter manually"
          value={custom}
        />
      ) : null}
      <input name={name} type="hidden" value={isCustom ? custom : value} />
      <StatusSelect name={name} />
    </label>
  );
}

function ResultBadge({ result }: { result: string }) {
  const classes =
    result === "Strong fit"
      ? "bg-lime text-ink"
      : result === "Do not target"
        ? "bg-[#fff4ef] text-[#9a3f24]"
        : "bg-cream text-ink";
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${classes}`}>{result}</span>
  );
}

export function AccountResearchClient() {
  const [result, setResult] = useState<AccountAssessmentResult | null>(null);
  const [research, setResearch] = useState<WebsiteResearchResult | null>(null);
  const [enrichment, setEnrichment] = useState<CompanyContactEnrichmentResult | null>(null);
  const [reviewedFindings, setReviewedFindings] = useState<
    Record<string, WebsiteFinding["reviewStatus"]>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await assessAccountResearchAction({
        companyName: optional(formData, "companyName"),
        companyDomain: optional(formData, "companyDomain"),
        industry: optional(formData, "industry"),
        headquartersOrMainMarket: optional(formData, "headquartersOrMainMarket"),
        marketsOrCountries: optional(formData, "marketsOrCountries"),
        revenueContext: optional(formData, "revenueContext"),
        employeeContext: optional(formData, "employeeContext"),
        companyType: formData.get("companyType") || "OTHER",
        brandedSearchAdsActive: ynu(formData, "brandedSearchAdsActive"),
        strongOrganicBrandVisibility: ynu(formData, "strongOrganicBrandVisibility"),
        meaningfulBrandedSearchDemand: ynu(formData, "meaningfulBrandedSearchDemand"),
        multiMarketOrBrandComplexity: ynu(formData, "multiMarketOrBrandComplexity"),
        dedicatedPaidSearchOrPerformanceTeam: ynu(formData, "dedicatedPaidSearchOrPerformanceTeam"),
        knownPaidSearchOwner: optional(formData, "knownPaidSearchOwner"),
        knownCurrentToolOrVendor: optional(formData, "knownCurrentToolOrVendor"),
        meaningfulPaidSearchInvestment: ynu(formData, "meaningfulPaidSearchInvestment"),
        observedTrigger: optional(formData, "observedTrigger"),
        knownPain: optional(formData, "knownPain"),
        accountOwner: optional(formData, "accountOwner"),
        lastContactDate: optional(formData, "lastContactDate"),
        existingCustomer: ynu(formData, "existingCustomer"),
        activeOpportunity: ynu(formData, "activeOpportunity"),
        ownedByAnotherRep: ynu(formData, "ownedByAnotherRep"),
        doNotContactStatus: ynu(formData, "doNotContactStatus"),
        internalNotes: optional(formData, "internalNotes"),
        factStatuses: fieldStatus(formData),
      });

      if (!response.ok) {
        setResult(null);
        setError(response.message);
        return;
      }
      setResult(response.data);
    });
  }

  function runWebsiteResearch(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await researchCompanyWebsiteAction({
        companyName: optional(formData, "companyName"),
        companyUrl: optional(formData, "companyDomain"),
      });
      if (!response.ok) {
        setResearch(null);
        setError(response.message);
        return;
      }
      setResearch(response.data);
      setReviewedFindings(
        Object.fromEntries(
          response.data.findings.map((finding, index) => [`${finding.field}-${index}`, "PENDING"]),
        ),
      );
    });
  }

  function runProviderEnrichment(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await enrichCompanyAndContactsAction({
        companyName: optional(formData, "companyName"),
        companyDomain: optional(formData, "companyDomain"),
        existingFields: {
          industry: optional(formData, "industry") ?? "",
          company_type: (formData.get("companyType") as string | null) ?? "",
          revenue_range: optional(formData, "revenueContext") ?? "",
          employee_range: optional(formData, "employeeContext") ?? "",
        },
      });
      if (!response.ok) {
        setEnrichment(null);
        setError(response.message);
        return;
      }
      setEnrichment(response.data);
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-olive">
          Sales workflow
        </p>
        <div className="space-y-2">
          <h1 className="font-display text-4xl font-semibold leading-[1.22] text-ink">
            Account Research
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-[#6f6d5f]">
            Qualify an account from manual inputs only. Separate verified facts, assumptions, and
            unknowns before choosing a persona, angle, and next action.
          </p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <form action={onSubmit} className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <Building2 aria-hidden="true" className="h-5 w-5 text-olive" />
              <h2 className="text-lg font-semibold text-ink">Step 1: Account basics</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["companyName", "Company name"],
                ["companyDomain", "Company domain"],
              ].map(([name, label]) => (
                <label className="block space-y-1 text-sm font-medium text-[#34352e]" key={name}>
                  {label}
                  <input
                    className="w-full rounded-md border border-line px-3 py-2 text-sm"
                    name={name}
                    required={name === "companyName"}
                  />
                </label>
              ))}
              <SmartSelect
                label="Industry"
                name="industry"
                options={industries.map((industry) => industry.name)}
              />
              <SmartSelect
                label="Headquarters or main market"
                name="headquartersOrMainMarket"
                options={marketOptions}
              />
              <SmartSelect
                label="Markets or countries"
                name="marketsOrCountries"
                options={marketOptions}
              />
              <SmartSelect label="ICP" name="revenueContext" options={revenueOptions} />
              <SmartSelect label="Employee context" name="employeeContext" options={employeeOptions} />
              <label className="block space-y-1 text-sm font-medium text-[#34352e]">
                Company type
                <select
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                  name="companyType"
                >
                  {companyTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <details className="rounded-xl border border-line bg-cream p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Step 2: Search and organization signals
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ["brandedSearchAdsActive", "Branded-search ads active"],
                ["strongOrganicBrandVisibility", "Strong organic brand visibility"],
                ["meaningfulBrandedSearchDemand", "Meaningful branded-search demand"],
                ["multiMarketOrBrandComplexity", "Multi-market or multi-brand complexity"],
                [
                  "dedicatedPaidSearchOrPerformanceTeam",
                  "Dedicated Paid Search or Performance team",
                ],
                ["meaningfulPaidSearchInvestment", "Meaningful Paid Search investment"],
              ].map(([name, label]) => (
                <div className="space-y-2" key={name}>
                  <SelectYesNoUnknown label={label} name={name} />
                  <StatusSelect name={name} />
                </div>
              ))}
              {[
                ["knownPaidSearchOwner", "Known Paid Search owner"],
                ["knownCurrentToolOrVendor", "Known current tool or vendor"],
                ["observedTrigger", "Observed trigger"],
                ["knownPain", "Known pain"],
              ].map(([name, label]) => (
                <label className="block space-y-1 text-sm font-medium text-[#34352e]" key={name}>
                  {label}
                  <textarea
                    className="min-h-20 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                    name={name}
                  />
                  <StatusSelect name={name} />
                </label>
              ))}
            </div>
          </details>

          <details className="rounded-xl border border-line bg-cream p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Step 3: Suppression check
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ["existingCustomer", "Existing customer"],
                ["activeOpportunity", "Active opportunity"],
                ["ownedByAnotherRep", "Owned by another rep"],
                ["doNotContactStatus", "Do Not Contact status"],
              ].map(([name, label]) => (
                <div className="space-y-2" key={name}>
                  <SelectYesNoUnknown label={label} name={name} />
                  <StatusSelect name={name} />
                </div>
              ))}
              <label className="block space-y-1 text-sm font-medium text-[#34352e]">
                Account owner
                <input
                  className="w-full rounded-md border border-line px-3 py-2 text-sm"
                  name="accountOwner"
                />
              </label>
              <label className="block space-y-1 text-sm font-medium text-[#34352e]">
                Last contact date
                <input
                  className="w-full rounded-md border border-line px-3 py-2 text-sm"
                  name="lastContactDate"
                />
              </label>
            </div>
          </details>

          <label className="block space-y-1 text-sm font-medium text-[#34352e]">
            Internal notes
            <textarea
              className="min-h-24 w-full rounded-md border border-line px-3 py-2 text-sm"
              name="internalNotes"
            />
          </label>

          {error ? (
            <p className="rounded-md border border-[#f1c6b7] bg-[#fff4ef] px-3 py-2 text-sm text-[#9a3f24]">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button className="signal-button-primary" disabled={isPending} type="submit">
              <SearchCheck aria-hidden="true" className="h-4 w-4" />
              {isPending ? "Assessing..." : "Assess account"}
            </button>
          </div>

          <details className="rounded-xl border border-line bg-cream p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Advanced tools
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="signal-button-secondary"
              disabled={isPending}
              formAction={runWebsiteResearch}
              type="submit"
            >
              Research company website
            </button>
            <button
              className="signal-button-secondary"
              disabled={isPending}
              formAction={runProviderEnrichment}
              type="submit"
            >
              Enrich company and contacts
            </button>
            </div>
          </details>
        </form>

        <section className="space-y-4">
          {enrichment ? (
            <article className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Company and contact enrichment</h2>
                  <p className="mt-1 text-sm text-[#6f6d5f]">
                    {enrichment.providerStatus.message} Run:{" "}
                    {enrichment.enrichmentRunId ?? "not persisted"}
                  </p>
                </div>
                <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-ink">
                  {enrichment.providerStatus.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </div>

              {enrichment.warnings.length > 0 ? (
                <div className="mt-3 rounded-xl border border-[#f1d8aa] bg-[#fff9eb] p-3 text-sm text-[#6f5a20]">
                  {enrichment.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}

              {enrichment.conflicts.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-semibold text-ink">Conflicts requiring review</p>
                  {enrichment.conflicts.map((conflict) => (
                    <div className="rounded-xl border border-line p-3 text-sm" key={conflict.field}>
                      <p className="font-semibold text-ink">{conflict.field}</p>
                      <p className="text-[#6f6d5f]">Existing: {conflict.existingValue}</p>
                      <p className="text-[#6f6d5f]">Incoming: {conflict.incomingValue}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-ink">Company findings</p>
                  <div className="mt-2 space-y-2">
                    {enrichment.companyFields.length > 0 ? (
                      enrichment.companyFields.map((field) => (
                        <div
                          className="rounded-xl border border-line p-3 text-sm"
                          key={field.field}
                        >
                          <p className="font-semibold text-ink">
                            {field.field}: {field.value}
                          </p>
                          <p className="text-xs text-[#6f6d5f]">
                            {field.status.toLowerCase()} · {field.providerName} ·{" "}
                            {new Date(field.retrievedAt).toLocaleString()}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button
                              className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-ink"
                              type="button"
                            >
                              Accept
                            </button>
                            <button
                              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink"
                              type="button"
                            >
                              Reject
                            </button>
                            <button
                              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink"
                              type="button"
                            >
                              Keep existing
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl border border-line p-3 text-sm text-[#6f6d5f]">
                        No company findings are available from the provider.
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Relevant professional contacts</p>
                  <div className="mt-2 space-y-2">
                    {enrichment.contacts.length > 0 ? (
                      enrichment.contacts.map((contact) => (
                        <div
                          className="rounded-xl border border-line p-3 text-sm"
                          key={`${contact.fullName}-${contact.professionalTitle}`}
                        >
                          <p className="font-semibold text-ink">{contact.fullName}</p>
                          <p className="text-[#34352e]">{contact.professionalTitle}</p>
                          <p className="text-xs text-[#6f6d5f]">
                            {contact.personaTier} · {contact.personaCategory} ·{" "}
                            {contact.titleMatchQuality} · priority {contact.targetingPriority}
                          </p>
                          <p className="mt-1 text-xs text-[#6f6d5f]">{contact.rationale}</p>
                          <div className="mt-2 flex gap-2">
                            <button
                              className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-ink"
                              type="button"
                            >
                              Accept
                            </button>
                            <button
                              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink"
                              type="button"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl border border-line p-3 text-sm text-[#6f6d5f]">
                        No relevant contacts were returned. Manual research remains available.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {enrichment.workflowLinks.map((link) =>
                  link.disabled ? (
                    <span
                      className="signal-button-secondary opacity-60"
                      key={link.href}
                      title={link.reason}
                    >
                      {link.label}
                    </span>
                  ) : (
                    <a className="signal-button-secondary" href={link.href} key={link.href}>
                      {link.label}
                    </a>
                  ),
                )}
              </div>
            </article>
          ) : null}

          {research ? (
            <article className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-lg font-semibold text-ink">Website research review</h2>
              <p className="mt-1 text-sm text-[#6f6d5f]">
                {research.status.replaceAll("_", " ").toLowerCase()} for {research.normalizedDomain}
                . Review findings before using them in qualification.
              </p>
              <div className="mt-4 space-y-3">
                {research.findings.map((finding, index) => {
                  const key = `${finding.field}-${index}`;
                  return (
                    <div className="rounded-xl border border-line p-3" key={key}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {finding.field}: {finding.value}
                          </p>
                          <p className="mt-1 text-xs text-[#6f6d5f]">
                            {finding.factStatus.toLowerCase()} · {finding.confidence} confidence ·{" "}
                            {finding.sourceTitle}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-ink"
                            onClick={() =>
                              setReviewedFindings((current) => ({ ...current, [key]: "ACCEPTED" }))
                            }
                            type="button"
                          >
                            Accept
                          </button>
                          <button
                            className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink"
                            onClick={() =>
                              setReviewedFindings((current) => ({ ...current, [key]: "REJECTED" }))
                            }
                            type="button"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#34352e]">{finding.excerpt}</p>
                      {finding.inferenceExplanation ? (
                        <p className="mt-2 text-xs text-[#6f6d5f]">
                          {finding.inferenceExplanation}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs font-semibold text-olive">
                        Review status: {(reviewedFindings[key] ?? "PENDING").toLowerCase()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </article>
          ) : null}

          <article className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardCheck aria-hidden="true" className="h-5 w-5 text-olive" />
              <h2 className="text-lg font-semibold text-ink">Step 4: Qualification result</h2>
            </div>
            {result ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ResultBadge result={result.qualificationResult} />
                  <span className="rounded-full bg-cream px-3 py-1 text-sm font-semibold text-ink">
                    Confidence: {result.confidence}
                  </span>
                  <span className="rounded-full bg-cream px-3 py-1 text-sm font-semibold text-ink">
                    Industry: {result.industryEvidence.level.replaceAll("_", " ").toLowerCase()}
                  </span>
                </div>
                <p className="text-sm leading-6 text-[#34352e]">{result.recommendedNextAction}</p>
                <p className="rounded-xl bg-cream p-3 text-sm leading-6 text-[#6f6d5f]">
                  {result.suppression.label}. {result.suppression.verificationWarning}
                </p>
              </div>
            ) : (
              <p className="text-sm leading-6 text-[#6f6d5f]">
                Submit an account assessment to see fit, confidence, suppression status, persona,
                angle, missing information, and next workflow.
              </p>
            )}
          </article>

          {result ? (
            <>
              <article className="rounded-2xl border border-line bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-olive" />
                  <h2 className="text-lg font-semibold text-ink">Signals and gaps</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">Verified and positive signals</p>
                    <ul className="mt-2 space-y-1 text-sm text-[#6f6d5f]">
                      {result.verifiedSignals.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">Missing information</p>
                    <ul className="mt-2 space-y-1 text-sm text-[#6f6d5f]">
                      {result.missingInformation.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-line bg-white p-5">
                <h2 className="text-lg font-semibold text-ink">Persona and angle</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-line p-3 text-sm leading-6">
                    <p className="font-semibold text-ink">
                      {result.personaRecommendation.primaryPersona}
                    </p>
                    <p>Secondary: {result.personaRecommendation.secondaryPersona}</p>
                    <p>{result.personaRecommendation.seniorityGuidance}</p>
                  </div>
                  <div className="rounded-xl border border-line p-3 text-sm leading-6">
                    <p className="font-semibold text-ink">
                      {result.angleRecommendation.primaryAngle}
                    </p>
                    <p>{result.angleRecommendation.whyItFits}</p>
                    <p>Do not claim: {result.angleRecommendation.mustNotClaim}</p>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-line bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle aria-hidden="true" className="h-5 w-5 text-[#9a6a20]" />
                  <h2 className="text-lg font-semibold text-ink">Checklist and workflows</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.workflowLinks.map((link) =>
                    link.disabled ? (
                      <span
                        className="signal-button-secondary opacity-60"
                        key={link.href}
                        title={link.reason}
                      >
                        {link.label}
                      </span>
                    ) : (
                      <a className="signal-button-secondary" href={link.href} key={link.href}>
                        {link.label}
                      </a>
                    ),
                  )}
                </div>
                <details className="mt-4 rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    Research checklist
                  </summary>
                  <ul className="mt-3 space-y-1 text-sm text-[#6f6d5f]">
                    {result.researchChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>
              </article>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
