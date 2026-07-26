import type {
  NormalizedConversationTurn,
  ProspectIntent,
  ReplyIntentAnalysis,
  ReplyToProspectInput,
} from "./types";

const sellerSignals =
  /\b(hi|hey|thanks for connecting|as promised|see attached|our pricing|we charge|we built|signal|primelis|happy to|would love to hear|talk soon|worth a quick|worth 10 minutes)\b/i;
const prospectSignals =
  /\b(i see|thanks|what|how|do you|can you|we already|not interested|no thanks|happy with|out of office|vacation|wrong person|speak with|contact|fee|commercials|pricing|deck)\b/i;

function clean(value: string) {
  return value.replace(/\r/g, "").trim();
}

function splitBlocks(message: string) {
  return clean(message)
    .split(/\n{2,}|\n(?=(?:Hi|Hey|Thanks|I see|What|How|Do you|We already|Not interested)\b)/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function inferRole(
  block: string,
  index: number,
  total: number,
): NormalizedConversationTurn["role"] {
  const lower = block.toLowerCase();
  if (/^(prospect|buyer|client|lead)\s*:/i.test(block)) {
    return "PROSPECT";
  }
  if (/^(seller|sales|me|gil|primelis)\s*:/i.test(block)) {
    return "SELLER";
  }
  if (total === 1) {
    return "PROSPECT";
  }
  if (index === total - 1 && prospectSignals.test(lower) && !sellerSignals.test(lower)) {
    return "PROSPECT";
  }
  if (sellerSignals.test(lower) && !/^(what|how|do you|i see|thanks|we already)\b/i.test(block)) {
    return "SELLER";
  }
  if (prospectSignals.test(lower)) {
    return "PROSPECT";
  }
  return index === total - 1 ? "PROSPECT" : "UNKNOWN";
}

export function normalizeReplyConversation(message: string): NormalizedConversationTurn[] {
  const blocks = splitBlocks(message);
  const turns = blocks.map((block, index) => ({
    role: inferRole(block, index, blocks.length),
    text: block.replace(/^(prospect|buyer|client|lead|seller|sales|me|gil|primelis)\s*:\s*/i, ""),
    index,
    isLatest: index === blocks.length - 1,
  }));
  let latestProspectIndex = -1;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].role === "PROSPECT") {
      latestProspectIndex = index;
      break;
    }
  }
  return turns.map((turn, index) => ({ ...turn, isLatest: index === latestProspectIndex }));
}

export function latestProspectMessage(message: string) {
  const turns = normalizeReplyConversation(message);
  return turns.find((turn) => turn.isLatest)?.text ?? clean(message);
}

function directQuestionFrom(text: string) {
  const questions = text
    .split(/(?<=[?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => /\?$/.test(part));
  return questions.at(-1);
}

function addIntent(intents: Set<ProspectIntent>, intent: ProspectIntent) {
  intents.add(intent);
}

function primaryFrom(intents: Set<ProspectIntent>, latest: string): ProspectIntent {
  const priority: ProspectIntent[] = [
    "STRONG_REJECTION",
    "POLITE_DECLINE",
    "VACATION_OR_UNAVAILABLE",
    "WRONG_CONTACT",
    "REFERRAL",
    "REQUESTS_FEE_STRUCTURE",
    "REQUESTS_PRICING",
    "REQUESTS_ROI_OR_VALUE",
    "DATA_SOURCE_QUESTION",
    "EXISTING_DASHBOARD",
    "MONITORING_VERSUS_ACTION",
    "DOES_NOT_WANT_TO_PAUSE",
    "AGENCY_HANDLES_IT",
    "EXISTING_INTERNAL_TOOL",
    "USES_ANOTHER_VENDOR",
    "DECK_REQUEST",
    "REQUESTS_MORE_INFORMATION",
    "TECHNICAL_QUESTION",
    "NOT_A_PRIORITY",
    "TIMING",
    "INTERESTED_WITH_QUESTION",
    "INTERESTED",
  ];
  const found = priority.find((intent) => intents.has(intent));
  if (found) {
    return found;
  }
  return /\?/.test(latest) ? "INTERESTED_WITH_QUESTION" : "UNCLEAR_REQUEST";
}

export function classifyReplyIntent(input: ReplyToProspectInput): ReplyIntentAnalysis {
  const turns = normalizeReplyConversation(input.prospectMessage);
  const latest = turns.find((turn) => turn.isLatest)?.text ?? clean(input.prospectMessage);
  const latestLower = latest.toLowerCase();
  const fullLower = input.prospectMessage.toLowerCase();
  const intents = new Set<ProspectIntent>();
  const sensitivePointsToAvoid = new Set<string>();

  if (/\b(fuck|stop emailing|never contact|remove me|unsubscribe)\b/i.test(latest)) {
    addIntent(intents, "STRONG_REJECTION");
  }
  if (/\b(no thanks|not interested|we'?re good|all set|not relevant)\b/i.test(latest)) {
    addIntent(intents, "POLITE_DECLINE");
    addIntent(intents, "NOT_INTERESTED");
  }
  if (/\b(not a priority|too busy|no bandwidth|not right now)\b/i.test(latest)) {
    addIntent(intents, "NOT_A_PRIORITY");
    addIntent(intents, "TIMING");
  }
  if (/\b(vacation|ooo|out of office|away|back on|returning)\b/i.test(latest)) {
    addIntent(intents, "VACATION_OR_UNAVAILABLE");
    addIntent(intents, "TIMING");
  }
  if (/\b(wrong person|not the right person|not my area|not responsible)\b/i.test(latest)) {
    addIntent(intents, "WRONG_CONTACT");
  }
  if (/\b(speak with|talk to|contact|reach out to|loop in|introduce you to)\b/i.test(latest)) {
    addIntent(intents, "REFERRAL");
  }
  if (
    /\b(deck|slides|overview|one pager|send (?:over )?(?:it|the deck|slides|overview))\b/i.test(
      latest,
    )
  ) {
    addIntent(intents, "DECK_REQUEST");
    addIntent(intents, "REQUESTS_MORE_INFORMATION");
  }
  if (/\b(more info|more information|send info|send details|learn more)\b/i.test(latest)) {
    addIntent(intents, "REQUESTS_MORE_INFORMATION");
  }
  if (/\b(price|pricing|cost|costs|budget)\b/i.test(latest)) {
    addIntent(intents, "REQUESTS_PRICING");
    addIntent(intents, "OBJECTION");
  }
  if (/\b(fee structure|commercials|commercial model|commercial terms|fee|fees)\b/i.test(latest)) {
    addIntent(intents, "REQUESTS_FEE_STRUCTURE");
  }
  if (/\b(roi|value|savings|save|payback|business case|mql|sql|pipeline|revenue)\b/i.test(latest)) {
    addIntent(intents, "REQUESTS_ROI_OR_VALUE");
  }
  if (
    /\b(data source|data sources|what data|which data|where.*data|google ads|search console|ga4|bing|serp|scrape|crawl)\b/i.test(
      latest,
    )
  ) {
    addIntent(intents, "DATA_SOURCE_QUESTION");
    addIntent(intents, "TECHNICAL_QUESTION");
  }
  if (/\b(dashboard|reporting|monitor|monitoring|visibility|auction insights)\b/i.test(latest)) {
    addIntent(intents, "EXISTING_DASHBOARD");
    addIntent(intents, "MONITORING_VERSUS_ACTION");
  }
  if (/\b(internal tool|in-house|built internally|our own tool|homegrown)\b/i.test(latest)) {
    addIntent(intents, "EXISTING_INTERNAL_TOOL");
  }
  if (/\b(agency|media agency|performance agency|ppc agency)\b/i.test(latest)) {
    addIntent(intents, "AGENCY_HANDLES_IT");
  }
  if (
    /\b(adthena|revvim|vendor|provider|platform|already use|current tool|another tool)\b/i.test(
      latest,
    )
  ) {
    addIntent(intents, "USES_ANOTHER_VENDOR");
    addIntent(intents, "EXISTING_VENDOR");
  }
  if (
    /\b(do not want to pause|don'?t want to pause|never pause|keep brand ads live|pause branded ads)\b/i.test(
      latest,
    )
  ) {
    addIntent(intents, "DOES_NOT_WANT_TO_PAUSE");
  }
  if (
    /\b(api|technical|integrat|implementation|setup|how does|methodology|measure|measurement|incremental|organic|paid search|brand search|branded ads|how do you handle)\b/i.test(
      latest,
    )
  ) {
    addIntent(intents, "TECHNICAL_QUESTION");
    addIntent(intents, "METHODOLOGY_QUESTION");
  }
  if (
    /\b(sounds interesting|interesting|open to|happy to|worth a look|tell me more)\b/i.test(latest)
  ) {
    addIntent(intents, /\?/.test(latest) ? "INTERESTED_WITH_QUESTION" : "INTERESTED");
  }
  if (/\b(later|next quarter|next month|timing|now|when|timeline)\b/i.test(latest)) {
    addIntent(intents, "TIMING");
  }

  if (intents.size > 1 && /\?/.test(latest)) {
    addIntent(intents, "MIXED_INTENT");
  }
  if (/\b(attached|see attached|deck)\b/i.test(fullLower)) {
    sensitivePointsToAvoid.add(
      "Do not claim a new deck or attachment was sent unless the user explicitly says to send one.",
    );
  }
  if (
    /\b(flat monthly fee|fee structure|commercials|pricing|second to last slide)\b/i.test(fullLower)
  ) {
    sensitivePointsToAvoid.add(
      "Do not repeat the full commercial explanation if it was already answered.",
    );
  }
  if (/\b(crocs|chlo[eé]|dior|sandro|bluevine|zoominfo|appsflyer|apollo)\b/i.test(fullLower)) {
    sensitivePointsToAvoid.add(
      "Do not repeat proof already shared unless the latest question asks for it.",
    );
  }

  const primaryIntent = primaryFrom(intents, latestLower);
  const secondaryIntents = Array.from(intents).filter((intent) => intent !== primaryIntent);
  return {
    primaryIntent,
    secondaryIntents,
    confidence: intents.size > 0 ? "HIGH" : "LOW",
    directQuestion: directQuestionFrom(latest),
    requestedNextStep: /\b(call|meeting|demo|walkthrough|review)\b/i.test(latest)
      ? "Respond to meeting or walkthrough interest."
      : undefined,
    sensitivePointsToAvoid: Array.from(sensitivePointsToAvoid),
    latestProspectMessage: latest,
    priorProspectMessages: turns
      .filter((turn) => turn.role === "PROSPECT" && !turn.isLatest)
      .map((turn) => turn.text),
    priorSellerMessages: turns.filter((turn) => turn.role === "SELLER").map((turn) => turn.text),
  };
}

export function responsePolicyForIntent(analysis: ReplyIntentAnalysis) {
  const base = [
    "Answer the latest prospect message first.",
    "Do not restart the full outbound pitch.",
    "Use one clear next step at most.",
  ];
  const policies: Record<ProspectIntent, string[]> = {
    INTERESTED: ["Acknowledge interest briefly and propose one practical next step."],
    INTERESTED_WITH_QUESTION: ["Answer the question first, then add only necessary context."],
    REQUESTS_MORE_INFORMATION: [
      "Summarize Signal in one concise paragraph without inventing attachments.",
    ],
    DECK_REQUEST: ["Offer to share a concise deck or overview, but do not claim it is attached."],
    REQUESTS_PRICING: [
      "Explain that commercials depend on branded-search scope and active markets unless approved exact pricing is provided.",
    ],
    REQUESTS_FEE_STRUCTURE: [
      "Answer the fee-structure basis directly without inventing tiers, discounts, or minimums.",
    ],
    REQUESTS_ROI_OR_VALUE: [
      "Use approved proof only if it directly supports the value answer; never guarantee savings.",
    ],
    DATA_SOURCE_QUESTION: [
      "Explain live Google and Bing SERP monitoring plus approved Ads/Search Console/conversion context only.",
    ],
    MONITORING_VERSUS_ACTION: [
      "Separate visibility from action: Signal can adjust bids or pause/restore coverage where configured.",
    ],
    EXISTING_DASHBOARD: [
      "Acknowledge dashboards as useful visibility, then explain action versus reporting.",
    ],
    EXISTING_INTERNAL_TOOL: ["Ask what their tool automates before comparing capabilities."],
    AGENCY_HANDLES_IT: [
      "Position Signal as a layer an agency or internal team can use; do not criticize the agency.",
    ],
    USES_ANOTHER_VENDOR: ["Do not attack the vendor; ask what the current setup automates."],
    DOES_NOT_WANT_TO_PAUSE: [
      "Clarify that lower-bid mode is an alternative and pausing is not the only approach.",
    ],
    NOT_INTERESTED: ["Respect the decline and avoid objection fighting."],
    NOT_A_PRIORITY: ["Respect the timing and avoid false urgency."],
    TIMING: ["Respect timing and offer a light follow-up only if natural."],
    VACATION_OR_UNAVAILABLE: ["Acknowledge briefly and respect the return timing."],
    REFERRAL: ["Thank them and preserve the referred role or name without inventing details."],
    WRONG_CONTACT: ["Acknowledge and ask for the right owner only if appropriate."],
    POLITE_DECLINE: ["Respect the decline; leave the door open briefly only if natural."],
    STRONG_REJECTION: ["Do not keep selling; keep the response minimal."],
    EXISTING_VENDOR: [
      "Do not attack the vendor; focus on action decisions from live SERP conditions.",
    ],
    TECHNICAL_QUESTION: ["Answer the technical point before suggesting a call."],
    OBJECTION: ["Answer the concern directly without a long objection framework."],
    METHODOLOGY_QUESTION: [
      "Explain the methodology in plain language before suggesting a next step.",
    ],
    UNCLEAR_REQUEST: ["Acknowledge the likely intent and ask one concise clarification if needed."],
    MIXED_INTENT: ["Prioritize the direct question, then handle the secondary intent briefly."],
  };
  return [...base, ...(policies[analysis.primaryIntent] ?? [])];
}

function repeatedParagraphs(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 20);
  return new Set(paragraphs).size !== paragraphs.length;
}

export function validateReplyOutput(
  result: { recommendedReply: string; shorterAlternative: string },
  analysis: ReplyIntentAnalysis,
) {
  const publicOutput = `${result.recommendedReply}\n${result.shorterAlternative}`;
  if (result.recommendedReply.trim().length < 10 || result.shorterAlternative.trim().length < 10) {
    return { ok: false, reason: "Reply is empty or too short." };
  }
  if (
    /\b(primaryIntent|secondaryIntents|directQuestion|approvedKnowledge|approvedFacts|CONVERSATION_HISTORY|USER_PROVIDED_CONTEXT|outputContract)\b/.test(
      publicOutput,
    )
  ) {
    return { ok: false, reason: "Internal labels leaked into the reply." };
  }
  if (/[{[]\s*"(recommendedReply|primaryContent|detectedIntent)"/i.test(publicOutput)) {
    return { ok: false, reason: "Raw JSON leaked into the reply." };
  }
  if (
    /\b(attached|enclosed|calendar link|meeting is booked|we are scheduled|as agreed for our meeting)\b/i.test(
      publicOutput,
    )
  ) {
    return {
      ok: false,
      reason: "Reply invented an attachment, calendar link, or meeting commitment.",
    };
  }
  if (/\$\s?\d|\b\d+k\/month\b|\b\d+\s?(?:usd|dollars)\b/i.test(publicOutput)) {
    return { ok: false, reason: "Reply introduced unsupported pricing figures." };
  }
  if (
    repeatedParagraphs(result.recommendedReply) ||
    repeatedParagraphs(result.shorterAlternative)
  ) {
    return { ok: false, reason: "Reply contains duplicated paragraphs." };
  }
  if (
    analysis.directQuestion &&
    /(?:price|pricing|fee|commercial)/i.test(analysis.directQuestion) &&
    !/\b(depends|based on|scope|spend|markets|commercial|fee)\b/i.test(result.recommendedReply)
  ) {
    return { ok: false, reason: "Pricing or fee question was not answered directly." };
  }
  if (
    analysis.directQuestion &&
    /(?:data|source|google ads|search console|bing|serp)/i.test(analysis.directQuestion) &&
    !/\b(Google|Bing|SERP|search results|Ads|Search Console|conversion)\b/i.test(
      result.recommendedReply,
    )
  ) {
    return { ok: false, reason: "Data-source question was not answered directly." };
  }
  return { ok: true };
}
