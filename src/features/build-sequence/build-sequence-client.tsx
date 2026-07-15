"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Copy,
  FileText,
  Layers3,
  Send,
  ShieldCheck,
} from "lucide-react";

import {
  generateBuildSequenceAction,
  pushSequenceToHubSpotAction,
} from "@/app/build-sequence/actions";
import { useOutputLanguage } from "@/components/language-selector";
import { purposeLabels } from "@/features/build-sequence/sequence-policy";
import { DraftRefinementPanel } from "@/features/draft-refinement/draft-refinement-panel";
import { industries, personas } from "@/features/playbook/playbook-content";
import { translateUi, type UiTextKey } from "@/lib/ui-translations";
import type {
  BuildSequenceResult,
  SequenceChannel,
  SequenceLength,
  SequenceStep,
  SequenceTone,
} from "@/features/build-sequence/types";

const tones: { label: string; value: SequenceTone }[] = [
  { label: "Direct", value: "DIRECT" },
  { label: "Consultative", value: "CONSULTATIVE" },
  { label: "Warm", value: "WARM" },
  { label: "Executive", value: "EXECUTIVE" },
];

const lengths: { label: string; value: SequenceLength }[] = [
  { label: "3 steps", value: 3 },
  { label: "4 steps", value: 4 },
  { label: "5 steps", value: 5 },
  { label: "6 steps", value: 6 },
];

const companySizeOptions = [
  "Strong fit - brand demand and paid-search owner",
  "Possible fit - validate brand demand first",
  "Not enough signal yet",
  "$20M-$50M revenue or 100-200 employees",
  "$50M+ revenue or 200+ employees",
  "$20K+ monthly branded-search spend",
  "Enterprise / multi-market account",
  "Unknown size; qualify first",
];

const marketOptions = [
  "United States",
  "US and Europe",
  "Multi-country",
  "Regional market",
  "Global brand",
];

const paidSearchOptions = [
  "Runs branded-search ads",
  "Strong organic brand visibility",
  "Competitors appear on brand terms",
  "Agency manages paid search",
  "Unknown; ask discovery question",
];

const vendorOptions = [
  "Adthena",
  "Revvim",
  "Auction Insights",
  "Google Ads only",
  "Agency-managed setup",
  "Unknown",
];

const triggerOptions = [
  "Validate branded-search activity",
  "Competitors may be appearing on brand terms",
  "Potential brand-spend efficiency opportunity",
  "Multi-market control or governance question",
  "Recent growth or acquisition push",
  "Existing tool may not answer paid + organic methodology",
  "Light discovery before pitching Signal",
];

const durationOptions = [
  "8 business days",
  "10 business days",
  "12 business days",
  "15 business days",
  "3 weeks",
];

function inferDomain(company: string) {
  const cleaned = company
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\b(inc|llc|ltd|limited|group|company|co|corp|corporation)\b/g, "")
    .trim()
    .split(/\s+/)[0];

  return cleaned ? `${cleaned}.com` : "";
}

function variantIndex(current: number, length: number) {
  return (current + 1) % length;
}

function subjectVariants(step: SequenceStep, company: string) {
  const byPurpose: Record<SequenceStep["purpose"], string[]> = {
    FIRST_TOUCH_RELEVANCE: [
      step.subjectLine ?? "",
      `${company} paid brand question`,
      `Quick thought on ${company} brand search`,
    ],
    PROBLEM_FRAMING: [
      step.subjectLine ?? "",
      "When paid brand looks too good",
      `Paid brand waste at ${company}?`,
    ],
    METHODOLOGY_DIFFERENTIATION: [
      step.subjectLine ?? "",
      "A cleaner brand-search test",
      `How to check paid brand at ${company}`,
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      step.subjectLine ?? "",
      `${company}: one brand-search check`,
      `A narrow question for ${company}`,
    ],
    SOCIAL_PROOF: [
      step.subjectLine ?? "",
      "A practical paid-brand example",
      `Relevant paid-brand example`,
    ],
    TECHNICAL_CLARIFICATION: [
      step.subjectLine ?? "",
      "Paid brand methodology",
      `One way to test brand search`,
    ],
    LOW_PRESSURE_FOLLOW_UP: [
      step.subjectLine ?? "",
      `Quick follow-up on ${company}`,
      "Worth revisiting later?",
    ],
    BREAKUP_CLOSE_LOOP: [step.subjectLine ?? "", "Closing the loop", "Last note on paid brand"],
  };
  return byPurpose[step.purpose].filter(Boolean);
}

function bodyVariants(step: SequenceStep, company: string) {
  const firstLine = step.messageBody.split("\n").find(Boolean) ?? "Hi there,";

  if (step.purpose === "FIRST_TOUCH_RELEVANCE") {
    return [
      step.messageBody,
      `${firstLine}\n\nI had ${company} on my list for one narrow reason: branded search can look healthy in reports even when some paid clicks are not changing the outcome.\n\nWorth checking where paid coverage is still useful and where organic already does enough.`,
      `${firstLine}\n\nQuick thought on ${company}: brand search is usually not a yes/no channel. The useful question is which coverage protects demand and which spend is no longer doing much work.`,
    ];
  }

  if (step.purpose === "PROBLEM_FRAMING") {
    return [
      step.messageBody,
      `${firstLine}\n\nThe awkward part is that branded campaigns often look efficient because the person already wanted the brand.\n\nThat makes it hard to know what paid search protected, and what organic would have captured anyway.`,
      `${firstLine}\n\nThe risk is not running paid brand. The risk is treating every brand click as equally valuable, even when organic results may already be carrying part of the demand.`,
    ];
  }

  if (step.purpose === "METHODOLOGY_DIFFERENTIATION") {
    return [
      step.messageBody,
      `${firstLine}\n\nThe method I would test is simple: look at paid coverage, organic visibility, and competitor presence together before changing bids.\n\nThen the decision becomes practical: keep coverage, reduce waste, or protect the position.`,
      `${firstLine}\n\nInstead of another dashboard, the useful output is a decision: where paid brand still protects revenue, and where it can be reduced without losing the outcome.`,
    ];
  }

  if (step.purpose === "ACCOUNT_SPECIFIC_OBSERVATION") {
    return [
      step.messageBody,
      `${firstLine}\n\nI would keep the ${company} angle light: not a claim, just a reason to check whether paid brand is still doing work organic cannot do.\n\nThat makes the conversation safer and more useful than assuming there is waste.`,
      `${firstLine}\n\nFor ${company}, I would frame this as a quick validation rather than a pitch: is paid coverage needed everywhere, or only when organic and competitor conditions make it useful?`,
    ];
  }

  if (step.purpose === "SOCIAL_PROOF") {
    return [
      step.messageBody,
      `${firstLine}\n\nThere are customer examples behind this, but I would use them carefully.\n\nThe useful takeaway is not the logo. It is the decision pattern: separate useful paid coverage from spend that is not changing the result.`,
      `${firstLine}\n\nI can share a short example if useful, but the main point is practical: this is about deciding where brand spend still earns its place.`,
    ];
  }

  if (step.purpose === "TECHNICAL_CLARIFICATION") {
    return [
      step.messageBody,
      `${firstLine}\n\nThe check does not need to be complicated: compare paid brand ads, organic results, and search-page conditions before changing coverage.\n\nThat keeps the discussion away from generic cost-cutting and focused on evidence.`,
      `${firstLine}\n\nThe clean version is: do not pause blindly, and do not keep coverage blindly. Test where paid brand changes the outcome.`,
    ];
  }

  if (step.purpose === "BREAKUP_CLOSE_LOOP") {
    return [
      step.messageBody,
      `${firstLine}\n\nI will close the loop after this note.\n\nIf paid-brand efficiency becomes a priority later, the useful starting point is simple: where is paid coverage protecting demand, and where is it just adding cost?`,
      `${firstLine}\n\nLast note from me. If this is not relevant now, no problem at all. I only reached out because this is often hard to see from standard brand-search reporting.`,
    ];
  }

  return [
    step.messageBody,
    `${firstLine}\n\nI wanted to keep this narrow: is paid brand coverage still creating value, or is some of that demand already covered organically?`,
    `${firstLine}\n\nThis may be worth a quick check before making any larger change to brand-search spend.`,
  ];
}

function ctaVariants(step: SequenceStep) {
  const byPurpose: Record<SequenceStep["purpose"], string[]> = {
    FIRST_TOUCH_RELEVANCE: [
      step.cta,
      "Worth comparing how you decide this today?",
      "Open to a quick check?",
    ],
    PROBLEM_FRAMING: [
      step.cta,
      "Is this something your team is already trying to separate?",
      "Worth seeing if this is relevant?",
    ],
    METHODOLOGY_DIFFERENTIATION: [
      step.cta,
      "Worth pressure-testing your current method against this?",
      "Would a two-point methodology view help?",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      step.cta,
      "Would it be useful to check whether this applies at your scale?",
      "Worth a quick sanity check?",
    ],
    SOCIAL_PROOF: [
      step.cta,
      "Want the short version of the example?",
      "Should I send the relevant example?",
    ],
    TECHNICAL_CLARIFICATION: [
      step.cta,
      "Would a simple method breakdown help?",
      "Worth comparing how you test this today?",
    ],
    LOW_PRESSURE_FOLLOW_UP: [
      step.cta,
      "Worth revisiting later if this becomes a priority?",
      "Should I leave this for now?",
    ],
    BREAKUP_CLOSE_LOOP: [
      step.cta,
      "If this is not relevant, I can close the loop here.",
      "No worries if this is not a priority.",
    ],
  };
  return byPurpose[step.purpose].filter(Boolean);
}

type SmartFieldProps = {
  name: string;
  label: string;
  options: string[];
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
  defaultValue?: string;
};

function SmartField({
  name,
  label,
  options,
  placeholder = "Enter manually",
  required = false,
  textarea = false,
  defaultValue = "",
}: SmartFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const [customValue, setCustomValue] = useState("");
  const outputLanguage = useOutputLanguage();
  const isCustom = value === "__custom";
  const finalValue = isCustom ? customValue : value;
  const Input = textarea ? "textarea" : "input";
  const t = (key: UiTextKey) => translateUi(key, outputLanguage);

  return (
    <label className="space-y-1 text-sm font-medium text-stone-700">
      {label}
      <select
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
        onChange={(event) => setValue(event.target.value)}
        value={value}
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
        <Input
          className="mt-2 min-h-10 w-full rounded-md border border-line px-3 py-2 text-sm leading-6"
          onChange={(event) => setCustomValue(event.target.value)}
          placeholder={placeholder === "Enter manually" ? t("workflow.enterManually") : placeholder}
          value={customValue}
        />
      ) : null}
      <input name={name} required={required} type="hidden" value={finalValue} />
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
    <label className="space-y-1 text-sm font-medium text-stone-700">
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

export function BuildSequenceClient() {
  const outputLanguage = useOutputLanguage();
  const t = (key: UiTextKey) => translateUi(key, outputLanguage);
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [primaryChannel, setPrimaryChannel] = useState<SequenceChannel>("EMAIL");
  const [sequenceLength, setSequenceLength] = useState<SequenceLength>(4);
  const [tone, setTone] = useState<SequenceTone>("CONSULTATIVE");
  const [result, setResult] = useState<BuildSequenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [stepBodyDrafts, setStepBodyDrafts] = useState<Record<number, string>>({});
  const [stepSubjectDrafts, setStepSubjectDrafts] = useState<Record<number, string>>({});
  const [stepCtaDrafts, setStepCtaDrafts] = useState<Record<number, string>>({});
  const [stepBodyVariantIndexes, setStepBodyVariantIndexes] = useState<Record<number, number>>({});
  const [stepSubjectVariantIndexes, setStepSubjectVariantIndexes] = useState<Record<number, number>>(
    {},
  );
  const [stepCtaVariantIndexes, setStepCtaVariantIndexes] = useState<Record<number, number>>({});
  const [hubSpotStatus, setHubSpotStatus] = useState<{
    state: "idle" | "sending" | "success" | "error";
    message?: string;
  }>({ state: "idle" });
  const [isPending, startTransition] = useTransition();

  const displayedSteps =
    result?.steps.map((step) => ({
      ...step,
      subjectLine: stepSubjectDrafts[step.stepNumber] ?? step.subjectLine,
      messageBody: stepBodyDrafts[step.stepNumber] ?? step.messageBody,
      cta: stepCtaDrafts[step.stepNumber] ?? step.cta,
    })) ?? [];

  async function copyText(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  }

  function fullStepText(step: SequenceStep) {
    return [step.subjectLine, step.connectionRequest, step.messageBody, step.cta]
      .filter(Boolean)
      .join("\n\n");
  }

  function fullSequenceText() {
    return displayedSteps
      .map((step) => `Step ${step.stepNumber} - ${step.delay}\n${fullStepText(step)}`)
      .join("\n\n---\n\n");
  }

  function regenerateSubject(step: SequenceStep) {
    const variants = subjectVariants(step, companyName || "this account");
    const nextIndex = variantIndex(stepSubjectVariantIndexes[step.stepNumber] ?? 0, variants.length);
    setStepSubjectVariantIndexes((current) => ({ ...current, [step.stepNumber]: nextIndex }));
    setStepSubjectDrafts((current) => ({ ...current, [step.stepNumber]: variants[nextIndex] }));
  }

  function regenerateBody(step: SequenceStep) {
    const variants = bodyVariants(step, companyName || "this account");
    const nextIndex = variantIndex(stepBodyVariantIndexes[step.stepNumber] ?? 0, variants.length);
    setStepBodyVariantIndexes((current) => ({ ...current, [step.stepNumber]: nextIndex }));
    setStepBodyDrafts((current) => ({ ...current, [step.stepNumber]: variants[nextIndex] }));
  }

  function regenerateCta(step: SequenceStep) {
    const variants = ctaVariants(step);
    const nextIndex = variantIndex(stepCtaVariantIndexes[step.stepNumber] ?? 0, variants.length);
    setStepCtaVariantIndexes((current) => ({ ...current, [step.stepNumber]: nextIndex }));
    setStepCtaDrafts((current) => ({ ...current, [step.stepNumber]: variants[nextIndex] }));
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await generateBuildSequenceAction({
        companyName: formData.get("companyName"),
        companyWebsite: formData.get("companyWebsite") || undefined,
        contactFirstName: formData.get("contactFirstName") || undefined,
        contactRole: formData.get("contactRole"),
        industry: formData.get("industry") || undefined,
        companyContext: formData.get("companyContext") || undefined,
        geographyOrMarkets: formData.get("geographyOrMarkets") || undefined,
        paidSearchContext: formData.get("paidSearchContext") || undefined,
        currentVendor: formData.get("currentVendor") || undefined,
        observedTrigger: formData.get("observedTrigger"),
        primaryChannel,
        sequenceLength,
        desiredTone: tone,
        desiredOverallDuration: formData.get("desiredOverallDuration"),
        outputLanguage,
        internalNotes: formData.get("internalNotes") || undefined,
      });

      if (!response.ok) {
        setResult(null);
        setError(response.message);
        return;
      }

      setResult(response.data);
      setStepBodyDrafts({});
      setStepSubjectDrafts({});
      setStepCtaDrafts({});
      setStepBodyVariantIndexes({});
      setStepSubjectVariantIndexes({});
      setStepCtaVariantIndexes({});
    });
  }

  function pushToHubSpot() {
    if (!result) return;
    setHubSpotStatus({ state: "sending", message: "Sending to HubSpot..." });
    startTransition(async () => {
      const response = await pushSequenceToHubSpotAction({
        companyName,
        companyWebsite,
        overallStrategy: result.overallStrategy,
        selectedAngle: result.selectedAngle,
        persona: result.personaEmphasis.persona,
        steps: displayedSteps,
        safetyNotes: result.safetyNotes,
        sourceTitles: result.sourceReferences.map((source) => source.title),
      });

      if (!response.ok) {
        setHubSpotStatus({ state: "error", message: response.message });
        return;
      }

      setHubSpotStatus({
        state: "success",
        message: "Sent to HubSpot as a company note and review task.",
      });
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          {t("workflow.eyebrow")}
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-ink">{t("workflow.sequence.title")}</h1>
            <p className="max-w-3xl text-sm leading-6 text-stone-600">
              {t("workflow.sequence.description")}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-stone-600">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#32795d]" />
            {t("workflow.draftOnly")}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <form
          action={onSubmit}
          className="space-y-4 rounded-lg border border-line bg-white p-4 shadow-sm"
        >
          <input name="outputLanguage" type="hidden" value={outputLanguage} />
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <Layers3 aria-hidden="true" className="h-5 w-5 text-signal" />
            <h2 className="text-lg font-semibold text-ink">{t("workflow.quickBrief")}</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={t("workflow.company")}
              name="companyName"
              onChange={(value) => {
                setCompanyName(value);
                setCompanyWebsite(inferDomain(value));
              }}
              required
              value={companyName}
            />
            <SmartField
              label={t("workflow.buyerRole")}
              name="contactRole"
              options={personas.map((persona) => persona.name)}
              required
            />
            <SmartField
              label={t("workflow.fitIcp")}
              name="companyContext"
              options={companySizeOptions}
              required
            />
            <SmartField
              label={t("workflow.industry")}
              name="industry"
              options={industries.map((industry) => industry.name)}
            />
            <SmartField
              label={t("workflow.reasonForOutreach")}
              name="observedTrigger"
              options={triggerOptions}
              required
            />
            <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
              {t("workflow.steps")}
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                onChange={(event) =>
                  setSequenceLength(Number(event.target.value) as SequenceLength)
                }
                value={sequenceLength}
              >
                {lengths.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
              {t("workflow.tone")}
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                onChange={(event) => setTone(event.target.value as SequenceTone)}
                value={tone}
              >
                {tones.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <SmartField
              defaultValue="12 business days"
              label={t("workflow.duration")}
              name="desiredOverallDuration"
              options={durationOptions}
              required
            />
          </div>

          <details className="rounded-lg border border-line bg-[#f8f5ef] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {t("workflow.advancedOptionalDetails")}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label={t("workflow.website")}
                name="companyWebsite"
                onChange={setCompanyWebsite}
                value={companyWebsite}
              />
              <SmartField label={t("workflow.firstName")} name="contactFirstName" options={[]} />
              <SmartField
                label={t("workflow.market")}
                name="geographyOrMarkets"
                options={marketOptions}
              />
              <SmartField label={t("workflow.currentVendor")} name="currentVendor" options={vendorOptions} />
              <SmartField
                label={t("workflow.paidSearchContext")}
                name="paidSearchContext"
                options={paidSearchOptions}
              />
              <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
                {t("workflow.channel")}
                <select
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                  onChange={(event) => setPrimaryChannel(event.target.value as SequenceChannel)}
                  value={primaryChannel}
                >
                  <option value="EMAIL">Email</option>
                  <option value="LINKEDIN">LinkedIn</option>
                  <option value="MIXED">Mixed</option>
                </select>
              </label>
              <div className="sm:col-span-2">
                <SmartField label={t("workflow.internalNotes")} name="internalNotes" options={[]} textarea />
              </div>
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
            {isPending ? t("workflow.building") : t("workflow.buildSequence")}
          </button>
        </form>

        <section className="space-y-4">
          <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <FileText aria-hidden="true" className="h-5 w-5 text-signal" />
              <h2 className="text-lg font-semibold text-ink">{t("workflow.strategy")}</h2>
            </div>
            {result ? (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-stone-700">{result.overallStrategy}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-[#f8f5ef] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Angle
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {result.selectedAngle.replaceAll("_", " ").toLowerCase()}
                    </p>
                  </div>
                  <div className="rounded-md bg-[#f8f5ef] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Persona
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {result.personaEmphasis.persona}
                    </p>
                  </div>
                </div>
                <p className="text-sm leading-6 text-stone-700">{result.angleRationale}</p>
              </div>
            ) : (
              <p className="text-sm leading-6 text-stone-600">
                {t("workflow.sequence.empty")}
              </p>
            )}
            <div className="mt-4 rounded-md border border-line bg-[#f8f5ef] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">HubSpot export</p>
                  <p className="mt-1 text-sm leading-5 text-stone-600">
                    {result
                      ? "Send this sequence to HubSpot as a company note and review task."
                      : "Build a sequence first, then send it to HubSpot from here."}
                  </p>
                </div>
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-signal px-3 text-sm font-semibold text-white transition hover:bg-[#1d4e5f] disabled:cursor-not-allowed disabled:bg-stone-300"
                  disabled={!result || hubSpotStatus.state === "sending"}
                  onClick={pushToHubSpot}
                  type="button"
                >
                  <Send aria-hidden="true" className="h-4 w-4" />
                  {hubSpotStatus.state === "sending" ? "Sending..." : "Send to HubSpot"}
                </button>
              </div>
              {hubSpotStatus.state !== "idle" ? (
                <p
                  className={`mt-3 rounded-md px-3 py-2 text-sm ${
                    hubSpotStatus.state === "success"
                      ? "bg-[#eef8ed] text-[#2f6f3a]"
                      : hubSpotStatus.state === "error"
                        ? "bg-[#fff4ef] text-[#9a3f24]"
                        : "bg-white text-stone-700"
                  }`}
                >
                  {hubSpotStatus.message}
                </p>
              ) : null}
            </div>
          </article>

          {result ? (
            <>
              <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CalendarDays aria-hidden="true" className="h-5 w-5 text-signal" />
                      <h2 className="text-lg font-semibold text-ink">Timeline</h2>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      This run stays editable below. Regenerate one subject, body, or CTA without
                      rebuilding the whole sequence.
                    </p>
                  </div>
                  <button
                    className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-line bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                    onClick={() => copyText("sequence-all", fullSequenceText())}
                    type="button"
                  >
                    {copiedKey === "sequence-all" ? (
                      <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    ) : (
                      <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                    {copiedKey === "sequence-all" ? "Copied" : "Copy all"}
                  </button>
                </div>
                <div className="space-y-3">
                  {displayedSteps.map((step) => (
                    <section className="rounded-md border border-line p-3" key={step.stepNumber}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                          <span>Step {step.stepNumber}</span>
                          <span>{step.channel}</span>
                          <span>{step.delay}</span>
                        </div>
                        <button
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-line bg-white px-2 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                          onClick={() => copyText(`step-${step.stepNumber}`, fullStepText(step))}
                          type="button"
                        >
                          {copiedKey === `step-${step.stepNumber}` ? (
                            <Check aria-hidden="true" className="h-3.5 w-3.5" />
                          ) : (
                            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                          )}
                          {copiedKey === `step-${step.stepNumber}` ? "Copied" : "Copy step"}
                        </button>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ink">
                        {purposeLabels[step.purpose]}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">{step.channelRationale}</p>
                      {step.subjectLine ? (
                        <div className="mt-3 rounded-md bg-[#f8f5ef] p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                              Subject
                            </p>
                            <button
                              className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                              onClick={() => regenerateSubject(step)}
                              type="button"
                            >
                              Generate
                            </button>
                          </div>
                          <input
                            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
                            onChange={(event) =>
                              setStepSubjectDrafts((current) => ({
                                ...current,
                                [step.stepNumber]: event.target.value,
                              }))
                            }
                            value={step.subjectLine}
                          />
                        </div>
                      ) : null}
                      {step.connectionRequest ? (
                        <p className="mt-3 rounded-md bg-[#f8f5ef] px-3 py-2 text-sm text-ink">
                          {step.connectionRequest}
                        </p>
                      ) : null}
                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                            Body
                          </p>
                          <button
                            className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                            onClick={() => regenerateBody(step)}
                            type="button"
                          >
                            Generate
                          </button>
                        </div>
                        <textarea
                          className="min-h-40 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-stone-700"
                          onChange={(event) =>
                            setStepBodyDrafts((current) => ({
                              ...current,
                              [step.stepNumber]: event.target.value,
                            }))
                          }
                          value={step.messageBody}
                        />
                      </div>
                      {step.cta ? (
                        <div className="mt-3 rounded-md bg-[#f8f5ef] p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                              CTA
                            </p>
                            <button
                              className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                              onClick={() => regenerateCta(step)}
                              type="button"
                            >
                              Generate
                            </button>
                          </div>
                          <textarea
                            className="min-h-20 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm font-medium leading-6 text-signal"
                            onChange={(event) =>
                              setStepCtaDrafts((current) => ({
                                ...current,
                                [step.stepNumber]: event.target.value,
                              }))
                            }
                            value={step.cta}
                          />
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              </article>

              <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle aria-hidden="true" className="h-5 w-5 text-[#9a6a20]" />
                  <h2 className="text-lg font-semibold text-ink">Sources and safety</h2>
                </div>
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
                        {source.sourceDate ? ` - ${source.sourceDate.slice(0, 10)}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              </article>

              <DraftRefinementPanel draftId={result.draftId} workflow="BUILD_SEQUENCE" />
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
