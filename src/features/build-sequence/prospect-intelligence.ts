import type {
  BuildSequenceInput,
  ProspectIntelligence,
  SelectedProspectInsight,
  SequenceKeywordEvidence,
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

function normalize(value?: string) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripSourceLabel(value: string) {
  return value
    .replace(/^\s*(?:about|linkedin|notes?|prospect|company|serp|role|title|context|keywords?|important)\s*:\s*/i, "")
    .trim();
}

function isRoleOrSeniorityFragment(value?: string) {
  const normalized = normalize(value);
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

function sentenceFragments(value?: string, max = 4) {
  return unique(lines(value).flatMap((line) => line.split(/(?<=[.!?])\s+/).map(stripSourceLabel))).slice(0, max);
}

function isLinkedInUiLabel(value: string) {
  return /^(about|activity|experience|education|licenses|certifications|skills|interests|posts|comments|reactions|show all|contact info|followers|connections|message|follow|connect|more)$/i.test(
    value.trim(),
  );
}

function isTenureMetadata(value: string) {
  const text = value.trim();
  return (
    /^(full-time|part-time|contract|self-employed|freelance|internship)\b/i.test(text) ||
    /^\d+\s*(?:yrs?|years?|mos?|months?)\b/i.test(text) ||
    /^[a-z -]+ · \d+\s*(?:yrs?|years?|mos?|months?)/i.test(text) ||
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{4}\s*[-–]\s*(present|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{4})\s*·\s*\d+\s*(?:yrs?|years?|mos?|months?)/i.test(text)
  );
}

function isLikelyRoleLine(value: string) {
  const text = value.trim();
  if (!text || text.length > 90) return false;
  if (isLinkedInUiLabel(text) || isTenureMetadata(text)) return false;
  if (/[.!?]/.test(text)) return false;
  return /\b(?:ppc|paid search|sem|performance|growth|marketing|media|acquisition|demand|ecommerce|e-commerce|digital)\b/i.test(text) &&
    /\b(?:lead|manager|director|head|vp|vice president|specialist|strategist|analyst|team lead|consultant)\b/i.test(text);
}

function isLikelyPersonNameLine(value: string) {
  const text = value.trim();
  if (!text || text.length > 80) return false;
  if (isLinkedInUiLabel(text) || isTenureMetadata(text)) return false;
  if (isRoleOrSeniorityFragment(text)) return false;
  if (isLikelyRoleLine(text)) return false;
  if (/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z]{2,})+(?:\/)?\.?$/i.test(text)) return false;
  return /^[A-Z][a-z' -]{1,30}(?:\s+[A-Z][a-z' -]{1,40}){0,3}$/.test(text);
}

function isUsableProspectFact(fact: string) {
  const normalized = fact.trim().toLowerCase();
  if (!normalized) return false;
  if (isRoleOrSeniorityFragment(fact)) return false;
  if (/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z]{2,})+(?:\/)?\.?$/.test(normalized)) {
    return false;
  }
  if (isLinkedInUiLabel(fact) || isTenureMetadata(fact)) {
    return false;
  }
  if (isLikelyPersonNameLine(fact)) {
    return false;
  }
  if (isLikelyRoleLine(fact)) {
    return false;
  }
  if (
    /^[A-Z][A-Za-z0-9&'. -]{2,80}$/.test(fact.trim()) &&
    !/[0-9$]|\b(?:has|managed|build|built|led|owns|runs|responsible|focused|reviewing|expanded|testing|joined|promoted|posted|post|documents|documenting|improving|measurement|teams?)\b/i.test(fact)
  ) {
    return false;
  }
  return true;
}

function prospectFacts(value?: string, max = 5) {
  return sentenceFragments(value, max).filter(isUsableProspectFact).slice(0, max);
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(5, value));
}

function isLikelyRawHeadline(fact: string) {
  const text = fact.trim();
  if (!text.includes("|") && !/[·•]/.test(text)) return false;
  if (!/\b(?:google ads|microsoft ads|paid search|ppc|sem|performance|growth|marketing|programmatic|display)\b/i.test(text)) {
    return false;
  }
  return !/\b(?:manag(?:e|es|ing)|responsible|owns|leads|optimis(?:e|es|ing|ation)|optimiz(?:e|es|ing|ation)|reporting|strategy|across)\b/i.test(text);
}

function isLowValuePersonalHistory(fact: string) {
  return /\b(?:wanted to be|doctor|chemistry|forensic|diploma|degree|qualification|moved to|london at|anchoring)\b/i.test(
    fact,
  );
}

function rankCommercialFact(fact: string, input: BuildSequenceInput, index: number) {
  const normalized = normalize(fact);
  const responsibilityPatterns = [
    /\bmanag(?:e|es|ing|ed)\b/i,
    /\bresponsible\b/i,
    /\bowns?\b/i,
    /\bleads?\b/i,
    /\bhands-on\b/i,
    /\bexpanded\b/i,
    /\btesting\b/i,
    /\breviewing\b/i,
    /\bruns?\b/i,
    /\boptimis(?:e|es|ing|ation)\b/i,
    /\boptimiz(?:e|es|ing|ation)\b/i,
    /\breporting\b/i,
    /\bstrategy\b/i,
  ];
  const signalPatterns = [
    /\bpaid[- ]search\b/i,
    /\bbranded search\b/i,
    /\bgoogle ads\b/i,
    /\bmicrosoft ads\b/i,
    /\bsa360\b/i,
    /\bbing\b/i,
    /\bserp\b/i,
    /\bcpc\b/i,
    /\bbid(?:s|ding)?\b/i,
    /\bperformance reporting\b/i,
    /\bprogrammatic\b/i,
    /\bdisplay\b/i,
    /\byoutube\b/i,
  ];
  const businessQuestionPatterns = [
    /\bacross\b/i,
    /\bcampaign/i,
    /\bmarket/i,
    /\befficien/i,
    /\bautomation\b/i,
    /\bai\b/i,
    /\bbudget\b/i,
    /\bscale\b/i,
    /\bexpan/i,
    /\breporting\b/i,
  ];
  const seniorityPatterns = [/\bhead\b/i, /\bdirector\b/i, /\blead\b/i, /\bmanager\b/i, /\bcoordinator\b/i, /\bvp\b/i];
  const genericPatterns = [
    /^performance marketer\b/i,
    /^head of\b/i,
    /^senior\b/i,
    /^paid[- ]search\b/i,
    /^ppc\b/i,
    /\bpassionate about\b/i,
    /\bcareer in public\b/i,
    /\bdocumenting\b/i,
  ];
  const metadataPatterns = [/^about\b/i, /^experience\b/i, /^education\b/i, /^skills\b/i, /^full-time\b/i];

  let relevanceToSignal = includesAny(fact, signalPatterns) ? 4 : 1;
  let specificity = /\b(?:google ads|microsoft ads|sa360|youtube|programmatic|\$|\d|markets?|countries|competitor|serp|cpc)\b/i.test(fact)
    ? 4
    : fact.split(/\s+/).length >= 7
      ? 3
      : 1;
  let commercialUsefulness = includesAny(fact, responsibilityPatterns) ? 4 : 1;
  let conversationalUsefulness = includesAny(fact, businessQuestionPatterns) ? 4 : 2;

  if (includesAny(fact, seniorityPatterns)) commercialUsefulness += 0.5;
  if (/\b(?:google ads|microsoft ads|sa360)\b/i.test(fact)) relevanceToSignal += 1;
  if (/\b(?:optimis|optimiz|reporting|strategy)\b/i.test(fact)) conversationalUsefulness += 0.5;
  if (/\bdocument(?:s|ing)?\b[^.]{0,80}\bcareer\b[^.]{0,80}\bpublic\b/i.test(fact)) {
    specificity += 1;
    commercialUsefulness += 1;
    conversationalUsefulness += 1.5;
  }
  if (normalize(input.contactRole).split(" ").some((token) => token.length > 4 && normalized.includes(token))) {
    commercialUsefulness += 0.5;
  }

  if (isLikelyRawHeadline(fact)) {
    relevanceToSignal -= 1.5;
    specificity -= 1.5;
    commercialUsefulness -= 2;
    conversationalUsefulness -= 1.5;
  }
  if (isLikelyRoleLine(fact)) {
    relevanceToSignal -= 1;
    specificity -= 2;
    commercialUsefulness -= 2;
    conversationalUsefulness -= 2;
  }
  if (includesAny(fact, genericPatterns)) {
    commercialUsefulness -= 1;
    conversationalUsefulness -= 1;
  }
  if (includesAny(fact, metadataPatterns) || isLowValuePersonalHistory(fact)) {
    relevanceToSignal -= 2;
    specificity -= 1;
    commercialUsefulness -= 2;
    conversationalUsefulness -= 2;
  }

  const scores = {
    relevanceToSignal: clampScore(relevanceToSignal),
    specificity: clampScore(specificity),
    commercialUsefulness: clampScore(commercialUsefulness),
    conversationalUsefulness: clampScore(conversationalUsefulness),
  };
  const total =
    scores.relevanceToSignal * 0.3 +
    scores.commercialUsefulness * 0.3 +
    scores.specificity * 0.2 +
    scores.conversationalUsefulness * 0.2 -
    index * 0.02;
  return { ...scores, total };
}

function reasonForSelectedInsight(fact: string) {
  const reasons = [];
  if (/\b(?:google ads|microsoft ads|sa360|bing|paid search|cpc|serp)\b/i.test(fact)) {
    reasons.push("directly relevant to paid-search decisions");
  }
  if (/\b(?:manag(?:e|es|ing|ed)|hands-on|responsible|owns?|leads?|optimis|optimiz|reporting|strategy)\b/i.test(fact)) {
    reasons.push("describes an actual responsibility");
  }
  if (/\b(?:across|markets?|countries|budget|efficien|automation|ai|programmatic|display|youtube)\b/i.test(fact)) {
    reasons.push("can support a real business question");
  }
  return reasons.length > 0 ? reasons.join("; ") : "best available role/company context without inventing personalization";
}

export function rankProspectInsights(
  facts: string[],
  input: BuildSequenceInput,
  max = 3,
): SelectedProspectInsight[] {
  return facts
    .map((fact, index) => {
      const score = rankCommercialFact(fact, input, index);
      const confidence: SelectedProspectInsight["confidence"] =
        score.total >= 3.6 ? "HIGH" : score.total >= 2 ? "MEDIUM" : "LOW";
      return {
        factId: `prospect-fact-${index + 1}`,
        groundingReference: fact,
        text: fact,
        relevanceToSignal: score.relevanceToSignal,
        specificity: score.specificity,
        commercialUsefulness: score.commercialUsefulness,
        conversationalUsefulness: score.conversationalUsefulness,
        confidence,
        reasonSelected: reasonForSelectedInsight(fact),
        total: score.total,
      };
    })
    .filter((insight) => insight.confidence !== "LOW" && !isLikelyRawHeadline(insight.text))
    .sort((a, b) => b.total - a.total)
    .slice(0, max)
    .map((insight) => ({
      factId: insight.factId,
      groundingReference: insight.groundingReference,
      text: insight.text,
      relevanceToSignal: insight.relevanceToSignal,
      specificity: insight.specificity,
      commercialUsefulness: insight.commercialUsefulness,
      conversationalUsefulness: insight.conversationalUsefulness,
      confidence: insight.confidence,
      reasonSelected: insight.reasonSelected,
    }));
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
  if (input.contactFirstName && !isRoleOrSeniorityFragment(input.contactFirstName)) return input.contactFirstName;
  const match = input.prospectContext?.match(/\b(?:name|prospect)\s*[:\-]\s*([A-Z][a-z]+)\b/);
  if (match?.[1] && !isRoleOrSeniorityFragment(match[1])) return match[1];
  const nameLine = lines(input.prospectContext).find(isLikelyPersonNameLine);
  return nameLine?.split(/\s+/)[0];
}

function inferJobTitle(input: BuildSequenceInput) {
  const suppliedRole = compact(input.contactRole);
  if (suppliedRole && suppliedRole !== "Head of Performance Marketing") {
    return suppliedRole;
  }
  return lines(input.prospectContext).find(isLikelyRoleLine) ?? suppliedRole;
}

function keywordFromLine(line: string) {
  return line
    .replace(/\s+-\s+competitors?\s*(?:visible|present|appeared)?\s*:?\s*[A-Za-z0-9&'. -]+$/i, "")
    .replace(/\s+-\s+[A-Z][A-Za-z0-9&'. -]+\s+(?:appeared|visible)$/i, "")
    .replace(/\b(brand bidding alone|brand alone|competitor visible|competitors visible|competitor appeared|alone|contested|visible|checked)\b/gi, "")
    .replace(/\s+[—-]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableKeyword(keyword: string) {
  const normalized = keyword.toLowerCase();
  if (!keyword.trim()) return false;
  if (keyword.length > 100) return false;
  if (/^(all|all keywords?|all kws?|all brand keywords?|all terms?)$/i.test(keyword)) return false;
  if (/\bkws?\b|\bbi+d+ing\b|\bbidding\b|\ball\s+(?:keywords?|kws?|terms?)\b|\bno\s+(?:verified\s+)?(?:serp|keyword|keywords?|evidence|screenshot)\b/i.test(normalized)) {
    return false;
  }
  return /[a-z0-9]/i.test(keyword);
}

function companyEvidenceTokens(input: BuildSequenceInput) {
  const companyTokens = input.companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/\s+|[.-]/)
    .filter((token) => token.length > 2);
  const domainTokens = (input.companyWebsite ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[./-]/)
    .filter((token) => token.length > 2);
  return unique([...companyTokens, ...domainTokens]).filter(
    (token) => !/^(com|net|org|inc|ltd|llc|group|global|the)$/.test(token),
  );
}

function keywordMatchesCompany(input: BuildSequenceInput, term: string) {
  const tokens = companyEvidenceTokens(input);
  if (tokens.length === 0) return true;
  const normalizedTerm = term.toLowerCase();
  return tokens.some((token) => normalizedTerm.includes(token));
}

function structuredKeywordEvidence(input: BuildSequenceInput): SequenceKeywordEvidence[] {
  const structured: SequenceKeywordEvidence[] = [];
  for (const keyword of input.keywords ?? []) {
    const term = compact(keyword.term);
    if (
      !term ||
      (keyword.status !== "solo" && keyword.status !== "contested") ||
      !isUsableKeyword(term) ||
      !keywordMatchesCompany(input, term)
    ) {
      continue;
    }
    structured.push({
      term,
      status: keyword.status,
      competitor: compact(keyword.competitor),
      note: compact(keyword.note),
    });
  }
  return structured.slice(0, 5);
}

function parseSerpEvidence(input: BuildSequenceInput) {
  const structuredKeywords = structuredKeywordEvidence(input);
  const rawLines = [
    ...lines(input.serpEvidence),
    input.brandKeyword ? `${input.brandKeyword} ${input.screenshotShows ?? ""}` : "",
    input.screenshotShows ?? "",
  ].filter((line) => Boolean(line) && !/\b(?:no|without|none|not)\s+(?:verified\s+)?(?:serp|keyword|keywords?|evidence|screenshot)\b/i.test(line));
  const soloKeywords: string[] = [];
  const contestedKeywords: string[] = [];
  const keywords: string[] = [];
  const competitors: string[] = [];
  const observations = unique(rawLines);
  const allText = rawLines.join(" ").toLowerCase();

  for (const keyword of structuredKeywords) {
    keywords.push(keyword.term);
    if (keyword.status === "solo") {
      soloKeywords.push(keyword.term);
    }
    if (keyword.status === "contested") {
      contestedKeywords.push(keyword.term);
      if (keyword.competitor) {
        competitors.push(keyword.competitor);
      }
    }
    observations.push(
      [
        keyword.term,
        keyword.status === "solo" ? "solo branded auction" : "contested branded auction",
        keyword.competitor ? `competitor: ${keyword.competitor}` : "",
        keyword.note ?? "",
      ]
        .filter(Boolean)
        .join(" - "),
    );
  }

  for (const line of rawLines) {
    if (/\b(?:no|without|none|not)\s+(?:verified\s+)?(?:serp|keyword|keywords?|evidence|screenshot)\b/i.test(line)) {
      continue;
    }
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
        competitors.push(
          ...afterCompetitor
            .split(/,| and | & /)
            .map((item) => item.replace(/\s+(?:appeared|visible)\b.*$/i, "").trim())
            .filter(Boolean),
        );
      }
      const dashCompetitor = line.match(/\s+-\s+competitor\s+([A-Z][A-Za-z0-9&'. -]+?)(?:\s+(?:appeared|visible))?$/i)?.[1];
      if (dashCompetitor) {
        competitors.push(dashCompetitor.trim());
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
    structuredKeywords,
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
  const contextFacts = prospectFacts(input.prospectContext, 8);
  const selectedInsights = rankProspectInsights(contextFacts, input);
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
    jobTitle: inferJobTitle(input),
    seniority: inferSeniority(input),
    persona,
    relevantFacts: contextFacts,
    selectedInsights,
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
