"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, FileText, Send, ShieldCheck, Target } from "lucide-react";

import { generateCreateOutreachAction } from "@/app/create-outreach/actions";
import { DraftRefinementPanel } from "@/features/draft-refinement/draft-refinement-panel";
import { industries, personas } from "@/features/playbook/playbook-content";
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
  "Strong fit - brand demand and paid-search owner",
  "Possible fit - validate brand demand first",
  "Not enough signal yet",
  "$20M-$50M revenue or 100-200 employees",
  "$50M+ revenue or 200+ employees",
  "$20K+ monthly branded-search spend",
  "Enterprise / multi-market account",
  "Unknown size; qualify first",
];

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

function OptionalSelect({
  name,
  label,
  options,
  required = false,
}: {
  name: string;
  label: string;
  options: string[];
  required?: boolean;
}) {
  const [value, setValue] = useState("");
  const [custom, setCustom] = useState("");
  const isCustom = value === "__custom";

  return (
    <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
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
      <input name={name} required={required} type="hidden" value={isCustom ? custom : value} />
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
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [channel, setChannel] = useState<OutreachChannel>("EMAIL");
  const [messageType, setMessageType] = useState<OutreachMessageType>("FIRST_TOUCH");
  const [tone, setTone] = useState<OutreachTone>("CONSULTATIVE");
  const [length, setLength] = useState<OutreachLength>("STANDARD");
  const [result, setResult] = useState<CreateOutreachResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function copyText(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  }

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
              Pick the account basics, generate a short first draft, then refine.
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
            <h2 className="text-lg font-semibold text-ink">Quick brief</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Company"
              name="companyName"
              onChange={(value) => {
                setCompanyName(value);
                setCompanyWebsite(inferDomain(value));
              }}
              required
              value={companyName}
            />
            <TextField label="First name (optional)" name="contactFirstName" />
            <OptionalSelect
              label="Buyer role"
              name="contactRole"
              options={personas.map((persona) => persona.name)}
              required
            />
            <OptionalSelect label="Fit / ICP" name="companyContext" options={companySizeOptions} required />
            <OptionalSelect label="Industry" name="industry" options={industries.map((industry) => industry.name)} />
            <OptionalSelect label="Reason for outreach" name="observedTrigger" options={triggerOptions} required />
            <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
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
            <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
              Email length
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

          <details className="rounded-lg border border-line bg-[#f8f5ef] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Advanced optional details
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label="Website"
                name="companyWebsite"
                onChange={setCompanyWebsite}
                value={companyWebsite}
              />
              <OptionalSelect label="Market" name="geographyOrMarkets" options={marketOptions} />
              <OptionalSelect label="Current vendor/tool" name="currentVendor" options={vendorOptions} />
              <OptionalSelect label="Paid-search context" name="paidSearchContext" options={paidSearchOptions} />
              <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
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
              <label className="min-w-0 space-y-1 text-sm font-medium text-stone-700">
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
              <label className="block space-y-1 text-sm font-medium text-stone-700 sm:col-span-2">
                Internal notes
                <textarea
                  className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm"
                  name="internalNotes"
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
            {isPending ? "Drafting..." : "Generate email"}
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
                    Based on
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.detectedSignals.slice(0, 5).map((signal) => (
                      <span
                        className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-stone-700"
                        key={`${signal.label}-${signal.detail}`}
                      >
                        {signal.label}: {signal.detail}
                      </span>
                    ))}
                    {result.recordsUsed.slice(0, 2).map((record) => (
                      <span
                        className="rounded-full border border-line bg-[#f8f5ef] px-3 py-1 text-xs font-medium text-stone-700"
                        key={record.id}
                      >
                        Knowledge: {record.title}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Recommended message
                  </p>
                  <div className="mt-2 overflow-hidden rounded-lg border border-line bg-[#f8f5ef]">
                    <div className="flex items-center justify-between border-b border-line bg-white px-3 py-2">
                      <span className="text-sm font-semibold text-ink">Full email</span>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                        onClick={() => copyText("full-email", result.recommendedMessage)}
                        type="button"
                      >
                        {copiedKey === "full-email" ? (
                          <Check aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {copiedKey === "full-email" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="divide-y divide-line">
                      {result.emailSections.map((section) => (
                        <div className="grid gap-3 p-3 sm:grid-cols-[8rem_1fr_auto]" key={section.label}>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-signal">
                            {section.label.replace("PAIN POINT", "PAIN")}
                          </p>
                          <p className="whitespace-pre-line text-sm leading-6 text-ink">
                            {section.text}
                          </p>
                          <button
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-line bg-white px-2 text-xs font-semibold text-stone-700 transition hover:bg-[#f8f5ef]"
                            onClick={() => copyText(section.label, section.text)}
                            type="button"
                          >
                            {copiedKey === section.label ? (
                              <Check aria-hidden="true" className="h-3.5 w-3.5" />
                            ) : (
                              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                            )}
                            {copiedKey === section.label ? "Copied" : "Copy"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
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
                Your draft will appear here.
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
