"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CalendarDays, FileText, Layers3, Send, ShieldCheck } from "lucide-react";

import { generateBuildSequenceAction } from "@/app/build-sequence/actions";
import { purposeLabels } from "@/features/build-sequence/sequence-policy";
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
              Create a concise multi-step sequence using approved, source-backed Signal knowledge.
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
            <h2 className="text-lg font-semibold text-ink">Account and sequence</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Company
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="companyName"
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Website
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="companyWebsite"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-stone-700">
              First name
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="contactFirstName"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Contact role
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="contactRole"
                required
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Industry
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="industry"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Size or revenue context
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="companyContext"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Geography or markets
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="geographyOrMarkets"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Current vendor/tool
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="currentVendor"
              />
            </label>
          </div>

          <label className="block space-y-1 text-sm font-medium text-stone-700">
            Known paid-search context
            <textarea
              className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm"
              name="paidSearchContext"
            />
          </label>
          <label className="block space-y-1 text-sm font-medium text-stone-700">
            Observed trigger or reason for outreach
            <textarea
              className="min-h-24 w-full rounded-md border border-line px-3 py-2 text-sm"
              name="observedTrigger"
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="space-y-1 text-sm font-medium text-stone-700">
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
            <label className="space-y-1 text-sm font-medium text-stone-700">
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
            <label className="space-y-1 text-sm font-medium text-stone-700">
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
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Duration
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                defaultValue="12 business days"
                name="desiredOverallDuration"
                required
              />
            </label>
          </div>

          <label className="block space-y-1 text-sm font-medium text-stone-700">
            Internal notes
            <textarea
              className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm"
              name="internalNotes"
            />
          </label>

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
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
