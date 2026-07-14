"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CalendarDays, FileText, Layers3, Send, ShieldCheck } from "lucide-react";

import { generateBuildSequenceAction } from "@/app/build-sequence/actions";
import { purposeLabels } from "@/features/build-sequence/sequence-policy";
import { DraftRefinementPanel } from "@/features/draft-refinement/draft-refinement-panel";
import { industries, personas } from "@/features/playbook/playbook-content";
import type {
  BuildSequenceResult,
  SequenceChannel,
  SequenceLength,
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
  const isCustom = value === "__custom";
  const finalValue = isCustom ? customValue : value;
  const Input = textarea ? "textarea" : "input";

  return (
    <label className="space-y-1 text-sm font-medium text-stone-700">
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
        <Input
          className="mt-2 min-h-10 w-full rounded-md border border-line px-3 py-2 text-sm leading-6"
          onChange={(event) => setCustomValue(event.target.value)}
          placeholder={placeholder}
          value={customValue}
        />
      ) : null}
      <input name={name} required={required} type="hidden" value={finalValue} />
    </label>
  );
}

export function BuildSequenceClient() {
  const [primaryChannel, setPrimaryChannel] = useState<SequenceChannel>("EMAIL");
  const [sequenceLength, setSequenceLength] = useState<SequenceLength>(4);
  const [tone, setTone] = useState<SequenceTone>("CONSULTATIVE");
  const [result, setResult] = useState<BuildSequenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
        internalNotes: formData.get("internalNotes") || undefined,
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
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          Sales workflow
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-ink">Build Sequence</h1>
            <p className="max-w-3xl text-sm leading-6 text-stone-600">
              Build a short sequence from the same quick brief, without starting from a blank page.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-stone-600">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#32795d]" />
            Draft only
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <form
          action={onSubmit}
          className="space-y-4 rounded-lg border border-line bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <Layers3 aria-hidden="true" className="h-5 w-5 text-signal" />
            <h2 className="text-lg font-semibold text-ink">Quick brief</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SmartField label="Company" name="companyName" options={[]} required />
            <SmartField
              label="Buyer role"
              name="contactRole"
              options={personas.map((persona) => persona.name)}
              required
            />
            <SmartField
              label="Fit / ICP"
              name="companyContext"
              options={companySizeOptions}
              required
            />
            <SmartField
              label="Industry"
              name="industry"
              options={industries.map((industry) => industry.name)}
            />
            <SmartField
              label="Reason for outreach"
              name="observedTrigger"
              options={triggerOptions}
              required
            />
            <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
              Steps
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
              Tone
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
              label="Duration"
              name="desiredOverallDuration"
              options={durationOptions}
              required
            />
          </div>

          <details className="rounded-lg border border-line bg-[#f8f5ef] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Advanced optional details
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SmartField label="Website" name="companyWebsite" options={[]} />
              <SmartField label="First name" name="contactFirstName" options={[]} />
              <SmartField
                label="Market"
                name="geographyOrMarkets"
                options={marketOptions}
              />
              <SmartField label="Current vendor/tool" name="currentVendor" options={vendorOptions} />
              <SmartField
                label="Paid-search context"
                name="paidSearchContext"
                options={paidSearchOptions}
              />
              <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
                Channel
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
                <SmartField label="Internal notes" name="internalNotes" options={[]} textarea />
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
            {isPending ? "Building..." : "Build sequence"}
          </button>
        </form>

        <section className="space-y-4">
          <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <FileText aria-hidden="true" className="h-5 w-5 text-signal" />
              <h2 className="text-lg font-semibold text-ink">Strategy</h2>
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
                The generated sequence strategy and evidence will appear here.
              </p>
            )}
          </article>

          {result ? (
            <>
              <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarDays aria-hidden="true" className="h-5 w-5 text-signal" />
                  <h2 className="text-lg font-semibold text-ink">Timeline</h2>
                </div>
                <div className="space-y-3">
                  {result.steps.map((step) => (
                    <section className="rounded-md border border-line p-3" key={step.stepNumber}>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                        <span>Step {step.stepNumber}</span>
                        <span>{step.channel}</span>
                        <span>{step.delay}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ink">
                        {purposeLabels[step.purpose]}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">{step.channelRationale}</p>
                      {step.subjectLine ? (
                        <p className="mt-3 rounded-md bg-[#f8f5ef] px-3 py-2 text-sm text-ink">
                          {step.subjectLine}
                        </p>
                      ) : null}
                      {step.connectionRequest ? (
                        <p className="mt-3 rounded-md bg-[#f8f5ef] px-3 py-2 text-sm text-ink">
                          {step.connectionRequest}
                        </p>
                      ) : null}
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-700">
                        {step.messageBody}
                      </p>
                      {step.cta ? (
                        <p className="mt-3 text-sm font-medium text-signal">{step.cta}</p>
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
