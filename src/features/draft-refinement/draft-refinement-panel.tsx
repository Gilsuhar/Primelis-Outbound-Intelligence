"use client";

import { useEffect, useState, useTransition } from "react";
import { History, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";

import {
  getDraftRefinementStateAction,
  refineDraftVersionAction,
  restoreDraftVersionAction,
  saveManualDraftEditAction,
} from "@/app/draft-refinement/actions";
import type {
  DraftRefinementResult,
  DraftVersionView,
  RefinementCommand,
  RefinementWorkflow,
} from "@/features/draft-refinement/types";

const quickCommands: Array<{ label: string; command: RefinementCommand }> = [
  { label: "Generate again", command: "REGENERATE" },
  { label: "Shorter", command: "SHORTEN" },
  { label: "Less salesy", command: "LESS_SALESY" },
  { label: "Change CTA", command: "CHANGE_CTA" },
  { label: "Fix safety", command: "FIX_SAFETY" },
];

function formatDraftForDisplay(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          const step = item as {
            stepNumber?: number;
            delay?: string;
            subjectLine?: string;
            messageBody?: string;
            cta?: string;
          };
          return [
            `Step ${step.stepNumber ?? ""}${step.delay ? ` - ${step.delay}` : ""}`.trim(),
            step.subjectLine,
            step.messageBody,
            step.cta,
          ]
            .filter(Boolean)
            .join("\n\n");
        })
        .filter(Boolean)
        .join("\n\n---\n\n");
    }
  } catch {
    return content;
  }
  return content;
}

function stripUnsafePreviewTerms(content: string) {
  return content
    .replace(/\b(pricing|price|discount|trial|poc|proof of concept)\b/gi, "commercial details")
    .replace(/\bguarantee(?:d|s)?\b/gi, "support")
    .replace(/\balways reduce\b/gi, "may help evaluate");
}

function shortenPreview(content: string) {
  return content
    .split(/\n{2,}/)
    .map((block) => {
      const sentences = block.split(/(?<=[.!?])\s+/).filter(Boolean);
      return sentences.slice(0, Math.min(2, sentences.length || 1)).join(" ");
    })
    .join("\n\n");
}

function localPreviewForCommand(content: string, command: RefinementCommand, feedback?: string) {
  const formatted = formatDraftForDisplay(content);
  if (command === "SHORTEN") {
    return shortenPreview(formatted);
  }
  if (command === "FIX_SAFETY") {
    return stripUnsafePreviewTerms(formatted);
  }
  if (command === "CHANGE_CTA") {
    return formatted
      .replace(/Do you already track this today\?/gi, "Do you already have a way to detect that?")
      .replace(/Worth a quick compare\??/gi, "Do you have visibility into when this happens?")
      .replace(/Worth comparing how you decide this today\?/gi, "Is this already part of your paid-brand review?")
      .replace(/Would a simple view of this be useful\?/gi, "Is this something your team already checks regularly?");
  }
  if (command === "LESS_SALESY") {
    return formatted
      .replace(/quick compare/gi, "short check")
      .replace(/worth comparing/gi, "is it useful to see")
      .replace(/pitch/gi, "note")
      .replace(/salesy/gi, "direct");
  }
  if (command === "CUSTOM" && feedback?.trim()) {
    return `${formatted}\n\nRevision note: ${feedback.trim()}`;
  }
  return formatted
    .replace(/branded search can look healthy in reports/gi, "branded search can look efficient in reports")
    .replace(/Do you already track this today\?/gi, "Do you already have a way to detect that?");
}

export function DraftRefinementPanel({
  draftId,
  workflow,
}: {
  draftId: string;
  workflow: RefinementWorkflow;
}) {
  const [result, setResult] = useState<DraftRefinementResult | null>(null);
  const [customFeedback, setCustomFeedback] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [livePreview, setLivePreview] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    setResult(null);
    setManualContent("");
    setLivePreview("");
    setMessage(null);
    void (async () => {
      const response = await getDraftRefinementStateAction({
        generatedDraftId: draftId,
        workflow,
      });
      if (!active) return;
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      setResult(response.data);
      const formatted = formatDraftForDisplay(response.data.currentVersion.generatedContent);
      setManualContent(formatted);
      setLivePreview(formatted);
    })();
    return () => {
      active = false;
    };
  }, [draftId, workflow]);

  function refine(command: RefinementCommand) {
    const currentContent =
      manualContent.trim() || result?.currentVersion.generatedContent || livePreview || "";
    const preview = localPreviewForCommand(currentContent, command, customFeedback);
    if (preview.trim()) {
      setLivePreview(preview);
      setManualContent(preview);
      setMessage("Preview updated. Saving a version in the background...");
    } else {
      setMessage(null);
    }
    startTransition(async () => {
      const response = await refineDraftVersionAction({
        generatedDraftId: draftId,
        workflow,
        command,
        customFeedback: customFeedback || undefined,
      });
      if (!response.ok) {
        setMessage(`Preview updated locally. Server save failed: ${response.message}`);
        return;
      }
      setResult(response.data);
      const formatted = formatDraftForDisplay(response.data.currentVersion.generatedContent);
      setManualContent(formatted);
      setLivePreview(formatted);
      setMessage(`Created version ${response.data.currentVersion.versionNumber}.`);
    });
  }

  function saveManualEdit() {
    setMessage(null);
    startTransition(async () => {
      const response = await saveManualDraftEditAction({
        generatedDraftId: draftId,
        workflow,
        editedContent: manualContent,
      });
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      setResult(response.data as DraftRefinementResult);
      setLivePreview(manualContent);
      setMessage(`Saved version ${response.data.currentVersion.versionNumber}.`);
    });
  }

  function restore(version: DraftVersionView) {
    setMessage(null);
    startTransition(async () => {
      const response = await restoreDraftVersionAction({
        generatedDraftId: draftId,
        versionId: version.id,
      });
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      setResult(response.data as DraftRefinementResult);
      const formatted = formatDraftForDisplay(response.data.currentVersion.generatedContent);
      setManualContent(formatted);
      setLivePreview(formatted);
      setMessage(`Restored version ${response.data.currentVersion.versionNumber}.`);
    });
  }

  const versions = result?.versions ?? [];
  const current = result?.currentVersion;

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center gap-2">
        <Wand2 aria-hidden="true" className="h-5 w-5 text-olive" />
        <h2 className="text-lg font-semibold text-ink">Draft refinement</h2>
      </div>
      <p className="mt-1 text-sm text-[#6f6d5f]">
        Each action creates a new version. No draft is sent or approved automatically.
      </p>
      {message ? (
        <p className="mt-3 rounded-md bg-cream px-3 py-2 text-sm text-[#34352e]">{message}</p>
      ) : null}
      {isPending ? (
        <p className="mt-3 rounded-md bg-[#eef8ed] px-3 py-2 text-sm text-[#2f6f3a]">
          Updating the draft...
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {quickCommands.map((item) => (
          <button
            className="signal-button-secondary"
            disabled={isPending || (!current && !manualContent.trim())}
            key={item.command}
            onClick={() => refine(item.command)}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>
      <label className="mt-4 block space-y-1 text-sm font-medium text-[#34352e]">
        Custom feedback
        <textarea
          className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm"
          onChange={(event) => setCustomFeedback(event.target.value)}
          placeholder="Example: make this warmer, adapt to a VP Performance Marketing, or rewrite the CTA."
          value={customFeedback}
        />
      </label>
      <button
        className="signal-button-primary mt-2"
        disabled={isPending || !customFeedback.trim()}
        onClick={() => refine("CUSTOM")}
        type="button"
      >
        Apply custom feedback
      </button>

      {!current && !message ? (
        <p className="mt-4 rounded-md bg-cream px-3 py-2 text-sm text-[#6f6d5f]">
          Loading draft controls...
        </p>
      ) : null}

      {livePreview ? (
        <div className="mt-4 rounded-xl border border-[#dfee7a] bg-[#fbfee8] p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            <Wand2 aria-hidden="true" className="h-4 w-4 text-olive" />
            Live editable preview
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#34352e]">
            {livePreview}
          </p>
        </div>
      ) : null}

      {current ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-cream p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-olive" />
              Version {current.versionNumber} · {current.actionType.toLowerCase()} ·{" "}
              {result.safetyStatus}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#34352e]">
              {formatDraftForDisplay(current.generatedContent)}
            </p>
            {current.safetyFlags.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-[#9a3f24]">
                {current.safetyFlags.map((flag) => (
                  <li key={`${flag.flaggedWording}-${flag.reason}`}>
                    {flag.flaggedWording}: {flag.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <label className="block space-y-1 text-sm font-medium text-[#34352e]">
            Manual edit
            <textarea
              className="min-h-32 w-full rounded-md border border-line px-3 py-2 text-sm"
              onChange={(event) => setManualContent(event.target.value)}
              value={manualContent}
            />
          </label>
          <button
            className="signal-button-secondary"
            disabled={isPending || !manualContent.trim()}
            onClick={saveManualEdit}
            type="button"
          >
            Save edit as new version
          </button>
        </div>
      ) : null}

      {versions.length > 0 ? (
        <details className="mt-4 rounded-xl border border-line p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <History aria-hidden="true" className="h-4 w-4" />
            Version history
          </summary>
          <div className="mt-3 space-y-2">
            {versions.map((version) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cream px-3 py-2 text-sm"
                key={version.id}
              >
                <span>
                  v{version.versionNumber} · {version.actionType.toLowerCase()} ·{" "}
                  {version.providerStatus.toLowerCase().replaceAll("_", " ")}
                </span>
                <button
                  className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold"
                  disabled={isPending || version.isCurrent}
                  onClick={() => restore(version)}
                  type="button"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

    </section>
  );
}
