"use client";

import { useEffect, useState, useTransition } from "react";
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
import { AccountStatusPanel } from "@/features/account-status/account-status-panel";
import { purposeLabels } from "@/features/build-sequence/sequence-policy";
import { DraftRefinementPanel } from "@/features/draft-refinement/draft-refinement-panel";
import { industries, personas } from "@/features/playbook/playbook-content";
import { WorkflowBadge, WorkflowPage, WorkflowSectionTitle } from "@/features/workflow/workflow-layout";
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
  "Strong fit - confirmed",
  "Potential fit - validate spend/demand",
  "Enterprise - qualify",
  "Insufficient data",
  "Not a fit",
];

const buyerRoleOptions = personas
  .map((persona) => persona.name)
  .filter((name) => name !== "Brand Marketing or Brand Leadership");

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
  const hostLike = company
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(hostLike)) {
    return hostLike;
  }

  const cleaned = hostLike
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\b(inc|llc|ltd|limited|group|company|co|corp|corporation)\b/g, "")
    .trim()
    .split(/\s+/)[0];

  return cleaned ? `${cleaned}.com` : "";
}

function displayCompanyName(company: string) {
  const trimmed = company.trim();
  if (!trimmed) return "this account";
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }
  return trimmed;
}

function variantIndex(current: number, length: number) {
  return (current + 1) % length;
}

function subjectVariants(step: SequenceStep, company: string) {
  const account = displayCompanyName(company);
  const byPurpose: Record<SequenceStep["purpose"], string[]> = {
    FIRST_TOUCH_RELEVANCE: [
      `${account} branded ads question`,
      `When nobody is bidding on ${account}`,
      `Quick thought on ${account} brand search`,
    ],
    PROBLEM_FRAMING: [
      "Re: deactivating branded ads",
      `Paid brand waste at ${account}?`,
      "When brand clicks are already yours",
    ],
    METHODOLOGY_DIFFERENTIATION: [
      "Re: lower branded CPC",
      "Lower bids without losing coverage",
      "Paid brand, without the guesswork",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      `${account}: one brand-search check`,
      `A narrow question for ${account}`,
      `${account}: paid brand visibility`,
    ],
    SOCIAL_PROOF: [
      "A practical paid-brand example",
      `Relevant paid-brand example`,
      "A brand-search example that may help",
    ],
    TECHNICAL_CLARIFICATION: [
      "Paid brand methodology",
      `One way to test brand search`,
      "How to separate useful brand coverage",
    ],
    LOW_PRESSURE_FOLLOW_UP: [
      `Quick follow-up on ${account}`,
      "Worth revisiting later?",
      "Leaving this with you",
    ],
    BREAKUP_CLOSE_LOOP: [
      "Closing the loop",
      "Last note on paid brand",
      "Final thought on brand search",
    ],
  };
  return byPurpose[step.purpose].filter(Boolean);
}

function bodyVariants(step: SequenceStep, company: string) {
  const firstLine = step.messageBody.split("\n").find(Boolean) ?? "Hi there,";
  const account = displayCompanyName(company);

  if (step.purpose === "FIRST_TOUCH_RELEVANCE") {
    return [
      `${firstLine}\n\nQuick question on ${account} brand search: how do you decide when branded ads should stay live, and when organic would have captured the click anyway?\n\nSignal helps teams monitor search results and adjust branded coverage when other advertisers are not bidding, instead of paying for clicks that may not add value.`,
      `${firstLine}\n\nI had ${account} on my list for one narrow reason: branded search can look healthy in reports even when some paid clicks are not changing the outcome.\n\nThe question is not whether branded search is good or bad. It is where paid coverage still protects demand, and where organic results may already do enough.`,
      `${firstLine}\n\nHow do you handle branded ads when nobody else is bidding on ${account}?\n\nSignal watches the search page and can lower or pause paid brand coverage when the click would likely come through organic, then bring coverage back when competition returns.`,
    ];
  }

  if (step.purpose === "PROBLEM_FRAMING") {
    return [
      `${firstLine}\n\nFor context, Google does not offer an easy way to automatically pause or adjust branded ads when no other advertisers are bidding.\n\nAs a result, many teams keep paying for clicks that could have been captured organically or at a much lower CPC.\n\nDo you have visibility into when this happens?`,
      `${firstLine}\n\nGoogle does not provide an automated way to pause or down-bid branded ads when no other advertisers are bidding.\n\nAs a result, most brands keep paying for clicks they would have received organically.\n\nSignal identifies these moments and can reduce or pause bids until competition returns, while preserving brand coverage and performance.`,
      `${firstLine}\n\nThe reporting problem is that paid brand can look efficient even when it is just buying demand the brand already owns.\n\nThe cleaner check is simple: when nobody is bidding against ${account}, does paid coverage still change the outcome?`,
    ];
  }

  if (step.purpose === "METHODOLOGY_DIFFERENTIATION") {
    return [
      `${firstLine}\n\nOne other angle: this is not always about turning brand ads off.\n\nIn some cases, the better move is lowering the bid to the minimum needed to stay covered, especially when the search page is quiet and nobody is pushing CPC up.\n\nThat is where Signal can help: keep coverage where it matters, avoid overpaying where it does not.`,
      `${firstLine}\n\nA useful way to look at this is what is happening on the search page at the moment of the search.\n\nIf other advertisers are present, paid coverage may be protecting demand. If they are absent, the next move may be lowering bids or pausing until the page changes again.`,
      `${firstLine}\n\nThe decision should not be “always on” or “always off.”\n\nIt should depend on what the search page shows: competitors, organic coverage, and whether paid brand is still adding something measurable.`,
    ];
  }

  if (step.purpose === "ACCOUNT_SPECIFIC_OBSERVATION") {
    return [
      `${firstLine}\n\nI would keep the ${account} angle light: not a claim, just a reason to check whether paid brand is still doing work organic cannot do.\n\nThat makes the conversation safer and more useful than assuming there is waste.`,
      `${firstLine}\n\nFor ${account}, I would frame this as a quick validation rather than a pitch: is paid coverage needed everywhere, or only when organic and search-page conditions make it useful?`,
      `${firstLine}\n\nI would not assume ${account} has a problem. I would only check the places where brand demand is already strong and paid clicks may not be changing the result.`,
    ];
  }

  if (step.purpose === "SOCIAL_PROOF") {
    return [
      `${firstLine}\n\nThere are customer examples behind this, but I would use them carefully.\n\nThe useful takeaway is not the logo. It is the decision pattern: separate useful paid coverage from spend that is not changing the result.`,
      `${firstLine}\n\nI can share a short example if useful, but the main point is practical: this is about deciding where brand spend still earns its place.`,
      `${firstLine}\n\nThe examples that work best are not broad savings claims. They show a specific decision: keep paid brand when it protects demand, reduce it when organic already covers the click.`,
    ];
  }

  if (step.purpose === "TECHNICAL_CLARIFICATION") {
    return [
      `${firstLine}\n\nThe check does not need to be complicated: compare paid brand ads, organic results, and search-page conditions before changing coverage.\n\nThat keeps the discussion away from generic cost-cutting and focused on evidence.`,
      `${firstLine}\n\nThe clean version is: do not pause blindly, and do not keep coverage blindly. Test where paid brand changes the outcome.`,
      `${firstLine}\n\nThe method is to look at the full branded search result, not just paid performance. If organic is already strong and no competitor is present, the bid decision should be different.`,
    ];
  }

  if (step.purpose === "BREAKUP_CLOSE_LOOP") {
    return [
      `${firstLine}\n\nI will close the loop after this note.\n\nIf paid-brand efficiency becomes a priority later, the useful starting point is simple: where is paid coverage protecting demand, and where is it just adding cost?`,
      `${firstLine}\n\nLast note from me. If this is not relevant now, no problem at all. I only reached out because this is often hard to see from standard brand-search reporting.`,
      `${firstLine}\n\nI will leave this here.\n\nIf the team ever reviews paid-brand efficiency, the first useful question is whether paid clicks are creating demand or just capturing clicks organic already had.`,
    ];
  }

  return [
    `${firstLine}\n\nI wanted to keep this narrow: is paid brand coverage still creating value, or is some of that demand already covered organically?`,
    `${firstLine}\n\nThis may be worth a quick check before making any larger change to brand-search spend.`,
    `${firstLine}\n\nThe useful starting point is visibility: when the search page changes, should the bid strategy change with it?`,
  ];
}

function ctaVariants(step: SequenceStep) {
  const byPurpose: Record<SequenceStep["purpose"], string[]> = {
    FIRST_TOUCH_RELEVANCE: [
      "Do you already have a way to detect that?",
      "How do you currently catch this?",
      "Is this something you already track today?",
    ],
    PROBLEM_FRAMING: [
      "Do you have visibility into when this happens?",
      "Is this already part of your paid-brand review?",
      "How do you decide when those clicks are still worth paying for?",
    ],
    METHODOLOGY_DIFFERENTIATION: [
      "Is this something your team already checks regularly?",
      "Do you currently have a way to detect and manage this?",
      "Would it help to see where bids could safely come down?",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      "Would it be useful to check whether this applies at your scale?",
      "Worth a quick sanity check?",
      "Should I send the simple version of the check?",
    ],
    SOCIAL_PROOF: [
      "Want the short version of the example?",
      "Should I send the relevant example?",
      "Would a concrete example be useful?",
    ],
    TECHNICAL_CLARIFICATION: [
      "Would a simple method breakdown help?",
      "Do you already test this before changing bids?",
      "Is this the kind of decision you currently review manually?",
    ],
    LOW_PRESSURE_FOLLOW_UP: [
      "Worth revisiting later if this becomes a priority?",
      "Should I leave this for now?",
      "No issue if this is not on the roadmap right now.",
    ],
    BREAKUP_CLOSE_LOOP: [
      "If this is not relevant, I can close the loop here.",
      "If this is not relevant right now, no problem at all.",
      "I can leave this here if timing is not right.",
    ],
  };
  return byPurpose[step.purpose].filter(Boolean);
}

function normalizedLine(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sequenceQuality(steps: SequenceStep[]) {
  const issues: string[] = [];
  const wins: string[] = [];
  const subjects = steps.map((step) => normalizedLine(step.subjectLine ?? "")).filter(Boolean);
  const ctas = steps.map((step) => normalizedLine(step.cta ?? "")).filter(Boolean);
  const bodyText = steps.map((step) => step.messageBody).join("\n").toLowerCase();
  const uniquePurposes = new Set(steps.map((step) => step.purpose));

  if (new Set(subjects).size < subjects.length) {
    issues.push("One subject repeats. Regenerate one subject before using the sequence.");
  } else if (subjects.length > 0) {
    wins.push("Subjects are varied.");
  }

  if (new Set(ctas).size < Math.min(ctas.length, 3)) {
    issues.push("CTAs are too similar. Each step should ask in a slightly different way.");
  } else if (ctas.length > 0) {
    wins.push("CTAs are varied.");
  }

  if ((bodyText.match(/\bcompare|comparing\b/g)?.length ?? 0) > 2) {
    issues.push("The sequence leans too hard on compare. Swap one CTA for detect, check, or automate.");
  }

  if ((bodyText.match(/\bbrand(ed)? search\b/g)?.length ?? 0) > 8) {
    issues.push("Brand-search wording repeats a lot. Add one line about organic demand or bid control.");
  }

  if (uniquePurposes.size >= Math.min(steps.length, 3)) {
    wins.push("Steps have distinct jobs.");
  } else {
    issues.push("Steps are not distinct enough. Regenerate one body or CTA.");
  }

  if (steps.some((step) => step.purpose === "BREAKUP_CLOSE_LOOP" || step.purpose === "LOW_PRESSURE_FOLLOW_UP")) {
    wins.push("Includes a low-pressure close.");
  }

  return {
    status: issues.length === 0 ? "Strong sequence" : "Needs cleanup",
    issues,
    wins: wins.slice(0, 4),
  };
}

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function missingQuickBriefFields(formData: FormData) {
  return [
    ["companyName", "Company"],
  ]
    .filter(([name]) => !formString(formData, name))
    .map(([, label]) => label);
}

export const __buildSequenceVariantTest = {
  bodyVariants,
  ctaVariants,
  subjectVariants,
  variantIndex,
};

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
  const [accountStatusOverride, setAccountStatusOverride] = useState(false);
  const [accountStatusRefreshKey, setAccountStatusRefreshKey] = useState(0);
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
  const quality = result ? sequenceQuality(displayedSteps) : null;

  function setOverride(value: boolean) {
    setAccountStatusOverride(value);
    if (value) {
      setError(null);
    }
  }

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
    const nextIndex = variantIndex(stepSubjectVariantIndexes[step.stepNumber] ?? -1, variants.length);
    setStepSubjectVariantIndexes((current) => ({ ...current, [step.stepNumber]: nextIndex }));
    setStepSubjectDrafts((current) => ({ ...current, [step.stepNumber]: variants[nextIndex] }));
  }

  function regenerateBody(step: SequenceStep) {
    const variants = bodyVariants(step, companyName || "this account");
    const nextIndex = variantIndex(stepBodyVariantIndexes[step.stepNumber] ?? -1, variants.length);
    setStepBodyVariantIndexes((current) => ({ ...current, [step.stepNumber]: nextIndex }));
    setStepBodyDrafts((current) => ({ ...current, [step.stepNumber]: variants[nextIndex] }));
  }

  function regenerateCta(step: SequenceStep) {
    const variants = ctaVariants(step);
    const nextIndex = variantIndex(stepCtaVariantIndexes[step.stepNumber] ?? -1, variants.length);
    setStepCtaVariantIndexes((current) => ({ ...current, [step.stepNumber]: nextIndex }));
    setStepCtaDrafts((current) => ({ ...current, [step.stepNumber]: variants[nextIndex] }));
  }

  function onSubmit(formData: FormData) {
    setError(null);
    const missingFields = missingQuickBriefFields(formData);
    if (missingFields.length > 0) {
      setResult(null);
      setError(`Complete these fields first: ${missingFields.join(", ")}.`);
      return;
    }
    startTransition(async () => {
      const response = await generateBuildSequenceAction({
        companyName: formString(formData, "companyName"),
        companyWebsite: formString(formData, "companyWebsite") || undefined,
        contactFirstName: formString(formData, "contactFirstName") || undefined,
        contactRole: formString(formData, "contactRole") || "Head of Performance Marketing",
        industry: formString(formData, "industry") || undefined,
        companyContext: formString(formData, "companyContext") || "Potential fit - validate spend/demand",
        geographyOrMarkets: formString(formData, "geographyOrMarkets") || undefined,
        paidSearchContext: formString(formData, "paidSearchContext") || undefined,
        currentVendor: formString(formData, "currentVendor") || undefined,
        observedTrigger: formString(formData, "observedTrigger") || "Light discovery before pitching Signal",
        primaryChannel,
        sequenceLength,
        desiredTone: tone,
        desiredOverallDuration: formString(formData, "desiredOverallDuration") || "12 business days",
        outputLanguage,
        accountStatusOverride,
        internalNotes: formString(formData, "internalNotes") || undefined,
      });

      if (!response.ok) {
        setResult(null);
        setError(
          response.code === "ACCOUNT_STATUS_OVERRIDE_REQUIRED"
            ? `${response.message} Click "Continue with override" above, then build again.`
            : response.message,
        );
        if (response.code === "ACCOUNT_STATUS_OVERRIDE_REQUIRED") {
          setAccountStatusRefreshKey((current) => current + 1);
        }
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
    <WorkflowPage
      badge={
        <WorkflowBadge>
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#32795d]" />
          {t("workflow.draftOnly")}
        </WorkflowBadge>
      }
      description={t("workflow.sequence.description")}
      eyebrow={t("workflow.eyebrow")}
      title={t("workflow.sequence.title")}
    >

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <form
          action={onSubmit}
          className="space-y-4 rounded-2xl border border-line bg-white/95 p-5 shadow-[0_16px_45px_rgba(20,20,20,0.07)]"
        >
          <input name="outputLanguage" type="hidden" value={outputLanguage} />
          <WorkflowSectionTitle
            icon={<Layers3 aria-hidden="true" className="h-5 w-5" />}
            title={t("workflow.quickBrief")}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={t("workflow.company")}
              name="companyName"
              onChange={(value) => {
                setCompanyName(value);
                setCompanyWebsite(inferDomain(value));
                setAccountStatusOverride(false);
              }}
              required
              value={companyName}
            />
            <SmartField
              label={t("workflow.buyerRole")}
              name="contactRole"
              options={buyerRoleOptions}
            />
            <SmartField
              label={t("workflow.fitIcp")}
              name="companyContext"
              options={companySizeOptions}
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
            />
          </div>

          <AccountStatusPanel
            companyDomain={companyWebsite}
            companyName={companyName}
            onOverrideChange={setOverride}
            overrideActive={accountStatusOverride}
            refreshKey={accountStatusRefreshKey}
          />

          <details className="rounded-lg border border-line bg-[#f8f5ef] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {t("workflow.advancedOptionalDetails")}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label={t("workflow.website")}
                name="companyWebsite"
                onChange={(value) => {
                  setCompanyWebsite(value);
                  setAccountStatusOverride(false);
                }}
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
          <article className="rounded-2xl border border-line bg-white/95 p-5 shadow-[0_16px_45px_rgba(20,20,20,0.07)]">
            <div className="mb-3">
              <WorkflowSectionTitle
                icon={<FileText aria-hidden="true" className="h-5 w-5" />}
                title={t("workflow.strategy")}
              />
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
                {quality ? (
                  <div className="rounded-lg border border-line bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">Sequence quality</p>
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
                  </div>
                ) : null}
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
    </WorkflowPage>
  );
}
