export type ProofWorkflow = "CREATE_OUTREACH" | "BUILD_SEQUENCE" | "REPLY_TO_PROSPECT" | "ASK_SIGNAL_BRAIN";

export type ProofContext = {
  workflow: ProofWorkflow;
  companyName?: string;
  industry?: string;
  contactRole?: string;
  question?: string;
  conversation?: string;
  requestedProof?: boolean;
};

export type ProofKnowledgeRecord = {
  id: string;
  title: string;
  type: string;
  approvalStatus?: string;
  approvedText: string;
  usageRestrictions?: string;
  usageScope?: string;
  sourceIds: string[];
  sourceTitles?: string[];
  sourceDates?: string[];
  metrics?: string[];
};

export type SelectedProof = {
  record: ProofKnowledgeRecord;
  customerName: string;
  allowedMetricNumbers: string[];
  allowedMetricPhrases: string[];
  matchReasons: string[];
  guidance: string;
};

export type ProofSelection = {
  selectedProof?: SelectedProof;
  records: ProofKnowledgeRecord[];
  notes: string[];
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((word) => word.length > 2 && !["and", "the", "with", "for", "this", "that"].includes(word)),
  );
}

function overlapScore(haystack: string, needles: Array<string | undefined>) {
  const haystackTokens = tokens(haystack);
  let score = 0;
  const reasons: string[] = [];
  for (const needle of needles) {
    if (!needle) {
      continue;
    }
    const matched = Array.from(tokens(needle)).filter((token) => haystackTokens.has(token));
    if (matched.length > 0) {
      score += matched.length;
      reasons.push(`Matched ${matched.slice(0, 4).join(", ")}`);
    }
  }
  return { score, reasons };
}

function inferCustomerName(record: ProofKnowledgeRecord) {
  const text = `${record.approvedText} ${record.title}`;
  const explicit = text.match(/\bCase study:\s*([^.\n]+)[.\n]/i);
  if (explicit?.[1]) {
    return explicit[1].trim();
  }
  const fromTitle = record.title.split(/\s+(?:case study|reduced|reduced|cut|cuts|lowered|saved|improved|increased|grew|with)\b/i)[0]?.trim();
  return fromTitle && fromTitle.length > 1 ? fromTitle : record.title.trim();
}

function metricNumbers(value: string) {
  const matches = value.match(/\b\d+(?:\.\d+)?\s?(?:%|percent)/gi) ?? [];
  const allowed = new Set<string>();
  for (const match of matches) {
    const number = match.match(/\d+(?:\.\d+)?/)?.[0];
    if (!number) {
      continue;
    }
    allowed.add(number);
    const rounded = Math.round(Number(number));
    if (Number.isFinite(rounded)) {
      allowed.add(String(rounded));
    }
  }
  return Array.from(allowed);
}

function metricPhrases(record: ProofKnowledgeRecord) {
  const phrases = new Set<string>();
  for (const phrase of [record.approvedText, ...(record.metrics ?? [])]) {
    const trimmed = phrase.trim();
    if (trimmed.length > 0) {
      phrases.add(trimmed);
    }
  }
  return Array.from(phrases);
}

function isEligibleProof(record: ProofKnowledgeRecord) {
  const restrictionText = `${record.usageScope ?? ""} ${record.usageRestrictions ?? ""}`;
  const hasBlockingRestriction =
    /\b(internal only|internal_only|confidential|do not use|restricted|needs review)\b/i.test(
      restrictionText,
    ) && !/\bapproved\b.*\b(outbound|external|social proof)\b/i.test(restrictionText);
  return (
    record.type === "CASE_STUDY" &&
    (!record.approvalStatus || record.approvalStatus === "APPROVED") &&
    record.approvedText.trim().length > 0 &&
    record.sourceIds.length > 0 &&
    !hasBlockingRestriction
  );
}

function customerIsProspect(customerName: string, companyName?: string) {
  if (!companyName) {
    return false;
  }
  const customer = normalize(customerName).replace(/\b(inc|llc|ltd|com)\b/g, "").trim();
  const prospect = normalize(companyName).replace(/\b(inc|llc|ltd|com)\b/g, "").trim();
  return customer.length > 1 && prospect.length > 1 && customer === prospect;
}

function guidanceFor(context: ProofContext, proof: SelectedProof) {
  const metricHint = proof.allowedMetricNumbers.length
    ? `Allowed metrics: ${proof.allowedMetricNumbers.map((number) => `${number}%`).join(", ")}.`
    : "No numeric metric should be added unless it appears in the approved proof text.";
  if (context.workflow === "BUILD_SEQUENCE") {
    return `${proof.customerName} is the only selected case study. Use it once, preferably in step 2 as proof or step 3 as method support. ${metricHint} Keep it as observed proof, not a promise.`;
  }
  if (context.workflow === "REPLY_TO_PROSPECT") {
    return `${proof.customerName} is the only selected proof. Use it only if it directly answers the latest prospect message. ${metricHint} Keep the reply short and move toward feedback or a 10-minute walkthrough.`;
  }
  return `${proof.customerName} is the only selected proof. ${metricHint} Use it only when it strengthens the buyer's question.`;
}

export function selectProofForContext<T extends ProofKnowledgeRecord>(
  records: T[],
  context: ProofContext,
): ProofSelection {
  const nonProofRecords = records.filter((record) => record.type !== "CASE_STUDY");
  const eligibleProof = records.filter(isEligibleProof);
  const notes = new Set<string>();

  if (eligibleProof.length === 0) {
    notes.add("No approved source-backed case study was selected for this workflow.");
    return { records: nonProofRecords, notes: Array.from(notes) };
  }

  const query = [
    context.industry,
    context.contactRole,
    context.question,
    context.conversation,
    /mql|sql|pipeline|demo|cac|lead/i.test(`${context.question ?? ""} ${context.conversation ?? ""}`)
      ? "B2B SaaS MQL SQL pipeline demo CAC"
      : undefined,
    /retail|ecommerce|fashion|luxury|travel|booking|nike|mango/i.test(
      `${context.industry ?? ""} ${context.companyName ?? ""} ${context.question ?? ""}`,
    )
      ? "retail ecommerce fashion luxury travel clicks revenue savings"
      : undefined,
  ];

  const ranked = eligibleProof
    .map((record, index) => {
      const haystack = `${record.title} ${record.approvedText} ${(record.metrics ?? []).join(" ")}`;
      const overlap = overlapScore(haystack, query);
      const customerName = inferCustomerName(record);
      const selfProofPenalty = customerIsProspect(customerName, context.companyName) ? 100 : 0;
      const score = overlap.score - selfProofPenalty - (context.requestedProof ? 0 : 1);
      return { record, index, score, customerName, reasons: overlap.reasons };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const winner = ranked[0];
  if (!winner || winner.score < -20 || (!context.requestedProof && winner.reasons.length === 0)) {
    notes.add("Eligible case studies exist, but none should be used for this prospect context.");
    return { records: nonProofRecords, notes: Array.from(notes) };
  }

  const selectedProof: SelectedProof = {
    record: winner.record,
    customerName: winner.customerName,
    allowedMetricNumbers: metricNumbers(`${winner.record.approvedText} ${(winner.record.metrics ?? []).join(" ")}`),
    allowedMetricPhrases: metricPhrases(winner.record),
    matchReasons: winner.reasons.length ? winner.reasons : ["Best available approved proof record."],
    guidance: "",
  };
  selectedProof.guidance = guidanceFor(context, selectedProof);
  notes.add(`Selected proof: ${selectedProof.customerName}. ${selectedProof.guidance}`);
  return {
    selectedProof,
    records: [...nonProofRecords, winner.record],
    notes: Array.from(notes),
  };
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsCustomerName(text: string, customerName: string) {
  const normalizedCustomer = customerName.trim();
  if (normalizedCustomer.length < 3) {
    return false;
  }
  return new RegExp(`\\b${escaped(normalizedCustomer)}\\b`, "i").test(text);
}

function percentagesIn(text: string) {
  return text.match(/\b\d+(?:\.\d+)?\s?(?:%|percent)/gi) ?? [];
}

export function validateProofUsage({
  output,
  selectedProof,
  availableProofRecords,
  maxMetricMentions = 2,
}: {
  output: string;
  selectedProof?: SelectedProof;
  availableProofRecords: ProofKnowledgeRecord[];
  maxMetricMentions?: number;
}) {
  const knownProof = availableProofRecords.filter((record) => record.type === "CASE_STUDY");
  const otherCustomers = knownProof
    .map(inferCustomerName)
    .filter((customer) => !selectedProof || normalize(customer) !== normalize(selectedProof.customerName));

  for (const customer of otherCustomers) {
    if (containsCustomerName(output, customer)) {
      return {
        ok: false,
        reason: `Output mentioned non-selected case study customer: ${customer}.`,
      };
    }
  }

  const percentages = percentagesIn(output);
  if (!selectedProof) {
    if (percentages.length > 0) {
      return { ok: false, reason: "Output used a numeric proof metric without selected proof." };
    }
    return { ok: true };
  }

  const allowedNumbers = new Set(selectedProof.allowedMetricNumbers.map((number) => Number(number).toFixed(0)));
  for (const percentage of percentages) {
    const number = percentage.match(/\d+(?:\.\d+)?/)?.[0];
    const rounded = number ? Number(number).toFixed(0) : "";
    if (!allowedNumbers.has(rounded)) {
      return {
        ok: false,
        reason: `Output used unsupported proof metric: ${percentage}.`,
      };
    }
  }

  for (const number of selectedProof.allowedMetricNumbers) {
    const pattern = new RegExp(`\\b${escaped(number)}(?:\\.\\d+)?\\s?(?:%|percent)\\b`, "gi");
    const count = output.match(pattern)?.length ?? 0;
    if (count > maxMetricMentions) {
      return {
        ok: false,
        reason: `Selected proof metric ${number}% was repeated too many times.`,
      };
    }
  }

  return { ok: true };
}
