type BuyerTone = "DIRECT" | "CONSULTATIVE" | "WARM" | "EXECUTIVE";

export type WinningMessageContext = {
  companyName: string;
  contactFirstName?: string;
  contactRole?: string;
  industry?: string;
  companyContext?: string;
  geographyOrMarkets?: string;
  paidSearchContext?: string;
  currentVendor?: string;
  observedTrigger?: string;
  desiredTone?: BuyerTone;
};

export type WinningPattern = {
  id: string;
  source: string;
  angle: string;
  subject: string;
  body: string;
  cta: string;
  reason: string;
};

const knownBrands: Record<string, string> = {
  adidas: "Adidas",
  apollo: "Apollo",
  databricks: "Databricks",
  dynatrace: "Dynatrace",
  nike: "Nike",
  semrush: "Semrush",
  stripe: "Stripe",
};

export function displayCompanyName(companyName: string) {
  const cleaned = companyName.trim();
  if (!cleaned) {
    return "this account";
  }
  const normalized = cleaned.toLowerCase();
  if (knownBrands[normalized]) {
    return knownBrands[normalized];
  }
  if (cleaned === normalized) {
    return cleaned.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }
  return cleaned;
}

function greeting(context: WinningMessageContext) {
  return context.contactFirstName ? `Hi ${context.contactFirstName},` : "Hi there,";
}

function combinedContext(context: WinningMessageContext) {
  return [
    context.contactRole,
    context.industry,
    context.companyContext,
    context.geographyOrMarkets,
    context.paidSearchContext,
    context.currentVendor,
    context.observedTrigger,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function industryVoice(context: WinningMessageContext) {
  const text = combinedContext(context);
  const company = displayCompanyName(context.companyName);
  if (/saas|software|technology|b2b|appsflyer|apollo|zoominfo|databricks|dynatrace/i.test(text)) {
    return {
      segment: "SaaS and B2B technology",
      pain:
        "Brand search can look efficient in reports, but the real question is whether those clicks are adding pipeline or just making CAC look cleaner than it is.",
      proof:
        "For software teams, I would frame this around pipeline efficiency and paid-brand visibility rather than generic cost cutting.",
      cta: "Is this already part of your paid-brand or demand-gen review?",
    };
  }
  if (/fashion|luxury|retail|e-commerce|ecommerce|consumer|apparel|nike|adidas|crocs|dior|sandro|chloe/i.test(text)) {
    return {
      segment: "Retail, fashion, and consumer",
      pain:
        "brand-search can look healthy in reports while still hiding unnecessary spend.",
      proof:
        "The practical check is whether organic would have captured the demand anyway when nobody else is bidding.",
      cta: `Curious how you currently evaluate this at ${company}?`,
    };
  }
  if (/finance|financial|insurance|bank|regulated/i.test(text)) {
    return {
      segment: "Financial services",
      pain:
        "visibility and control matter more than a generic cost-cutting angle: where paid brand is still needed, and where the team may be paying for demand it already owns.",
      proof:
        "I would keep the wording cautious and evidence-led: identify the decision, then adjust only when the signal is clear.",
      cta: "Do you already have visibility into that decision?",
    };
  }
  if (/travel|airline|mobility|multi-market|regional|global|country-by-country|market-by-market/i.test(text)) {
    return {
      segment: "Travel or multi-market",
      pain:
        "brand-search conditions can change by market, so one coverage rule rarely fits every geography.",
      proof:
        "The useful check is where paid coverage is protecting demand in a competitive market, and where it can safely come down.",
      cta: "Do you already monitor this market by market?",
    };
  }
  return {
    segment: "General brand-search",
    pain:
      "Branded search can look efficient while still hiding unnecessary spend.",
    proof:
      "The practical check is where paid coverage is protecting demand, and where organic already does enough.",
    cta: "How do you currently catch this?",
  };
}

export function buyerVoice(context: WinningMessageContext) {
  const role = (context.contactRole ?? "").toLowerCase();
  if (/paid search|sem|paid media|ppc/.test(role)) {
    return {
      label: "Paid search operator",
      line:
        "For a paid-search team, the decision is practical: keep coverage when it protects demand, lower bids when CPC is being pushed up, and avoid paying when organic would have captured the click.",
    };
  }
  if (/growth|acquisition|demand/.test(role)) {
    return {
      label: "Growth or acquisition",
      line:
        "For a growth team, the question is whether paid brand is improving acquisition efficiency or just shifting demand that would have arrived anyway.",
    };
  }
  if (/cmo|chief|vp|head|director|performance|digital|ecommerce|e-commerce/.test(role)) {
    return {
      label: "Marketing leader",
      line:
        "For a marketing leader, this is less about a bid tweak and more about visibility: knowing when brand spend is useful and when it can be reduced without losing demand.",
    };
  }
  return {
    label: "Marketing stakeholder",
    line:
      "The question is not whether branded search is good or bad. It is where paid coverage is still changing the outcome.",
  };
}

export function ctaBank(context: WinningMessageContext) {
  const voice = industryVoice(context);
  const base = [
    voice.cta,
    "Do you already have a way to detect this?",
    "Is this already part of your paid-brand review?",
    "Do you have visibility into when this happens?",
    "How do you currently catch this?",
    "Is this something your team checks regularly?",
  ];
  if (context.desiredTone === "EXECUTIVE") {
    return [
      "Is reducing unnecessary paid-brand spend on the radar this quarter?",
      "Is this a visibility gap your team already tracks?",
      ...base,
    ];
  }
  if (context.desiredTone === "WARM") {
    return [
      "Is this something your team looks at today?",
      "Would this be useful to sanity-check?",
      ...base,
    ];
  }
  return Array.from(new Set(base));
}

function subjectFor(context: WinningMessageContext, id: string) {
  const company = displayCompanyName(context.companyName);
  const subjects: Record<string, string> = {
    firstTouch: `${company} paid brand question`,
    googleGap: "Re: deactivating branded ads",
    method: `Re: brand search at ${company}`,
    lowerCpc: "Re: lower branded CPC",
    proof: "A practical paid-brand example",
    close: "Closing the loop",
  };
  return subjects[id] ?? `${company} brand-search question`;
}

export function winningPatternForPurpose(
  context: WinningMessageContext,
  purpose:
    | "FIRST_TOUCH_RELEVANCE"
    | "PROBLEM_FRAMING"
    | "METHODOLOGY_DIFFERENTIATION"
    | "ACCOUNT_SPECIFIC_OBSERVATION"
    | "SOCIAL_PROOF"
    | "TECHNICAL_CLARIFICATION"
    | "LOW_PRESSURE_FOLLOW_UP"
    | "BREAKUP_CLOSE_LOOP",
  ctaIndex = 0,
): WinningPattern {
  const company = displayCompanyName(context.companyName);
  const hello = greeting(context);
  const industry = industryVoice(context);
  const buyer = buyerVoice(context);
  const cta = ctaBank(context)[ctaIndex % ctaBank(context).length];

  if (purpose === "PROBLEM_FRAMING") {
    return {
      id: "googleGap",
      source: "Winning messages: Email 2A - Google cannot automate this",
      angle: "Google cannot automate pause/down-bid decisions",
      subject: subjectFor(context, "googleGap"),
      body: [
        hello,
        "",
        "For context, Google does not offer an easy way to automatically pause or adjust branded ads when no other advertisers are bidding.",
        "",
        "As a result, many teams keep paying for clicks that could have been captured organically or at a much lower CPC.",
        "",
        `That is the gap I would check at ${company}: can you see when this happens, and act on it without a manual review?`,
      ].join("\n"),
      cta,
      reason:
        "Adds new context after the opener and uses a reply-backed explanation from the uploaded email data.",
    };
  }

  if (purpose === "METHODOLOGY_DIFFERENTIATION" || purpose === "TECHNICAL_CLARIFICATION") {
    return {
      id: "method",
      source: "Winning messages: Email 3A - detect and manage this",
      angle: "Decision methodology without internal jargon",
      subject: subjectFor(context, "method"),
      body: [
        hello,
        "",
        "A useful way to look at this is not paid and organic in theory, but what is happening on the search page at the moment of the search.",
        "",
        "If other advertisers are present, paid coverage may be protecting demand. If they are absent, the next move may be lowering bids or pausing until the page changes again.",
        "",
        "Signal is built to make that decision easier without turning it into a manual check every time.",
      ].join("\n"),
      cta,
      reason:
        "Uses method language from working follow-ups and keeps it plain enough for non-technical buyers.",
    };
  }

  if (purpose === "SOCIAL_PROOF") {
    return {
      id: "proof",
      source: "Winning messages: proof/method step",
      angle: "Careful proof without unsupported savings claims",
      subject: subjectFor(context, "proof"),
      body: [
        hello,
        "",
        "One reason this tends to land is that it is not a generic cost-cutting conversation.",
        "",
        industry.proof,
        "",
        "The useful takeaway is simple: keep paid brand where it protects demand, and avoid paying where organic is already doing the work.",
      ].join("\n"),
      cta,
      reason:
        "Uses case-study style framing safely without inventing a customer claim.",
    };
  }

  if (purpose === "LOW_PRESSURE_FOLLOW_UP" || purpose === "BREAKUP_CLOSE_LOOP") {
    return {
      id: "close",
      source: "Winning messages: close-loop replies",
      angle: "Low-pressure close",
      subject: subjectFor(context, "close"),
      body: [
        hello,
        "",
        "I will close the loop after this note.",
        "",
        "If paid-brand efficiency becomes a priority later, the useful starting point is straightforward: where is paid coverage protecting demand, and where is it only adding cost?",
        "",
        "If this is not relevant right now, no problem at all.",
      ].join("\n"),
      cta: "If this is not relevant, I can close the loop here.",
      reason:
        "Late-step emails generated replies, so the close stays specific instead of sounding like a throwaway.",
    };
  }

  if (purpose === "ACCOUNT_SPECIFIC_OBSERVATION") {
    return {
      id: "accountCheck",
      source: "Winning messages: account-specific narrow reason",
      angle: `${industry.segment} relevance`,
      subject: `${company}: one brand-search check`,
      body: [
        hello,
        "",
        `I would keep the ${company} angle narrow: not a claim that there is waste, just a reason to check whether paid brand is still doing work organic cannot do.`,
        "",
        buyer.line,
      ].join("\n"),
      cta,
      reason:
        "Uses selected company and persona as reasoning without exposing ICP/category labels.",
    };
  }

  return {
    id: "firstTouch",
    source: "Winning messages: Email first touch and LinkedIn first touch",
    angle: `${industry.segment} first-touch question`,
    subject: subjectFor(context, "firstTouch"),
    body: [
      hello,
      "",
      `When someone searches ${company} by name, how do you decide when branded ads are still changing the outcome?`,
      "",
      "That is where brand-search gets tricky: the campaign can look efficient while still hiding unnecessary spend on demand the organic result may have captured anyway.",
      "",
      buyer.line.replace(/^For a .*?,\s*/i, "").replace(/^this/i, "This"),
      "",
      "Signal gives the team a live view of that decision, so coverage stays on when it protects demand and comes down when it does not.",
    ].join("\n"),
    cta,
    reason:
      "Starts from the strongest reply-backed first-touch pattern, then adapts the pain by industry and buyer role.",
  };
}

export function linkedinPattern(context: WinningMessageContext) {
  const company = displayCompanyName(context.companyName);
  const cta = "Do you already have a way to catch that?";
  if (/comment|post|linkedin/i.test(context.observedTrigger ?? "")) {
    return `Hi ${context.contactFirstName || "there"}, quick thought from your post: branded search often looks efficient even when organic would have won the click. Signal helps teams see when coverage is actually needed, and when bids can come down. ${cta}`;
  }
  return `${context.contactFirstName ? `${context.contactFirstName}, ` : ""}quick question on ${company} brand search: how do you decide when paid coverage is still needed versus when organic already does enough?`;
}

export function compactEmail(pattern: WinningPattern, context: WinningMessageContext) {
  const hello = greeting(context);
  const company = displayCompanyName(context.companyName);
  const industry = industryVoice(context);
  return [
    hello,
    "",
    `When someone searches ${company} by name, how do you decide when branded ads are still changing the outcome?`,
    "",
    `Signal shows when paid brand is protecting demand and when organic likely would have captured the click anyway, so unnecessary spend can come down without losing coverage when the page changes.`,
    "",
    pattern.cta || industry.cta,
  ].join("\n");
}
