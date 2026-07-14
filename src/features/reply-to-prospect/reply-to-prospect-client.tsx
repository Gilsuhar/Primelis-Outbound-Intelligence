"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  MessageSquareReply,
  ShieldCheck,
} from "lucide-react";

import { generateReplyToProspectAction } from "@/app/reply-to-prospect/actions";
import { DraftRefinementPanel } from "@/features/draft-refinement/draft-refinement-panel";
import { personas } from "@/features/playbook/playbook-content";
import type {
  ReplyChannel,
  ReplyLength,
  ReplyToProspectResult,
  ReplyTone,
} from "@/features/reply-to-prospect/types";

const toneOptions: { label: string; value: ReplyTone }[] = [
  { label: "Direct", value: "DIRECT" },
  { label: "Consultative", value: "CONSULTATIVE" },
  { label: "Warm", value: "WARM" },
  { label: "Executive", value: "EXECUTIVE" },
];

const lengthOptions: { label: string; value: ReplyLength }[] = [
  { label: "Short", value: "SHORT" },
  { label: "Standard", value: "STANDARD" },
  { label: "Detailed", value: "DETAILED" },
];

function OptionalSelect({
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
    <label className="block min-w-0 space-y-1 text-sm font-medium text-stone-700">
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
    </label>
  );
}

export function ReplyToProspectClient() {
  const [result, setResult] = useState<ReplyToProspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [channel, setChannel] = useState<ReplyChannel>("EMAIL");
  const [tone, setTone] = useState<ReplyTone>("CONSULTATIVE");
  const [length, setLength] = useState<ReplyLength>("STANDARD");

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await generateReplyToProspectAction({
        prospectMessage: formData.get("prospectMessage"),
        companyName: formData.get("companyName") || undefined,
        contactRole: formData.get("contactRole") || undefined,
        channel,
        desiredTone: tone,
        desiredLength: length,
        contextNotes: formData.get("contextNotes") || undefined,
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
            <h1 className="text-3xl font-semibold text-ink">Reply to Prospect</h1>
            <p className="max-w-3xl text-sm leading-6 text-stone-600">
              Paste the reply, choose the buyer role and tone, then generate a careful response.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-stone-600">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#32795d]" />
            Approved knowledge only
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <form
          action={onSubmit}
          className="space-y-4 rounded-lg border border-line bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <MessageSquareReply aria-hidden="true" className="h-5 w-5 text-signal" />
            <h2 className="text-lg font-semibold text-ink">Quick reply brief</h2>
          </div>

          <label className="block space-y-1 text-sm font-medium text-stone-700">
            Prospect message
            <textarea
              className="min-h-40 w-full rounded-md border border-line px-3 py-2 text-sm leading-6"
              name="prospectMessage"
              placeholder="Paste the prospect's message here."
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0 space-y-1 text-sm font-medium text-stone-700">
              Company
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="companyName"
              />
            </label>
            <OptionalSelect
              label="Buyer role"
              name="contactRole"
              options={personas.map((persona) => persona.name)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block min-w-0 space-y-1 text-sm font-medium text-stone-700">
              Channel
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                onChange={(event) => setChannel(event.target.value as ReplyChannel)}
                value={channel}
              >
                <option value="EMAIL">Email</option>
                <option value="LINKEDIN">LinkedIn</option>
              </select>
            </label>
            <label className="block min-w-0 space-y-1 text-sm font-medium text-stone-700">
              Tone
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                onChange={(event) => setTone(event.target.value as ReplyTone)}
                value={tone}
              >
                {toneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 space-y-1 text-sm font-medium text-stone-700">
              Length
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                onChange={(event) => setLength(event.target.value as ReplyLength)}
                value={length}
              >
                {lengthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <details className="rounded-lg border border-line bg-[#f8f5ef] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Advanced optional context
            </summary>
            <label className="mt-3 block space-y-1 text-sm font-medium text-stone-700">
              Context notes
              <textarea
                className="min-h-24 w-full rounded-md border border-line px-3 py-2 text-sm leading-6"
                name="contextNotes"
              />
            </label>
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
            <MessageSquareReply aria-hidden="true" className="h-4 w-4" />
            {isPending ? "Drafting..." : "Generate reply"}
          </button>
        </form>

        <section className="space-y-4">
          <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <FileText aria-hidden="true" className="h-5 w-5 text-signal" />
              <h2 className="text-lg font-semibold text-ink">Generated response</h2>
            </div>
            {result ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Recommended reply
                  </p>
                  <p className="mt-2 whitespace-pre-line rounded-md bg-[#f8f5ef] p-3 text-sm leading-6 text-ink">
                    {result.recommendedReply}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Shorter alternative
                  </p>
                  <p className="mt-2 whitespace-pre-line rounded-md bg-white p-3 text-sm leading-6 text-stone-700 ring-1 ring-line">
                    {result.shorterAlternative}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Detected intent
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.detectedIntent.map((intent) => (
                        <span
                          className="rounded-md bg-[#e7f0ed] px-2 py-1 text-xs font-medium text-signal"
                          key={intent}
                        >
                          {intent.replaceAll("_", " ").toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Provider
                    </p>
                    <p className="mt-2 text-sm text-stone-700">
                      {result.provider.providerName} · {result.provider.modelName}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 text-stone-600">
                Generated replies will appear here with the records and source references used.
              </p>
            )}
          </article>

          {result ? (
            <>
              <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-[#32795d]" />
                  <h2 className="text-lg font-semibold text-ink">Strategy and evidence</h2>
                </div>
                <p className="text-sm leading-6 text-stone-700">{result.responseStrategy}</p>
                <div className="mt-4 space-y-3">
                  {result.recordsUsed.map((record) => (
                    <div className="rounded-md border border-line p-3" key={record.id}>
                      <p className="text-sm font-semibold text-ink">{record.title}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {record.type.replaceAll("_", " ")}
                      </p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle aria-hidden="true" className="h-5 w-5 text-[#9a6a20]" />
                  <h2 className="text-lg font-semibold text-ink">Safety and sources</h2>
                </div>
                <div className="space-y-3">
                  {result.safetyWarnings.length > 0 ? (
                    result.safetyWarnings.map((warning) => (
                      <p
                        className="rounded-md bg-[#fff7e8] px-3 py-2 text-sm text-[#8a5a2b]"
                        key={warning}
                      >
                        {warning}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-stone-600">No safety warnings for this draft.</p>
                  )}
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

              <DraftRefinementPanel draftId={result.draftId} workflow="REPLY_TO_PROSPECT" />
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
