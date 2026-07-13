"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, FileText, Send, ShieldCheck, Target } from "lucide-react";

import { generateCreateOutreachAction } from "@/app/create-outreach/actions";
import { DraftRefinementPanel } from "@/features/draft-refinement/draft-refinement-panel";
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

export function CreateOutreachClient() {
  const [channel, setChannel] = useState<OutreachChannel>("EMAIL");
  const [messageType, setMessageType] = useState<OutreachMessageType>("FIRST_TOUCH");
  const [tone, setTone] = useState<OutreachTone>("CONSULTATIVE");
  const [length, setLength] = useState<OutreachLength>("STANDARD");
  const [result, setResult] = useState<CreateOutreachResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await generateCreateOutreachAction({
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
        channel,
        messageType,
        desiredTone: tone,
        desiredLength: length,
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
            <h1 className="text-3xl font-semibold text-ink">Create Outreach</h1>
            <p className="max-w-3xl text-sm leading-6 text-stone-600">
              Generate concise cold outreach using approved, source-backed Signal knowledge.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-stone-600">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#32795d]" />
            Source-backed only
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <form
          action={onSubmit}
          className="space-y-4 rounded-lg border border-line bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <Target aria-hidden="true" className="h-5 w-5 text-signal" />
            <h2 className="text-lg font-semibold text-ink">Account and contact</h2>
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
            Observed trigger
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
                onChange={(event) => setChannel(event.target.value as OutreachChannel)}
                value={channel}
              >
                <option value="EMAIL">Email</option>
                <option value="LINKEDIN">LinkedIn</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Type
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
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Tone
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
            <label className="space-y-1 text-sm font-medium text-stone-700">
              Length
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
            {isPending ? "Drafting..." : "Generate outreach"}
          </button>
        </form>

        <section className="space-y-4">
          <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <FileText aria-hidden="true" className="h-5 w-5 text-signal" />
              <h2 className="text-lg font-semibold text-ink">Generated message</h2>
            </div>
            {result ? (
              <div className="space-y-4">
                {result.subjectLines.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Subject lines
                    </p>
                    <div className="mt-2 space-y-2">
                      {result.subjectLines.map((subject) => (
                        <p
                          className="rounded-md bg-[#f8f5ef] px-3 py-2 text-sm text-ink"
                          key={subject}
                        >
                          {subject}
                        </p>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Recommended message
                  </p>
                  <p className="mt-2 whitespace-pre-line rounded-md bg-[#f8f5ef] p-3 text-sm leading-6 text-ink">
                    {result.recommendedMessage}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Shorter version
                  </p>
                  <p className="mt-2 whitespace-pre-line rounded-md bg-white p-3 text-sm leading-6 text-stone-700 ring-1 ring-line">
                    {result.shorterVersion}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    CTA
                  </p>
                  <p className="mt-2 text-sm text-stone-700">{result.cta}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 text-stone-600">
                Generated outreach will appear here with sources and safety evidence.
              </p>
            )}
          </article>

          {result ? (
            <>
              <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Target aria-hidden="true" className="h-5 w-5 text-signal" />
                  <h2 className="text-lg font-semibold text-ink">Angle and signals</h2>
                </div>
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
                        {source.sourceDate ? ` · ${source.sourceDate.slice(0, 10)}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              </article>

              <DraftRefinementPanel draftId={result.draftId} workflow="CREATE_OUTREACH" />
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
