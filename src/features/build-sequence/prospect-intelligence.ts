import type {
  BuildSequenceInput,
  ProspectIntelligence,
  SequenceKnowledgeRecord,
} from "./types";

function compact(value?: string) {
  return value?.replace(/\s+/g, " ").trim();
}

function lines(value?: string) {
  return (value ?? "")
    .split(/\r?\n|[;•]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sentenceFragments(value?: string, max = 4) {
  return unique(lines(value).flatMap((line) => line.split(/(?<=[.!?])\s+/))).slice(0, max);
}

function inferPersona(input: BuildSequenceInput): ProspectIntelligence["persona"] {
  const text = `${input.contactRole} ${input.prospectContext ?? ""}`.toLowerCase();
  if (/paid search|sem|ppc|google ads|search marketing/.test(text)) return "PAID_SEARCH";
  if (/growth|pipeline|revenue|conversion|experiment/.test(text)) return "GROWTH";
  if (/performance|demand gen|acquisition|media buying|paid media/.test(text)) return "PERFORMANCE";
  if (/ecommerce|e-commerce|commerce|marketplace|retail/.test(text)) return "ECOMMERCE";
  if (/cmo|chief marketing|vp marketing|head of marketing|marketing director/.test(text)) {
    return "MARKETING_LEADERSHIP";
  }
  return "OTHER";
}

function inferSeniority(input: BuildSequenceInput) {
  const text = `${input.contactRole} ${input.prospectContext ?? ""}`.toLowerCase();
  if (/\b(chief|cmo|founder|co-founder|president)\b/.test(text)) return "C-level";
  if (/\bvp|vice president\b/.test(text)) return "VP";
  if (/\bhead|director\b/.test(text)) return "Director or Head";
  if (/\bmanager|lead\b/.test(text)) return "Manager or Lead";
  return undefined;
}

function inferProspectName(input: BuildSequenceInput) {
  if (input.contactFirstName) return input.contactFirstName;
  const match = input.prospectContext?.match(/\b(?:name|prospect)\s*[:\-]\s*([A-Z][a-z]+)\b/);
  return match?.[1];
}

function keywordFromLine(line: string) {
  return line
    .replace(/\b(brand bidding alone|brand alone|competitor visible|competitors visible|alone|contested|visible|checked)\b/gi, "")
    .replace(/\s+[—-]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableKeyword(keyword: string) {
  const normalized = keyword.toLowerCase();
  if (!keyword.trim()) return false;
  if (keyword.length > 100) return false;
  if (/^(all|all keywords?|all kws?|all brand keywords?|all terms?)$/i.test(keyword)) return false;
  if (/\bkws?\b|\bbi+d+ing\b|\bbidding\b|\ball\s+(?:keywords?|kws?|terms?)\b/i.test(normalized)) {
    return false;
  }
  return /[a-z0-9]/i.test(keyword);
}

function parseSerpEvidence(input: BuildSequenceInput) {
  const rawLines = [
    ...lines(input.serpEvidence),
    input.brandKeyword ? `${input.brandKeyword} ${input.screenshotShows ?? ""}` : "",
    input.screenshotShows ?? "",
  ].filter(Boolean);
  const soloKeywords: string[] = [];
  const contestedKeywords: string[] = [];
  const keywords: string[] = [];
  const competitors: string[] = [];
  const observations = unique(rawLines);
  const allText = rawLines.join(" ").toLowerCase();

  for (const line of rawLines) {
    const normalized = line.toLowerCase();
    const keyword = keywordFromLine(line);
    if (isUsableKeyword(keyword) && !/^brand was alone|no other advertiser/.test(normalized)) {
      keywords.push(keyword);
    }
    if (/alone|only advertiser|no other advertiser|without visible competition|solo/.test(normalized)) {
      if (isUsableKeyword(keyword)) soloKeywords.push(keyword);
    }
    if (/competitor|contested|another advertiser|other advertiser/.test(normalized)) {
      if (isUsableKeyword(keyword) && !/no other advertiser|without visible competition/.test(normalized)) {
        contestedKeywords.push(keyword);
      }
      const afterCompetitor = line.match(/competitors?\s*(?:visible|present|:|-)?\s*([A-Za-z0-9, &.-]+)/i)?.[1];
      if (afterCompetitor) {
        competitors.push(...afterCompetitor.split(/,| and | & /).map((item) => item.trim()));
      }
    }
  }

  if (/brand was alone on all|alone on all|all \d+/.test(allText)) {
    soloKeywords.push(...keywords);
  }

  return {
    keywords: unique(keywords),
    soloKeywords: unique(soloKeywords),
    contestedKeywords: unique(contestedKeywords),
    competitors: unique(competitors).slice(0, 6),
    observations,
  };
}

function classifySerpScenario(
  evidence: ProspectIntelligence["serpEvidence"],
): ProspectIntelligence["serpScenario"] {
  if (evidence.soloKeywords.length > 0 && evidence.contestedKeywords.length > 0) return "MIXED";
  if (evidence.contestedKeywords.length > 0) return "CONTESTED";
  if (evidence.soloKeywords.length > 0) return "SOLO";
  if (evidence.observations.some((observation) => /alone on all|brand was alone/i.test(observation))) {
    return "SOLO";
  }
  if (
    evidence.observations.some((observation) =>
      /\b(?:alone|solo)\b/i.test(observation) &&
      /\ball\s+(?:keywords?|kws?|terms?)\b/i.test(observation),
    )
  ) {
    return "SOLO";
  }
  return "UNKNOWN";
}

function prioritiesFor(persona: ProspectIntelligence["persona"], scenario: ProspectIntelligence["serpScenario"]) {
  const personaPriorities: Record<ProspectIntelligence["persona"], string[]> = {
    PAID_SEARCH: ["CPC control", "auction pressure", "SERP visibility", "coverage"],
    PERFORMANCE: ["efficiency", "conversion quality", "traffic stability", "bid adjustments"],
    GROWTH: ["growth efficiency", "pipeline quality", "incrementality", "conversion impact"],
    ECOMMERCE: ["order efficiency", "traffic quality", "market coverage", "brand demand"],
    MARKETING_LEADERSHIP: ["spend efficiency", "scale", "performance stability", "business impact"],
    OTHER: ["visibility", "branded CPC efficiency", "safe measurement"],
  };
  const scenarioPriority: Record<ProspectIntelligence["serpScenario"], string> = {
    SOLO: "identify solo periods without claiming waste",
    CONTESTED: "defend efficiently without defaulting to highest CPC",
    MIXED: "treat different branded auctions differently",
    UNKNOWN: "understand how competition changes before making claims",
  };
  return unique([scenarioPriority[scenario], ...personaPriorities[persona]]).slice(0, 5);
}

function angleFor(scenario: ProspectIntelligence["serpScenario"], persona: ProspectIntelligence["persona"]) {
  if (scenario === "SOLO") return "Measure solo branded-search periods before changing bids.";
  if (scenario === "CONTESTED") return "Find the minimum defensive CPC needed when competitors appear.";
  if (scenario === "MIXED") return "Adjust branded bids by auction condition instead of using one static rule.";
  if (persona === "GROWTH") return "Create visibility into branded CPC efficiency before assuming incrementality.";
  return "Understand minute-by-minute branded-search competition before changing coverage.";
}

function recommendedProof(records: SequenceKnowledgeRecord[]) {
  return records.find((record) => record.type === "CASE_STUDY")?.approvedText;
}

export function buildProspectIntelligence(
  input: BuildSequenceInput,
  records: SequenceKnowledgeRecord[] = [],
): ProspectIntelligence {
  const persona = inferPersona(input);
  const serpEvidence = parseSerpEvidence(input);
  const serpScenario = classifySerpScenario(serpEvidence);
  const contextFacts = sentenceFragments(input.prospectContext, 5);
  const companyFacts = unique(
    [
      compact(input.companyContext),
      compact(input.industry),
      compact(input.geographyOrMarkets),
      compact(input.paidSearchContext),
    ].filter((value): value is string => Boolean(value)),
  );

  return {
    prospectName: inferProspectName(input),
    companyName: compact(input.companyName),
    jobTitle: compact(input.contactRole),
    seniority: inferSeniority(input),
    persona,
    relevantFacts: contextFacts,
    companyContext: companyFacts,
    likelyPriorities: prioritiesFor(persona, serpScenario),
    serpScenario,
    serpEvidence,
    primaryAngle: angleFor(serpScenario, persona),
    secondaryAngle:
      serpScenario === "UNKNOWN" ? "Keep the first email as a visibility question." : undefined,
    recommendedProofPoint: recommendedProof(records),
    confidence: {
      prospect: contextFacts.length >= 2 || input.contactRole ? "MEDIUM" : "LOW",
      serp: serpEvidence.soloKeywords.length + serpEvidence.contestedKeywords.length >= 2
        ? "HIGH"
        : serpScenario === "UNKNOWN"
          ? "LOW"
          : "MEDIUM",
    },
  };
}
