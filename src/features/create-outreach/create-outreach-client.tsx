"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, FileText, Send, ShieldCheck, Target } from "lucide-react";

import { generateCreateOutreachAction } from "@/app/create-outreach/actions";
import { useOutputLanguage } from "@/components/language-selector";
import { AccountStatusPanel } from "@/features/account-status/account-status-panel";
import { DraftRefinementPanel } from "@/features/draft-refinement/draft-refinement-panel";
import { industries, personas } from "@/features/playbook/playbook-content";
import { WorkflowBadge, WorkflowPage, WorkflowSectionTitle } from "@/features/workflow/workflow-layout";
import { translateUi, type UiTextKey } from "@/lib/ui-translations";
import type {
  CreateOutreachResult,
  OutreachChannel,
  OutreachLength,
  OutreachMessageType,
  OutreachTone,
} from "@/features/create-outreach/types";

const tones: { label: string; value: OutreachTone }[] = [
  { label: "Direct", value: "DIRECT" },
  { label: "Consultative", value: "CONSULTATIVE" },
  { label: "Warm", value: "WARM" },
  { label: "Executive", value: "EXECUTIVE" },
];

const lengths: { label: string; value: OutreachLength }[] = [
  { label: "Short", value: "SHORT" },
  { label: "Standard", value: "STANDARD" },
  { label: "Detailed", value: "DETAILED" },
];

const companySizeOptions = [
  "Strong fit - confirmed",
  "Potential fit - validate spend/demand",
  "Enterprise - qualify",
  "Insufficient data",
  "Not a fit",
];

const buyerRoleOptions = personas
  .map((persona) => persona.name)
  .filter((name) => name !== "Brand Marketing or Brand Leadership");

const marketOptions = ["United States", "US and Europe", "Multi-country", "Regional market", "Global brand"];

const paidSearchOptions = [
  "Runs branded-search ads",
  "Strong organic brand visibility",
  "Competitors appear on brand terms",
  "Agency manages paid search",
  "Unknown; ask discovery question",
];

const vendorOptions = ["Adthena", "Revvim", "Auction Insights", "Google Ads only", "Agency-managed setup", "Unknown"];

const triggerOptions = [
  "Validate branded-search activity",
  "Competitors may be appearing on brand terms",
  "Potential brand-spend efficiency opportunity",
  "Multi-market control or governance question",
  "Recent growth or acquisition push",
  "Light discovery before pitching Signal",
];

function inferDomain(company: string) {
  const raw = company
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/i.test(raw)) {
    return raw.replace(/\/$/, "");
  }

  const cleaned = raw
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\b(inc|llc|ltd|limited|group|company|co|corp|corporation)\b/g, "")
    .trim()
    .split(/\s+/)[0];

  return cleaned ? `${cleaned}.com` : "";
}

function variantIndex(current: number, length: number) {
  return (current + 1) % length;
}

function formString(value: FormDataEntryValue | null, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function subjectLineVariants(result: CreateOutreachResult, company: string) {
  const angle = result.selectedAngle.replaceAll("_", " ").toLowerCase();
  return [
    result.subjectLines,
    [
      `${company} paid + organic question`,
      `Brand search at ${company}`,
      `${company}: where paid brand is incremental`,
    ],
    [
      `Quick Signal fit check for ${company}`,
      `${company} brand coverage`,
      `${company} and ${angle}`,
    ],
  ].filter((group) => group.length > 0);
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function usedDeterministicFallback(notes: string[]) {
  return notes.some((note) => /fallback was used|provider failed|not configured|authentication failed|rate limit|model was not found/i.test(note));
}

function fallbackReason(notes: string[]) {
  return notes.find((note) => /fallback was used|provider failed|not configured|authentication failed|rate limit|model was not found|OpenAI rejected|OpenAI request failed|could not parse/i.test(note));
}

function providerLabel(result: CreateOutreachResult) {
  if (usedDeterministicFallback(result.safetyNotes)) {
    const reason = fallbackReason(result.safetyNotes);
    return reason
      ? `Fallback draft - OpenAI did not write this. Reason: ${reason}`
      : "Fallback draft - OpenAI did not write this";
  }
  if (result.provider.providerName === "openai") {
    return `OpenAI draft - ${result.provider.modelName}`;
  }
  return "Local draft";
}

function draftQuality(fullEmail: string, cta: string, safetyNotes: string[] = []) {
  const text = `${fullEmail}\n${cta}`.toLowerCase();
  const issues: string[] = [];
  const wins: string[] = [];

  if (usedDeterministicFallback(safetyNotes)) {
    issues.push("OpenAI did not write this draft. The deterministic fallback was used.");
  }

  if (countMatches(text, /\bcompare|comparing\b/g) > 1) {
    issues.push("Uses compare too often. Vary the CTA before sending.");
  } else {
    wins.push("CTA language is not repetitive.");
  }

  if (countMatches(text, /\bpaid coverage\b/g) > 2 || countMatches(text, /\bcoverage\b/g) > 5) {
    issues.push("Mentions coverage too often. Swap one line for organic demand or wasted spend.");
  } else {
    wins.push("No obvious keyword repetition.");
  }

  if (!/(organic|unnecessary spend|wasted spend|not changing the outcome|incremental|lower bids|pause)/i.test(text)) {
    issues.push("Needs a clearer buyer pain: organic capture, wasted spend, or bid control.");
  } else {
    wins.push("Has a clear buyer pain.");
  }

  if (/\b(worth a quick compare|open to a quick compare)\b/i.test(cta)) {
    issues.push("CTA is too generic. Use a concrete question instead.");
  }

  return {
    status: issues.length === 0 ? "Ready to send" : "Needs one quick edit",
    issues,
    wins: wins.slice(0, 3),
  };
}

function OptionalSelect({
  name,
  label,
  options,
  required = false,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: string[];
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [internalValue, setInternalValue] = useState("");
  const [custom, setCustom] = useState("");
  const outputLanguage = useOutputLanguage();
  const selectedValue = value ?? internalValue;
  const setSelectedValue = onChange ?? setInternalValue;
  const isCustom = selectedValue === "__custom";
  const t = (key: UiTextKey) => translateUi(key, outputLanguage);

  return (
    <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
      {label}
      <select
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
        onChange={(event) => setSelectedValue(event.target.value)}
        value={selectedValue}
      >
        <option value="">{t("workflow.choose")}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="__custom">{t("workflow.otherManual")}</option>
      </select>
      {isCustom ? (
        <input
          className="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm"
          onChange={(event) => setCustom(event.target.value)}
          placeholder={t("workflow.enterManually")}
          value={custom}
        />
      ) : null}
      <input name={name} required={required} type="hidden" value={isCustom ? custom : selectedValue} />
    </label>
  );
}

function TextField({
  name,
  label,
  required = false,
  value,
  onChange,
}: {
  name: string;
  label: string;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
      {label}
      <input
        className="w-full rounded-md border border-line px-3 py-2 text-sm"
        name={name}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        required={required}
        value={value}
      />
    </label>
  );
}

export function CreateOutreachClient() {
  const outputLanguage = useOutputLanguage();
  const t = (key: UiTextKey) => translateUi(key, outputLanguage);
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [companyContext, setCompanyContext] = useState("");
  const [industry, setIndustry] = useState("");
  const [observedTrigger, setObservedTrigger] = useState("");
  const [geographyOrMarkets, setGeographyOrMarkets] = useState("");
  const [currentVendor, setCurrentVendor] = useState("");
  const [paidSearchContext, setPaidSearchContext] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [useCaseStudy, setUseCaseStudy] = useState(false);
  const [accountStatusOverride, setAccountStatusOverride] = useState(false);
  const accountStatusOverrideRef = useRef(false);
  const [channel, setChannel] = useState<OutreachChannel>("EMAIL");
  const [messageType, setMessageType] = useState<OutreachMessageType>("FIRST_TOUCH");
  const [tone, setTone] = useState<OutreachTone>("CONSULTATIVE");
  const [length, setLength] = useState<OutreachLength>("STANDARD");
  const [result, setResult] = useState<CreateOutreachResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [fullDraft, setFullDraft] = useState<string | null>(null);
  const [subjectDrafts, setSubjectDrafts] = useState<string[] | null>(null);
  const [subjectVariantIndex, setSubjectVariantIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  const displayedSubjectLines = subjectDrafts ?? result?.subjectLines ?? [];
  const displayedFullEmail =
    fullDraft ??
    result?.recommendedMessage ??
    result?.emailSections.map((section) => section.text).join("\n\n") ??
    "";
  const quality = result ? draftQuality(displayedFullEmail, result.cta, result.safetyNotes) : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const company = params.get("company");
    const domain = params.get("domain");
    if (company) setCompanyName(company);
    if (domain) setCompanyWebsite(domain);
  }, []);

  async function copyText(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const fallbackRole = "Head of Performance Marketing";
      const fallbackFit = "Potential fit - validate spend/demand";
      const fallbackTrigger = "Light discovery before pitching Signal";
      const response = await generateCreateOutreachAction({
        companyName: formString(formData.get("companyName")),
        companyWebsite: formString(formData.get("companyWebsite")) || undefined,
        contactFirstName: formString(formData.get("contactFirstName")) || undefined,
        contactRole: formString(formData.get("contactRole"), fallbackRole),
        industry: formString(formData.get("industry")) || undefined,
        companyContext: formString(formData.get("companyContext"), fallbackFit),
        geographyOrMarkets: formString(formData.get("geographyOrMarkets")) || undefined,
        paidSearchContext: formString(formData.get("paidSearchContext")) || undefined,
        currentVendor: formString(formData.get("currentVendor")) || undefined,
        observedTrigger: formString(formData.get("observedTrigger"), fallbackTrigger),
        channel,
        messageType,
        desiredTone: tone,
        desiredLength: length,
        outputLanguage,
        useCaseStudy: formData.get("useCaseStudy") === "on",
        accountStatusOverride: accountStatusOverride || accountStatusOverrideRef.current,
        internalNotes: formData.get("internalNotes") || undefined,
      });

      if (!response.ok) {
        setResult(null);
        setError(
          response.code === "ACCOUNT_STATUS_OVERRIDE_REQUIRED"
            ? `${response.message} Click "Continue with override" above, then generate again.`
            : response.code === "VALIDATION_ERROR"
              ? "Add a company name, then generate again. The other fields can be filled automatically."
              : response.message,
        );
        return;
      }

      setResult(response.data);
      setFullDraft(null);
      setSubjectDrafts(null);
      setSubjectVariantIndex(0);
    });
  }

  function regenerateSubjects() {
    if (!result) {
      return;
    }
    const variants = subjectLineVariants(result, companyName || "this account");
    const nextIndex = variantIndex(subjectVariantIndex, variants.length);
    setSubjectVariantIndex(nextIndex);
    setSubjectDrafts(variants[nextIndex]);
  }

  return (
    <WorkflowPage
      badge={
        <WorkflowBadge>
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#32795d]" />
          {t("workflow.sourceBacked")}
        </WorkflowBadge>
      }
      description={t("workflow.create.description")}
      eyebrow={t("workflow.eyebrow")}
      title={t("workflow.create.title")}
    >

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <form
          action={onSubmit}
          className="space-y-4 rounded-2xl border border-line bg-white/95 p-5 shadow-[0_16px_45px_rgba(20,20,20,0.07)]"
        >
          <input name="outputLanguage" type="hidden" value={outputLanguage} />
          <WorkflowSectionTitle
            icon={<Target aria-hidden="true" className="h-5 w-5" />}
            title={t("workflow.quickBrief")}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={t("workflow.company")}
              name="companyName"
              onChange={(value) => {
                setCompanyName(value);
                setCompanyWebsite(inferDomain(value));
                accountStatusOverrideRef.current = false;
                setAccountStatusOverride(false);
              }}
              required
              value={companyName}
            />
            <TextField
              label={t("workflow.website")}
              name="companyWebsite"
              onChange={(value) => {
                setCompanyWebsite(value);
                accountStatusOverrideRef.current = false;
                setAccountStatusOverride(false);
              }}
              value={companyWebsite}
            />
            <TextField
              label={t("workflow.firstNameOptional")}
              name="contactFirstName"
              onChange={setContactFirstName}
              value={contactFirstName}
            />
            <OptionalSelect
              label={t("workflow.buyerRole")}
              name="contactRole"
              onChange={setContactRole}
              options={buyerRoleOptions}
              required
              value={contactRole}
            />
            <OptionalSelect
              label={t("workflow.fitIcp")}
              name="companyContext"
              onChange={setCompanyContext}
              options={companySizeOptions}
              required
              value={companyContext}
            />
            <OptionalSelect
              label={t("workflow.industry")}
              name="industry"
              onChange={setIndustry}
              options={industries.map((industry) => industry.name)}
              value={industry}
            />
            <OptionalSelect
              label={t("workflow.reasonForOutreach")}
              name="observedTrigger"
              onChange={setObservedTrigger}
              options={triggerOptions}
              required
              value={observedTrigger}
            />
            <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
              {t("workflow.tone")}
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                onChange={(event) => setTone(event.target.value as OutreachTone)}
                value={tone}
              >
                {tones.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
              {t("workflow.emailLength")}
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                onChange={(event) => setLength(event.target.value as OutreachLength)}
                value={length}
              >
                {lengths.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-line bg-[#f8f5ef] px-3 py-2 text-sm font-medium text-stone-700 sm:col-span-2">
              <input
                className="h-4 w-4 rounded border-line text-signal"
                checked={useCaseStudy}
                name="useCaseStudy"
                onChange={(event) => setUseCaseStudy(event.target.checked)}
                type="checkbox"
              />
              {t("workflow.useCaseStudy")}
            </label>
          </div>

          <AccountStatusPanel
            companyDomain={companyWebsite}
            companyName={companyName}
            onOverrideChange={(value) => {
              accountStatusOverrideRef.current = value;
              setAccountStatusOverride(value);
              if (value) setError(null);
            }}
            overrideActive={accountStatusOverride}
            submitOnOverride
          />

          <details className="rounded-lg border border-line bg-[#f8f5ef] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {t("workflow.advancedOptionalDetails")}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <OptionalSelect
                label={t("workflow.market")}
                name="geographyOrMarkets"
                onChange={setGeographyOrMarkets}
                options={marketOptions}
                value={geographyOrMarkets}
              />
              <OptionalSelect
                label={t("workflow.currentVendor")}
                name="currentVendor"
                onChange={setCurrentVendor}
                options={vendorOptions}
                value={currentVendor}
              />
              <OptionalSelect
                label={t("workflow.paidSearchContext")}
                name="paidSearchContext"
                onChange={setPaidSearchContext}
                options={paidSearchOptions}
                value={paidSearchContext}
              />
              <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
                {t("workflow.channel")}
                <select
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                  onChange={(event) => setChannel(event.target.value as OutreachChannel)}
                  value={channel}
                >
                  <option value="EMAIL">Email</option>
                  <option value="LINKEDIN">LinkedIn</option>
                </select>
              </label>
              <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
                {t("workflow.type")}
                <select
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                  onChange={(event) => setMessageType(event.target.value as OutreachMessageType)}
                  value={messageType}
                >
                  <option value="FIRST_TOUCH">First touch</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="RE_ENGAGEMENT">Re-engagement</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium text-stone-700 sm:col-span-2">
                {t("workflow.internalNotes")}
                <textarea
                  className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm"
                  name="internalNotes"
                  onChange={(event) => setInternalNotes(event.target.value)}
                  value={internalNotes}
                />
              </label>
            </div>
          </details>

          {error ? (
            <p className="rounded-md border border-[#f1c6b7] bg-[#fff4ef] px-3 py-2 text-sm text-[#9a3f24]">
              {error}
            </p>
          ) : null}

          <button
            className="inline-flex items-center justify-center gap-2 rounded-md bg-signal px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4e5f] disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={isPending}
            type="submit"
          >
            <Send aria-hidden="true" className="h-4 w-4" />
            {isPending ? t("workflow.drafting") : t("workflow.generateEmail")}
          </button>
        </form>

        <section className="space-y-4">
          <article className="rounded-2xl border border-line bg-white/95 p-5 shadow-[0_16px_45px_rgba(20,20,20,0.07)]">
            <div className="mb-3">
              <WorkflowSectionTitle
                icon={<FileText aria-hidden="true" className="h-5 w-5" />}
                title={t("workflow.generatedMessage")}
              />
            </div>
            {result ? (
              <div className="space-y-4">
                <p
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${
                    usedDeterministicFallback(result.safetyNotes)
                      ? "bg-[#fff7e8] text-[#8a5a2b]"
                      : "bg-[#eef8ed] text-[#2f6f3a]"
                  }`}
                >
                  {providerLabel(result)}
                </p>
                {result.subjectLines.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {t("workflow.subjectLines")}
                      </p>
                      <button
                        className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                        onClick={regenerateSubjects}
                        type="button"
                      >
                        {t("workflow.generate")}
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {displayedSubjectLines.map((subject, index) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-md bg-[#f8f5ef] px-3 py-2 text-sm text-ink"
                          key={`${subject}-${index}`}
                        >
                          <input
                            aria-label={`Subject line ${index + 1}`}
                            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink outline-none transition focus:border-line focus:bg-white"
                            onChange={(event) => {
                              const nextSubjects = [...displayedSubjectLines];
                              nextSubjects[index] = event.target.value;
                              setSubjectDrafts(nextSubjects);
                            }}
                            value={subject}
                          />
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                            onClick={() => copyText(subject, subject)}
                            type="button"
                          >
                            {copiedKey === subject ? (
                              <Check aria-hidden="true" className="h-3.5 w-3.5" />
                            ) : (
                              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                            )}
                            {copiedKey === subject ? t("workflow.copied") : t("workflow.copy")}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {result.connectionRequest ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Connection request
                    </p>
                    <p className="mt-2 rounded-md bg-[#f8f5ef] p-3 text-sm leading-6 text-ink">
                      {result.connectionRequest}
                    </p>
                  </div>
                ) : null}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      {t("workflow.recommendedMessage")}
                    </p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                        onClick={() => copyText("full-email", displayedFullEmail)}
                        type="button"
                      >
                        {copiedKey === "full-email" ? (
                          <Check aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {copiedKey === "full-email" ? t("workflow.copied") : t("workflow.copy")}
                      </button>
                    </div>
                  </div>
                  <textarea
                    aria-label={t("workflow.recommendedMessage")}
                    className="mt-2 min-h-72 w-full resize-y rounded-lg border border-line bg-white px-4 py-3 text-base leading-7 text-ink shadow-inner outline-none transition focus:border-signal focus:ring-2 focus:ring-[#dce86d]/60"
                    onChange={(event) => setFullDraft(event.target.value)}
                    value={displayedFullEmail}
                  />
                </div>
                <div className="rounded-lg border border-line bg-[#fbfaf7] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    {t("workflow.shorterVersion")}
                  </p>
                  <p className="mt-2 whitespace-pre-line rounded-md bg-white p-3 text-sm leading-6 text-stone-700 ring-1 ring-line">
                    {result.shorterVersion}
                  </p>
                </div>
                {quality ? (
                  <details className="rounded-lg border border-line bg-white p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">Draft quality</p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          quality.issues.length === 0
                            ? "bg-[#eef8ed] text-[#2f6f3a]"
                            : "bg-[#fff7e8] text-[#8a5a2b]"
                        }`}
                      >
                        {quality.status}
                      </span>
                      </div>
                    </summary>
                    <div className="mt-3 grid gap-2">
                      {quality.issues.length > 0
                        ? quality.issues.map((issue) => (
                            <p className="rounded-md bg-[#fff7e8] px-3 py-2 text-sm text-[#8a5a2b]" key={issue}>
                              {issue}
                            </p>
                          ))
                        : quality.wins.map((win) => (
                            <p className="rounded-md bg-[#eef8ed] px-3 py-2 text-sm text-[#2f6f3a]" key={win}>
                              {win}
                            </p>
                          ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : (
              <p className="text-sm leading-6 text-stone-600">
                {t("workflow.create.empty")}
              </p>
            )}
          </article>

          {result ? (
            <>
              <details className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-ink">
                  <Target aria-hidden="true" className="h-5 w-5 text-signal" />
                  {t("workflow.angleAndSignals")}
                </summary>
                <p className="text-sm font-semibold text-ink">
                  {result.selectedAngle.replaceAll("_", " ").toLowerCase()}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{result.angleRationale}</p>
                <p className="mt-3 text-sm text-stone-700">
                  Persona: {result.personaGuidance.persona} · {result.personaGuidance.emphasis}
                </p>
                <div className="mt-4 space-y-2">
                  {result.detectedSignals.map((signal) => (
                    <div
                      className="rounded-md border border-line p-3"
                      key={`${signal.label}-${signal.detail}`}
                    >
                      <p className="text-sm font-semibold text-ink">{signal.label}</p>
                      <p className="mt-1 text-sm text-stone-700">{signal.detail}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {signal.confidence.replaceAll("_", " ").toLowerCase()}
                      </p>
                    </div>
                  ))}
                </div>
              </details>

              <details className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-ink">
                  <AlertTriangle aria-hidden="true" className="h-5 w-5 text-[#9a6a20]" />
                  {t("workflow.sourcesAndSafety")}
                </summary>
                <div className="space-y-3">
                  {result.safetyNotes.map((note) => (
                    <p
                      className="rounded-md bg-[#fff7e8] px-3 py-2 text-sm text-[#8a5a2b]"
                      key={note}
                    >
                      {note}
                    </p>
                  ))}
                  {result.knowledgeLimitations.map((limitation) => (
                    <p
                      className="rounded-md bg-[#f8f5ef] px-3 py-2 text-sm text-stone-700"
                      key={limitation}
                    >
                      {limitation}
                    </p>
                  ))}
                  <div className="space-y-2">
                    {result.sourceReferences.map((source) => (
                      <p className="text-sm text-stone-700" key={source.id}>
                        <span className="font-semibold">{source.title}</span>
                        {source.sourceDate ? ` · ${source.sourceDate.slice(0, 10)}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              </details>

              <details className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <summary className="cursor-pointer list-none text-base font-semibold text-ink">
                  Improve draft
                </summary>
                <div className="mt-4">
                  <DraftRefinementPanel draftId={result.draftId} workflow="CREATE_OUTREACH" />
                </div>
              </details>
            </>
          ) : null}
        </section>
      </div>
    </WorkflowPage>
  );
}
