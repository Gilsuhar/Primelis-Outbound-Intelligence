"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Building2, CheckCircle2, ClipboardCheck, SearchCheck } from "lucide-react";

import { assessAccountResearchAction } from "@/app/account-research/actions";
import type {
  AccountAssessmentResult,
  CompanyType,
  FactStatus,
  YesNoUnknown,
} from "@/features/account-research/types";

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
                ["industry", "Industry"],
                ["headquartersOrMainMarket", "Headquarters or main market"],
                ["marketsOrCountries", "Markets or countries"],
                ["revenueContext", "Revenue context"],
                ["employeeContext", "Employee context"],
              ].map(([name, label]) => (
                <label className="block space-y-1 text-sm font-medium text-[#34352e]" key={name}>
                  {label}
                  <input
                    className="w-full rounded-md border border-line px-3 py-2 text-sm"
                    name={name}
                    required={name === "companyName"}
                  />
                  {name !== "companyName" && name !== "companyDomain" ? (
                    <StatusSelect name={name} />
                  ) : null}
                </label>
              ))}
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

          <details className="rounded-xl border border-line bg-cream p-3" open>
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

          <details className="rounded-xl border border-line bg-cream p-3" open>
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

          <button className="signal-button-primary" disabled={isPending} type="submit">
            <SearchCheck aria-hidden="true" className="h-4 w-4" />
            {isPending ? "Assessing..." : "Assess account"}
          </button>
        </form>

        <section className="space-y-4">
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
