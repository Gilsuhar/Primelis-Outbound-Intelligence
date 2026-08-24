import type {
  ExtractedFact,
  IdentityResolution,
  ProspectConflict,
  ProspectExtraction,
  ProspectRecord,
  ProspectSource,
} from "./types";

export type UniversalProspectInput = {
  rawText: string;
};

function compact(value?: string) {
  return value?.replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function lines(value: string) {
  return value
    .split(/\r?\n|[•]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeDomain(value?: string) {
  return compact(value)
    ?.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/\.$/, "");
}

export function normalizeLinkedInUrl(value?: string) {
  const normalized = compact(value)
    ?.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[?#]/)[0]
    .replace(/\/$/, "");
  return normalized?.includes("linkedin.com/") ? normalized : undefined;
}

function normalizeName(value?: string) {
  return compact(value)?.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

function stripSourceLabel(value: string) {
  return value
    .replace(/^\s*(?:about|linkedin|notes?|prospect|company|serp|role|title|context|keywords?|important)\s*:\s*/i, "")
    .trim();
}

function isRoleOrSeniorityFragment(value?: string) {
  const normalized = normalizeName(value);
  if (!normalized) return false;
  const roleWords = new Set([
    "head",
    "senior",
    "paid",
    "director",
    "manager",
    "vp",
    "vice",
    "president",
    "lead",
    "growth",
    "performance",
    "search",
    "marketing",
    "acquisition",
    "demand",
    "ppc",
    "sem",
  ]);
  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => roleWords.has(token));
}

function labeledValue(rawText: string, labels: string[]) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return rawText.match(new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*[:\\-]\\s*([^\\n]+)`, "i"))?.[1]?.trim();
}

function inferredFullName(rawText: string) {
  const labeled = labeledValue(rawText, ["name", "prospect", "full name"]);
  if (labeled && !isRoleOrSeniorityFragment(labeled)) return compact(labeled);
  const rawLines = lines(rawText);
  const fullName = rawLines.find((line) =>
    /^[A-Z][a-z' -]{1,30}(?:\s+[A-Z][a-z' -]{1,40}){1,3}$/.test(line) &&
    !isRoleOrSeniorityFragment(line) &&
    !/\b(?:company|role|title|about|experience|education|activity|posted|linkedin)\b/i.test(line),
  );
  if (fullName) return fullName;
  const firstLine = rawLines[0];
  if (
    firstLine &&
    rawLines.length > 1 &&
    /^[A-Z][a-z' -]{1,40}$/.test(firstLine) &&
    !isUiNoise(firstLine) &&
    !isRoleOrSeniorityFragment(firstLine) &&
    !/\b(?:company|role|title|about|experience|education|activity|posted|linkedin|google|serp|ads|keyword)\b/i.test(firstLine)
  ) {
    return compact(firstLine);
  }
  return undefined;
}

function splitName(fullName?: string) {
  const parts = compact(fullName)?.split(/\s+/).filter(Boolean) ?? [];
  const firstName = isRoleOrSeniorityFragment(parts[0]) ? undefined : parts[0];
  return {
    firstName,
    lastName: firstName && parts.length > 1 ? parts.slice(1).join(" ") : undefined,
  };
}

function inferredRole(rawText: string) {
  const labeled = labeledValue(rawText, ["role", "title", "job title", "current role"]);
  if (labeled) return compact(labeled);
  return lines(rawText).find((line) =>
    line.length <= 120 &&
    /\b(?:ppc|paid search|sem|performance|growth|marketing|media|acquisition|demand|ecommerce|e-commerce|digital)\b/i.test(line) &&
    /\b(?:lead|manager|director|head|vp|vice president|specialist|strategist|analyst|team lead|consultant)\b/i.test(line),
  );
}

function inferredCompany(rawText: string, domain?: string) {
  const labeled = labeledValue(rawText, ["company", "account", "employer"]);
  if (labeled) return compact(labeled);
  const atRole = rawText.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&'. -]{2,80})(?:\.|\n|$)/)?.[1];
  if (atRole) return compact(atRole);
  if (domain) {
    const token = domain.split(".")[0];
    return token ? token.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : undefined;
  }
  const fullName = inferredFullName(rawText);
  const role = inferredRole(rawText);
  return lines(rawText).find((line, index) =>
    index > 0 &&
    line !== fullName &&
    line !== role &&
    /^[A-Z][A-Za-z0-9&'. -]{2,80}$/.test(line) &&
    !isUiNoise(line) &&
    !/\b(?:managed|interested|exploring|google|ads|context|serp|paid|search|automation|ai|keyword|competition|competitor|solo|contested)\b/i.test(line),
  );
}

function sentenceFragments(rawText: string) {
  return unique(
    lines(rawText).flatMap((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean),
    ),
  );
}

function isUiNoise(value: string) {
  return /^(about|activity|experience|education|skills|contact info|followers|connections|message|follow|connect|more|show all)$/i.test(
    value.trim(),
  );
}

function prospectFacts(rawText: string) {
  return sentenceFragments(rawText)
    .map(stripSourceLabel)
    .filter((fact) =>
      fact.length <= 220 &&
      !isUiNoise(fact) &&
      !isRoleOrSeniorityFragment(fact) &&
      !/^https?:\/\//i.test(fact) &&
      /\b(?:managed|built|led|promoted|promotion|responsible|owns|exploring|interested|ai|automation|\$?\d+[mk+]?|spend|budget|growth|paid search|ppc|google ads)\b/i.test(
        fact,
      ),
    )
    .slice(0, 8);
}

function companyFacts(rawText: string) {
  return sentenceFragments(rawText)
    .map(stripSourceLabel)
    .filter((fact) =>
      fact.length <= 220 &&
      /\b(?:company|market|brand|retail|saas|ecommerce|e-commerce|global|customers|category|team|accounts?)\b/i.test(fact),
    )
    .slice(0, 6);
}

function linkedinInsights(rawText: string) {
  return sentenceFragments(rawText)
    .map(stripSourceLabel)
    .filter((fact) => /\b(?:linkedin|posted|post|about|promoted|promotion|followers|activity)\b/i.test(fact))
    .slice(0, 6);
}

function parseSerpLine(line: string) {
  if (/\b(?:no|without|none|not)\s+(?:verified\s+)?(?:serp|keyword|keywords?|evidence|screenshot)\b/i.test(line)) {
    return undefined;
  }
  const normalized = line.toLowerCase();
  if (!/\b(?:solo|alone|competitor|appeared|visible|contested|serp|keyword|pricing|editor|brand)\b/i.test(line)) {
    return undefined;
  }
  const status = /\b(?:solo|alone|only advertiser|no competitor)\b/i.test(line)
    ? "SOLO"
    : /\b(?:competitor|appeared|visible|contested|another advertiser)\b/i.test(line)
      ? "CONTESTED"
      : "UNKNOWN";
  const keyword = line
    .split(/\s+[—-]\s+|\s+:\s+/)[0]
    .replace(/\b(?:keyword|serp|query)\b/gi, "")
    .trim();
  if (!keyword || keyword.length > 120 || !/[a-z0-9]/i.test(keyword)) return undefined;
  const competitors = unique(
    [
      line.match(/\b([A-Z][A-Za-z0-9&'. -]{1,50})\s+(?:appeared|visible)\b/)?.[1],
      line.match(/\bcompetitor\s*[:\-]\s*([A-Z][A-Za-z0-9&'. -]{1,50})/i)?.[1],
    ].filter((value): value is string => Boolean(value)),
  )
    .map((competitor) =>
      competitor
        .replace(new RegExp(`^${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-\\s*competitor\\s*`, "i"), "")
        .replace(/\s+(?:appeared|visible)\b.*$/i, "")
        .trim(),
    )
    .filter((competitor) => normalizeName(competitor) !== normalizeName(keyword));
  return {
    keyword,
    status: status as "SOLO" | "CONTESTED" | "UNKNOWN",
    competitors,
    observation: compact(line),
    normalized,
  };
}

function serpEvidence(rawText: string): ProspectExtraction["serpEvidence"] {
  return lines(rawText)
    .map(parseSerpLine)
    .filter((item): item is NonNullable<ReturnType<typeof parseSerpLine>> => Boolean(item))
    .map(({ keyword, status, competitors, observation }) => ({
      keyword,
      status,
      competitors,
      observation,
    }))
    .slice(0, 8);
}

export function extractProspect(rawInput: UniversalProspectInput): ProspectExtraction {
  const rawText = rawInput.rawText.trim();
  const email = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
  const linkedinUrl = normalizeLinkedInUrl(rawText.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0]);
  const explicitDomain = normalizeDomain(
    labeledValue(rawText, ["domain", "company domain", "website"]) ??
      rawText.match(/https?:\/\/(?:www\.)?([A-Z0-9.-]+\.[A-Z]{2,})/i)?.[0],
  );
  const companyDomain = explicitDomain && !explicitDomain.includes("linkedin.com") ? explicitDomain : undefined;
  const fullName = inferredFullName(rawText);
  const { firstName, lastName } = splitName(fullName);
  const jobTitle = inferredRole(rawText);
  const companyName = inferredCompany(rawText, companyDomain);
  const parsedSerp = serpEvidence(rawText);
  const extractedProspectFacts = prospectFacts(rawText);
  const extractedCompanyFacts = companyFacts(rawText);
  const extractedLinkedIn = linkedinInsights(rawText);
  const notes = sentenceFragments(rawText)
    .filter((fact) => !extractedProspectFacts.includes(fact) && !extractedCompanyFacts.includes(fact))
    .slice(0, 6);

  return {
    firstName,
    lastName,
    fullName,
    email,
    jobTitle,
    companyName,
    companyDomain,
    linkedinUrl,
    prospectFacts: extractedProspectFacts,
    companyFacts: extractedCompanyFacts,
    linkedinInsights: extractedLinkedIn,
    notes,
    serpEvidence: parsedSerp,
    confidence: {
      identity: fullName || email || linkedinUrl ? 0.82 : 0.45,
      company: companyName || companyDomain ? 0.78 : 0.35,
      extraction: rawText.length > 80 ? 0.78 : 0.55,
    },
  };
}

export function resolveIdentity(
  extraction: ProspectExtraction,
  prospects: ProspectRecord[],
): IdentityResolution {
  const email = extraction.email?.toLowerCase();
  if (email) {
    const match = prospects.find((prospect) => prospect.email?.toLowerCase() === email);
    if (match) return { status: "EXACT_MATCH", prospectId: match.id, matchedBy: ["email"], confidence: 1 };
  }

  const linkedinUrl = normalizeLinkedInUrl(extraction.linkedinUrl);
  if (linkedinUrl) {
    const match = prospects.find((prospect) => normalizeLinkedInUrl(prospect.linkedinUrl) === linkedinUrl);
    if (match) return { status: "EXACT_MATCH", prospectId: match.id, matchedBy: ["linkedinUrl"], confidence: 0.98 };
  }

  const fullName = normalizeName(extraction.fullName);
  const domain = normalizeDomain(extraction.companyDomain);
  if (fullName && domain) {
    const match = prospects.find(
      (prospect) => normalizeName(prospect.fullName) === fullName && normalizeDomain(prospect.companyDomain) === domain,
    );
    if (match) {
      return { status: "HIGH_CONFIDENCE_MATCH", prospectId: match.id, matchedBy: ["fullName", "companyDomain"], confidence: 0.94 };
    }
  }

  const companyName = normalizeName(extraction.companyName);
  if (fullName && companyName) {
    const matches = prospects.filter(
      (prospect) => normalizeName(prospect.fullName) === fullName && normalizeName(prospect.companyName) === companyName,
    );
    if (matches.length === 1) {
      return { status: "HIGH_CONFIDENCE_MATCH", prospectId: matches[0].id, matchedBy: ["fullName", "companyName"], confidence: 0.9 };
    }
    if (matches.length > 1) {
      return { status: "AMBIGUOUS", matchedBy: ["fullName", "companyName"], confidence: 0.55 };
    }
  }

  if (fullName) {
    const weakMatches = prospects.filter((prospect) => normalizeName(prospect.fullName) === fullName);
    if (weakMatches.length > 0) {
      return { status: "AMBIGUOUS", matchedBy: ["fullName"], confidence: 0.5 };
    }
  }

  return { status: "NEW_PROSPECT", confidence: 0.85 };
}

function equivalent(existing?: string, incoming?: string) {
  if (!existing || !incoming) return false;
  return normalizeName(existing) === normalizeName(incoming) || normalizeDomain(existing) === normalizeDomain(incoming);
}

export function mergeProspectRecord(
  existing: ProspectRecord,
  extraction: ProspectExtraction,
): { prospect: ProspectRecord; conflicts: ProspectConflict[] } {
  const conflicts: ProspectConflict[] = [];
  const next: ProspectRecord = { ...existing, status: "CONTEXT_READY" };
  const fields = [
    "firstName",
    "lastName",
    "fullName",
    "email",
    "jobTitle",
    "companyName",
    "companyDomain",
    "linkedinUrl",
  ] as const;
  for (const field of fields) {
    const incoming = extraction[field];
    if (!incoming) continue;
    const existingValue = next[field];
    if (!existingValue) {
      next[field] = incoming;
      continue;
    }
    if (equivalent(existingValue, incoming)) {
      continue;
    }
    conflicts.push({ field, existingValue, incomingValue: incoming });
  }
  return { prospect: next, conflicts };
}

export function factsFromExtraction(source: ProspectSource, extraction: ProspectExtraction): ExtractedFact[] {
  return [
    ...extraction.prospectFacts.map((value) => ({ value, sourceId: source.id, category: "PROSPECT" as const })),
    ...extraction.companyFacts.map((value) => ({ value, sourceId: source.id, category: "COMPANY" as const })),
    ...extraction.linkedinInsights.map((value) => ({ value, sourceId: source.id, category: "LINKEDIN" as const })),
    ...extraction.notes.map((value) => ({ value, sourceId: source.id, category: "NOTE" as const })),
    ...extraction.serpEvidence.map((item) => ({
      value: [item.keyword, item.status, item.competitors?.join(", "), item.observation].filter(Boolean).join(" - "),
      sourceId: source.id,
      category: "SERP" as const,
    })),
  ];
}
