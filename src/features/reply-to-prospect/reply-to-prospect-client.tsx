"use client";

import { useState, useTransition } from "react";
import {
  FileText,
  MessageSquareReply,
  ShieldCheck,
} from "lucide-react";

import { generateReplyToProspectAction } from "@/app/reply-to-prospect/actions";
import { useOutputLanguage } from "@/components/language-selector";
import { DraftRefinementPanel } from "@/features/draft-refinement/draft-refinement-panel";
import { personas } from "@/features/playbook/playbook-content";
import { WorkflowBadge, WorkflowPage, WorkflowSectionTitle } from "@/features/workflow/workflow-layout";
import { translateUi, type UiTextKey } from "@/lib/ui-translations";
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

const buyerRoleOptions = personas
  .map((persona) => persona.name)
  .filter((name) => name !== "Brand Marketing or Brand Leadership");

function OptionalSelect({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const outputLanguage = useOutputLanguage();
  const isCustom = value === "__custom";
  const t = (key: UiTextKey) => translateUi(key, outputLanguage);

  return (
    <label className="block min-w-0 space-y-1 text-sm font-medium text-stone-700">
      {label}
      <select
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
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
        <input
          className="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm"
          onChange={(event) => setCustom(event.target.value)}
          placeholder={t("workflow.enterManually")}
          value={custom}
        />
      ) : null}
      <input name={name} type="hidden" value={isCustom ? custom : value} />
    </label>
  );
}

export function ReplyToProspectClient() {
  const outputLanguage = useOutputLanguage();
  const t = (key: UiTextKey) => translateUi(key, outputLanguage);
  const [result, setResult] = useState<ReplyToProspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [prospectMessage, setProspectMessage] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [channel, setChannel] = useState<ReplyChannel>("EMAIL");
  const [tone, setTone] = useState<ReplyTone>("CONSULTATIVE");
  const [length, setLength] = useState<ReplyLength>("STANDARD");

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const response = await generateReplyToProspectAction({
        prospectMessage,
        companyName: companyName || undefined,
        contactRole: contactRole || undefined,
        channel,
        desiredTone: tone,
        desiredLength: length,
        outputLanguage,
        contextNotes: contextNotes || undefined,
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
    <WorkflowPage
      badge={
        <WorkflowBadge>
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#32795d]" />
          {t("workflow.approvedKnowledge")}
        </WorkflowBadge>
      }
      description={t("workflow.reply.description")}
      eyebrow={t("workflow.eyebrow")}
      title={t("workflow.reply.title")}
    >

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <form
          action={onSubmit}
          className="space-y-4 rounded-2xl border border-line bg-white/95 p-5 shadow-[0_16px_45px_rgba(20,20,20,0.07)]"
        >
          <input name="outputLanguage" type="hidden" value={outputLanguage} />
          <WorkflowSectionTitle
            icon={<MessageSquareReply aria-hidden="true" className="h-5 w-5" />}
            title={t("workflow.quickReplyBrief")}
          />

          <label className="block space-y-1 text-sm font-medium text-stone-700">
            {t("workflow.prospectMessage")}
            <textarea
              className="min-h-40 w-full rounded-md border border-line px-3 py-2 text-sm leading-6"
              name="prospectMessage"
              onChange={(event) => setProspectMessage(event.target.value)}
              placeholder={t("workflow.reply.placeholder")}
              required
              value={prospectMessage}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0 space-y-1 text-sm font-medium text-stone-700">
              {t("workflow.company")}
              <input
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                name="companyName"
                onChange={(event) => setCompanyName(event.target.value)}
                value={companyName}
              />
            </label>
            <OptionalSelect
              label={t("workflow.buyerRole")}
              name="contactRole"
              onChange={setContactRole}
              options={buyerRoleOptions}
              value={contactRole}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block min-w-0 space-y-1 text-sm font-medium text-stone-700">
              {t("workflow.channel")}
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
              {t("workflow.tone")}
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
              {t("workflow.length")}
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
              {t("workflow.advancedOptionalContext")}
            </summary>
            <label className="mt-3 block space-y-1 text-sm font-medium text-stone-700">
              {t("workflow.contextNotes")}
              <textarea
                className="min-h-24 w-full rounded-md border border-line px-3 py-2 text-sm leading-6"
                name="contextNotes"
                onChange={(event) => setContextNotes(event.target.value)}
                value={contextNotes}
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
            {isPending ? t("workflow.drafting") : t("workflow.generateReply")}
          </button>
        </form>

        <section className="space-y-4">
          <article className="rounded-2xl border border-line bg-white/95 p-5 shadow-[0_16px_45px_rgba(20,20,20,0.07)]">
            <div className="mb-3">
              <WorkflowSectionTitle
                icon={<FileText aria-hidden="true" className="h-5 w-5" />}
                title={t("workflow.generatedResponse")}
              />
            </div>
            {result ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    {t("workflow.recommendedReply")}
                  </p>
                  <p className="mt-2 whitespace-pre-line rounded-md bg-[#f8f5ef] p-3 text-sm leading-6 text-ink">
                    {result.recommendedReply}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    {t("workflow.shorterAlternative")}
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
                {t("workflow.reply.empty")}
              </p>
            )}
          </article>

          {result ? (
            <>
              <details className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <summary className="cursor-pointer text-lg font-semibold text-ink">
                  {t("workflow.strategy")}
                </summary>
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
              </details>

              <details className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <summary className="cursor-pointer text-lg font-semibold text-ink">
                  {t("workflow.sourcesAndSafety")}
                </summary>
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
              </details>

              <DraftRefinementPanel draftId={result.draftId} workflow="REPLY_TO_PROSPECT" />
            </>
          ) : null}
        </section>
      </div>
    </WorkflowPage>
  );
}
