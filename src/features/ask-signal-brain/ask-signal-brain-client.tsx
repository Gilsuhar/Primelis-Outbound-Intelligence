"use client";

import { useState, useTransition } from "react";
import {
  Brain,
  ExternalLink,
  FileText,
  Lightbulb,
  ShieldCheck,
} from "lucide-react";

import { askSignalBrainAction } from "@/app/ask-signal-brain/actions";
import { DraftRefinementPanel } from "@/features/draft-refinement/draft-refinement-panel";
import { industries, personas } from "@/features/playbook/playbook-content";
import type { SignalBrainMode, SignalBrainResult } from "@/features/ask-signal-brain/types";

const modeOptions: { label: string; value: SignalBrainMode }[] = [
  { label: "Quick answer", value: "QUICK_ANSWER" },
  { label: "Detailed guidance", value: "DETAILED_GUIDANCE" },
  { label: "Account qualification", value: "ACCOUNT_QUALIFICATION" },
  { label: "Persona recommendation", value: "PERSONA_RECOMMENDATION" },
  { label: "Objection guidance", value: "OBJECTION_GUIDANCE" },
  { label: "Case-study selection", value: "CASE_STUDY_SELECTION" },
  { label: "Claim safety check", value: "CLAIM_SAFETY_CHECK" },
];

const questionTemplates = [
  "Is this company a good Signal fit?",
  "Who is the best persona to contact?",
  "What angle should I use for outreach?",
  "How should I respond to this objection?",
  "Which case study is safest to use?",
  "Is this claim safe to send externally?",
];

const companySizeOptions = [
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
  "Potential branded-search efficiency opportunity",
  "Competitors visible on brand terms",
  "Multi-market governance question",
  "Prospect asked a methodology question",
  "Prospect raised an objection",
  "Need safe evidence before outreach",
];

type SmartFieldProps = {
  name: string;
  label: string;
  options: string[];
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
};

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function fieldValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function SmartField({
  name,
  label,
  options,
  placeholder = "Enter manually",
  required = false,
  textarea = false,
}: SmartFieldProps) {
  const [value, setValue] = useState("");
  const [customValue, setCustomValue] = useState("");
  const isCustom = value === "__custom";
  const finalValue = isCustom ? customValue : value;
  const Input = textarea ? "textarea" : "input";

  return (
    <label className="block space-y-1 text-sm font-medium text-[#34352e]">
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
          className="mt-2 min-h-10 w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6"
          onChange={(event) => setCustomValue(event.target.value)}
          placeholder={placeholder}
          value={customValue}
        />
      ) : null}
      <input name={name} required={required} type="hidden" value={finalValue} />
    </label>
  );
}

export function AskSignalBrainClient() {
  const [mode, setMode] = useState<SignalBrainMode>("QUICK_ANSWER");
  const [result, setResult] = useState<SignalBrainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await askSignalBrainAction({
        question: fieldValue(formData, "question"),
        companyName: fieldValue(formData, "companyName"),
        companyWebsite: fieldValue(formData, "companyWebsite"),
        contactRole: fieldValue(formData, "contactRole"),
        industry: fieldValue(formData, "industry"),
        companySizeOrRevenue: fieldValue(formData, "companySizeOrRevenue"),
        geographyOrMarkets: fieldValue(formData, "geographyOrMarkets"),
        paidSearchContext: fieldValue(formData, "paidSearchContext"),
        currentVendor: fieldValue(formData, "currentVendor"),
        observedTrigger: fieldValue(formData, "observedTrigger"),
        internalNotes: fieldValue(formData, "internalNotes"),
        mode,
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="font-display text-4xl font-semibold leading-[1.22] text-ink">
              Ask Signal Brain
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-[#6f6d5f]">
              Ask one specific question and get a safe recommendation from approved Signal context.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-xs font-medium text-[#6f6d5f]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-olive" />
            Approved knowledge only
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <form action={onSubmit} className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <Brain aria-hidden="true" className="h-5 w-5 text-olive" />
            <h2 className="text-lg font-semibold text-ink">Quick question</h2>
          </div>

          <SmartField
            label="What do you want to know?"
            name="question"
            options={questionTemplates}
            placeholder="Write the exact question"
            required
            textarea
          />

          <label className="block space-y-1 text-sm font-medium text-[#34352e]">
            Answer mode
            <select
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              onChange={(event) => setMode(event.target.value as SignalBrainMode)}
              value={mode}
            >
              {modeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <details className="rounded-xl border border-line bg-cream p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Advanced account context
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SmartField label="Company" name="companyName" options={[]} />
              <SmartField label="Website" name="companyWebsite" options={[]} />
              <SmartField
                label="Buyer role"
                name="contactRole"
                options={personas.map((persona) => persona.name)}
              />
              <SmartField
                label="Industry"
                name="industry"
                options={industries.map((industry) => industry.name)}
              />
              <SmartField
                label="Company size or revenue"
                name="companySizeOrRevenue"
                options={companySizeOptions}
              />
              <SmartField
                label="Geography or markets"
                name="geographyOrMarkets"
                options={marketOptions}
              />
              <SmartField
                label="Paid-search context"
                name="paidSearchContext"
                options={paidSearchOptions}
              />
              <SmartField
                label="Known vendor or tool"
                name="currentVendor"
                options={vendorOptions}
              />
              <SmartField
                label="Observed trigger"
                name="observedTrigger"
                options={triggerOptions}
                textarea
              />
              <SmartField label="Internal notes" name="internalNotes" options={[]} textarea />
            </div>
          </details>

          {error ? (
            <p className="rounded-md border border-[#f1c6b7] bg-[#fff4ef] px-3 py-2 text-sm text-[#9a3f24]">
              {error}
            </p>
          ) : null}

          <button className="signal-button-primary" disabled={isPending} type="submit">
            <Brain aria-hidden="true" className="h-4 w-4" />
            {isPending ? "Answering..." : "Ask Signal Brain"}
          </button>
        </form>

        <section className="space-y-4">
          <article className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <FileText aria-hidden="true" className="h-5 w-5 text-olive" />
              <h2 className="text-lg font-semibold text-ink">Answer</h2>
            </div>
            {result ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f6d5f]">
                    Direct answer
                  </p>
                  <p className="mt-2 whitespace-pre-line rounded-xl bg-cream p-4 text-sm leading-6 text-ink">
                    {result.directAnswer}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f6d5f]">
                    Concise recommendation
                  </p>
                  <p className="mt-2 rounded-xl border border-line bg-white p-4 text-sm leading-6 text-[#34352e]">
                    {result.conciseRecommendation}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.detectedIntent.map((intent) => (
                    <span
                      className="rounded-full bg-lime px-2.5 py-1 text-xs font-semibold text-ink"
                      key={intent}
                    >
                      {label(intent)}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 text-[#6f6d5f]">
                Choose a question, add context only if needed, and the answer will appear here.
              </p>
            )}
          </article>

          {result ? (
            <>
              <article className="rounded-2xl border border-line bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Lightbulb aria-hidden="true" className="h-5 w-5 text-olive" />
                  <h2 className="text-lg font-semibold text-ink">Guidance</h2>
                </div>
                <p className="text-sm leading-6 text-[#34352e]">{result.reasoningSummary}</p>
                <p className="mt-3 text-sm font-semibold text-ink">
                  Next action: {result.recommendedNextAction}
                </p>

                {result.accountFit ? (
                  <div className="mt-4 rounded-xl border border-line bg-cream p-3">
                    <p className="font-semibold text-ink">Fit: {result.accountFit.result}</p>
                    <p className="mt-2 text-sm text-[#6f6d5f]">
                      Missing: {result.accountFit.missingInformation.join(", ") || "None noted"}
                    </p>
                  </div>
                ) : null}

                {result.personaRecommendation ? (
                  <div className="mt-4 rounded-xl border border-line bg-cream p-3 text-sm leading-6">
                    <p className="font-semibold text-ink">
                      Primary persona: {result.personaRecommendation.primaryPersona}
                    </p>
                    <p>Secondary: {result.personaRecommendation.secondaryPersona}</p>
                    <p>Angle: {result.personaRecommendation.bestAngle}</p>
                  </div>
                ) : null}

                {result.claimSafety ? (
                  <div className="mt-4 rounded-xl border border-line bg-cream p-3 text-sm leading-6">
                    <p className="font-semibold text-ink">
                      Claim status: {result.claimSafety.status}
                    </p>
                    <p>{result.claimSafety.reason}</p>
                    <p>Safer alternative: {result.claimSafety.saferAlternative}</p>
                  </div>
                ) : null}

                {result.caseStudyRecommendation ? (
                  <div className="mt-4 rounded-xl border border-line bg-cream p-3 text-sm leading-6">
                    <p className="font-semibold text-ink">
                      Case study: {result.caseStudyRecommendation.recommendedCaseStudy}
                    </p>
                    <p>Scope: {result.caseStudyRecommendation.eligibleUsageScope}</p>
                    <p>{result.caseStudyRecommendation.externalUseWarning}</p>
                  </div>
                ) : null}
              </article>

              <details className="rounded-2xl border border-line bg-white p-5">
                <summary className="cursor-pointer text-lg font-semibold text-ink">
                  Knowledge, sources, and safety
                </summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {result.recordsUsed.map((record) => (
                    <div className="rounded-xl border border-line p-3" key={record.id}>
                      <p className="text-sm font-semibold text-ink">{record.title}</p>
                      <p className="mt-1 text-xs text-[#6f6d5f]">{label(record.type)}</p>
                    </div>
                  ))}
                </div>
                <details className="mt-4 rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">Safety</summary>
                  <div className="mt-3 space-y-2">
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
                      <p className="text-sm text-[#6f6d5f]">No safety warnings for this answer.</p>
                    )}
                  </div>
                </details>
                <details className="mt-3 rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">Sources</summary>
                  <div className="mt-3 space-y-2">
                    {result.sourceReferences.map((source) => (
                      <p className="text-sm text-[#34352e]" key={source.id}>
                        <span className="font-semibold">{source.title}</span>
                        {source.sourceDate ? ` · ${source.sourceDate.slice(0, 10)}` : ""}
                      </p>
                    ))}
                  </div>
                </details>
              </details>

              <article className="rounded-2xl border border-line bg-white p-5">
                <h2 className="text-lg font-semibold text-ink">Related workflows</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.workflowLinks.map((link) => (
                    <a className="signal-button-secondary" href={link.href} key={link.href}>
                      {link.label}
                      <ExternalLink aria-hidden="true" className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              </article>

              <DraftRefinementPanel draftId={result.draftId} workflow="ASK_SIGNAL_BRAIN" />
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
