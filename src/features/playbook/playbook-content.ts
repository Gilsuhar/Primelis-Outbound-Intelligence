import type {
  EvidenceLevel,
  IndustryPlaybookEntry,
  PersonaPlaybookEntry,
  PlaybookProgressState,
  PracticeScenario,
  ViewerRole,
} from "./types";

export const evidenceDescriptions: Record<EvidenceLevel, string> = {
  PROVEN: "Supported by current Signal case studies or approved product knowledge.",
  STRONG_HYPOTHESIS:
    "Supported by repeatable product logic, outbound experience, or adjacent evidence.",
  EXPLORATORY: "Worth testing, but not yet validated as core ICP.",
};

export const coreIcpSignals = [
  "Meaningful branded-search demand and strong direct brand recognition.",
  "Active advertising on branded terms with a real need to decide when to appear and how much to bid.",
  "Dedicated Paid Search, Performance Marketing, Acquisition, or Growth ownership.",
  "Multi-market, multi-country, multi-brand, or regional complexity.",
  "A commercial opportunity large enough for efficiency, control, or measurement gains to matter.",
];

export const companySizeGuidance = [
  "Revenue above $50M, 200+ employees, active branded-search ads, and dedicated Paid Search or Performance ownership are high-priority signals.",
  "$20M-$50M revenue or 100-200 employees can still be relevant when brand demand and branded-search activity are meaningful.",
  "$20M+ revenue is a qualification signal, not a universal hard rule.",
  "Do not present revenue or spend as verified unless the user provides it or a trusted source supports it.",
  "Meaningful branded-search spend, often around $20K+ monthly, can be a strong signal, but it is not a universal minimum or commercial rule.",
];

export const qualificationChecklist = [
  "Is the company advertising on branded terms?",
  "Is organic brand visibility strong?",
  "Is there multi-market or multi-brand complexity?",
  "Is there a relevant Paid Search or Performance owner?",
  "Is there a credible efficiency, control, or measurement angle?",
  "Is a current tool known?",
  "Which facts are verified?",
  "Which points are assumptions?",
  "Is the account suppressed?",
];

export const workSteps = [
  "Find Account",
  "Check Fit",
  "Check Do Not Contact",
  "Find Persona",
  "Research",
  "Choose Angle",
  "Create Outreach",
  "Build Sequence",
  "Handle Reply",
  "Record Outcome",
];

export const industries: IndustryPlaybookEntry[] = [
  {
    name: "Fashion and Luxury",
    evidenceLevel: "PROVEN",
    whySignalMayFit: [
      "Strong brand demand and organic presence.",
      "International activity and cross-market governance needs.",
      "Sensitivity to brand CPC and spend efficiency.",
    ],
    primaryPersonas: [
      "Global Paid Search Lead",
      "Director of Paid Search",
      "E-commerce Director",
      "VP Performance Marketing",
    ],
    bestAngles: ["Brand-spend efficiency", "Cross-market control", "Paid and organic measurement"],
    likelyObjection: "We already control brand campaigns closely.",
    eligibleProof: ["Dior", "TAG Heuer", "Chloé", "Polène", "Sandro"],
  },
  {
    name: "Retail and E-commerce",
    evidenceLevel: "PROVEN",
    whySignalMayFit: [
      "Large branded-search demand and active campaign management.",
      "Seasonality, multi-market activity, and efficiency sensitivity.",
      "Order or conversion economics where branded spend matters.",
    ],
    primaryPersonas: [
      "Director of Paid Search",
      "VP Performance Marketing",
      "E-commerce Director",
      "Head of Acquisition",
    ],
    bestAngles: [
      "Branded-spend efficiency",
      "Preserving business outcomes",
      "Control during changing competitor conditions",
    ],
    likelyObjection: "We tried reducing brand spend before.",
    eligibleProof: ["Crocs"],
  },
  {
    name: "B2B SaaS and Technology",
    evidenceLevel: "PROVEN",
    whySignalMayFit: [
      "Branded search connects to lead generation and demo economics.",
      "High CPC sensitivity and mature Demand Generation teams.",
      "Advanced measurement expectations.",
    ],
    primaryPersonas: [
      "VP Performance Marketing",
      "Head of Paid Search",
      "Head of Acquisition",
      "Director of Demand Generation",
    ],
    bestAngles: ["Cost efficiency", "Qualified demand", "Paid and organic measurement"],
    likelyObjection: "We already use a search intelligence platform.",
    eligibleProof: ["ZoomInfo", "AppsFlyer"],
  },
  ...[
    "Travel and Airlines",
    "Fintech and Financial Services",
    "Marketplaces",
    "Subscription Businesses",
    "Telecommunications",
    "Gaming",
    "Hospitality",
  ].map((name) => ({
    name,
    evidenceLevel: "STRONG_HYPOTHESIS" as const,
    whySignalMayFit: [
      "Potential brand demand and market variation.",
      "Likely performance-marketing maturity or acquisition sensitivity.",
    ],
    primaryPersonas: ["VP Performance Marketing", "Head of Acquisition", "Paid Search Lead"],
    bestAngles: ["Efficiency", "Control", "Measurement quality"],
    likelyObjection: "This may not be a current priority.",
  })),
  ...[
    "Automotive",
    "Insurance",
    "Health and Wellness",
    "Consumer Services",
    "Home Services",
    "Education",
    "Media",
    "B2B Services",
  ].map((name) => ({
    name,
    evidenceLevel: "EXPLORATORY" as const,
    whySignalMayFit: ["Worth testing only when brand demand and paid-search activity are visible."],
    primaryPersonas: ["Paid Search owner", "Performance Marketing owner"],
    bestAngles: ["Qualification-first discovery"],
    likelyObjection: "Unclear fit without verified brand-search activity.",
  })),
];

export const personas: PersonaPlaybookEntry[] = [
  {
    name: "Head or Director of Paid Search",
    tier: "TIER_1",
    caresAbout: "Control, CPC, incrementality, governance, and day-to-day execution.",
    relevance: "Usually closest to branded-search strategy and efficiency decisions.",
    bestAngle: "Methodology and control over when branded paid search is actually useful.",
    suitableCta: "Worth comparing how you decide where paid brand spend is incremental?",
    commonObjection: "We already manage this internally.",
    secondaryStakeholder: "VP Performance Marketing",
    prioritizeWhen: "A direct Paid Search owner exists and appears to own branded-search strategy.",
    doNotPrioritizeWhen: "The role is execution-only with no budget or methodology influence.",
  },
  {
    name: "VP Performance Marketing",
    tier: "TIER_1",
    caresAbout: "Spend efficiency, business outcomes, and scalable growth.",
    relevance: "Often owns the budget and tradeoffs across channels.",
    bestAngle: "Efficiency and measurement across paid and organic brand outcomes.",
    suitableCta: "Open to a short comparison of how brand-search efficiency is measured?",
    commonObjection: "This is not a priority.",
    secondaryStakeholder: "Director of Paid Search",
    prioritizeWhen: "They appear to own performance budget or acquisition outcomes.",
    doNotPrioritizeWhen: "Paid Search ownership is clearly elsewhere and they are far removed.",
  },
  {
    name: "Head of Growth or Acquisition",
    tier: "TIER_1",
    caresAbout: "Acquisition performance, conversion impact, and budget allocation.",
    relevance: "May own the commercial outcome even when Paid Search is operationally delegated.",
    bestAngle: "Branded-search efficiency as part of acquisition performance.",
    suitableCta: "Worth seeing if this is relevant to your acquisition efficiency work?",
    commonObjection: "Our agency handles this.",
    secondaryStakeholder: "Paid Search Manager",
    prioritizeWhen: "They own acquisition strategy or growth outcomes.",
    doNotPrioritizeWhen: "They focus only on product-led or non-paid channels.",
  },
  {
    name: "E-commerce or Digital Director",
    tier: "TIER_2",
    caresAbout: "Revenue, conversion paths, market consistency, and campaign performance.",
    relevance: "Strong secondary target when search ownership sits inside digital commerce.",
    bestAngle: "Cross-market control and efficiency without overclaiming performance lift.",
    suitableCta: "Is brand-search efficiency something your team is reviewing this quarter?",
    commonObjection: "We are happy with the current setup.",
    secondaryStakeholder: "Paid Search Lead",
    prioritizeWhen: "They own digital acquisition or branded campaign outcomes.",
    doNotPrioritizeWhen: "They focus on site merchandising without acquisition ownership.",
  },
  {
    name: "CMO or VP Marketing",
    tier: "TIER_3",
    caresAbout: "Governance, visibility, and consistency across markets.",
    relevance: "Useful as an executive sponsor when the account is strategic or smaller.",
    bestAngle: "Visibility and governance across brand demand and paid-search decisions.",
    suitableCta: "Would it be useful to route this to the person who owns Paid Search efficiency?",
    commonObjection: "Send me a deck.",
    secondaryStakeholder: "VP Performance Marketing",
    prioritizeWhen: "No operational owner is visible or the account is highly strategic.",
    doNotPrioritizeWhen: "A better operational owner is obvious.",
  },
];

export const practiceScenarios: PracticeScenario[] = [
  {
    id: "existing-adthena",
    title: "Existing Adthena user",
    prompt: "A prospect says they already use Adthena.",
    guidance:
      "Acknowledge the existing setup, avoid unsupported competitor claims, and ask whether comparing methodology would be useful.",
  },
  {
    id: "methodology-question",
    title: "Technical methodology question",
    prompt: "A prospect asks how Signal looks at paid and organic together.",
    guidance:
      "Answer the question first, stay source-backed, and offer a short follow-up if they want detail.",
  },
  {
    id: "auction-insights",
    title: "Auction Insights objection",
    prompt: "A prospect says Auction Insights already gives them what they need.",
    guidance:
      "Do not criticize Auction Insights. Frame the discussion around decision methodology and control.",
  },
  {
    id: "deck-request",
    title: "Deck request",
    prompt: "A prospect replies: send me a deck.",
    guidance: "Confirm the specific question the deck should answer and keep the CTA soft.",
  },
  {
    id: "timing-objection",
    title: "Timing objection",
    prompt: "A prospect says now is not the right time.",
    guidance:
      "Respect timing, offer a low-pressure future check-in, and do not create urgency that is not supported.",
  },
];

export const outreachReplyEvidence = {
  source: "Outreach mailing export, July 15 2026",
  scope:
    "Filtered to replied mailings related to Signal, legacy Cross Brand, branded ads, branded search, brand incrementality, and brand visibility.",
  limitation:
    "The export includes reply metadata, subjects, accounts, and timing, but not the reply body. Use it to learn which angles created replies, not to quote prospect language.",
  currentProductName:
    "Use Signal as the current product name. Treat Cross Brand / Cross-Brand as legacy evidence for the same product.",
  relatedReplyRows: 123,
  strongestSubjectClusters: [
    {
      label: "Deactivating branded ads",
      replyRows: 68,
      useFor:
        "Direct first touches about turning off or lowering branded ads when no competitors are bidding.",
    },
    {
      label: "Optimize branded ad spend / visibility",
      replyRows: 25,
      useFor:
        "More executive or finance-friendly wording when the buyer may care about waste, control, and reporting.",
    },
    {
      label: "Brand incrementality",
      replyRows: 12,
      useFor:
        "Performance-marketing buyers who already understand the paid versus organic measurement problem.",
    },
    {
      label: "Legacy Cross Brand",
      replyRows: 12,
      useFor:
        "Historical proof that the same product angle worked, but rewrite external wording to Signal.",
    },
  ],
  replyingAccountExamples: [
    "Plus500",
    "American Airlines",
    "Airbyte",
    "MGM Resorts",
    "The Knot",
    "TeePublic",
    "Taboola",
    "Nayax",
    "Ancestry",
    "Priceline",
    "The North Face",
    "Checkr",
    "QuillBot",
    "HiBob",
    "Stitch Fix",
    "AppFolio",
    "On",
  ],
  copyRules: [
    "Lead with the buyer's branded-search decision, not an internal category or ICP label.",
    "Use plain language: no competitors bidding, pause ads, lower bids, stay on top, avoid overspending.",
    "Keep Signal as the product name even when the historical sequence used Cross Brand.",
    "Do not cite exact meeting counts or customer savings unless the account owner confirms the approved proof.",
    "When a prospect engaged from LinkedIn, mention the visible trigger before explaining Signal.",
  ],
};

export const winningMessages = [
  {
    title: "Email subject - deactivating branded ads",
    useWhen:
      "Use this subject family when the buyer is likely responsible for paid search or branded campaigns.",
    channel: "Email",
    subject: "deactivating branded ads",
    message:
      "Hi {{firstName}},\n\nQuick question on {{company}} brand search. How do you decide when branded ads should stay live versus when organic would have captured the click anyway?\n\nSignal helps teams monitor the search results and adjust branded coverage when competitors are not bidding, instead of paying for clicks that may not add value.\n\nWorth comparing how you handle this today?",
    whyItWorks:
      "The Outreach export shows this was the strongest reply-generating subject cluster for the Signal/Cross Brand use case.",
  },
  {
    title: "Email subject - optimize branded ad spend",
    useWhen:
      "Use this when the buyer may care more about budget control than the mechanics of pausing ads.",
    channel: "Email",
    subject: "optimize branded ad spend",
    message:
      "Hi {{firstName}},\n\nI had {{company}} on my list because branded search can look efficient while still hiding wasted spend.\n\nSignal helps compare paid coverage with organic results and live competitor activity, so teams can decide where branded ads are protecting demand and where bids can be reduced.\n\nWorth a quick compare?",
    whyItWorks:
      "This keeps the same proven angle but frames it in budget language for performance and finance-sensitive buyers.",
  },
  {
    title: "Email subject - brand incrementality",
    useWhen:
      "Use this for sophisticated performance marketers who already think about paid versus organic incrementality.",
    channel: "Email",
    subject: "brand incrementality",
    message:
      "Hi {{firstName}},\n\nHow are you measuring whether {{company}} branded search is incremental when competitors are not present?\n\nSignal helps teams look at paid coverage, organic results, and search-page changes together, so the decision is not just based on paid-search efficiency in isolation.\n\nOpen to comparing notes?",
    whyItWorks:
      "The export shows incrementality language created replies, but it should be reserved for buyers who will understand the term.",
  },
  {
    title: "Legacy Cross Brand - rewrite to Signal",
    useWhen:
      "Use this when adapting old Cross Brand outreach that worked into the current Signal product language.",
    channel: "Email / LinkedIn",
    subject: "{{company}} x Signal",
    message:
      "Hi {{firstName}},\n\nI noticed the old Cross Brand angle worked well for similar accounts, but the current product name is Signal.\n\nFor external messaging, rewrite the idea as: Signal helps teams decide when branded ads should run, pause, or bid lower based on live competitor activity and organic coverage.\n\nDo not send Cross Brand wording unless the account owner explicitly wants legacy language.",
    whyItWorks:
      "It preserves historical learning from Cross Brand sequences while keeping customer-facing language consistent with the current Signal name.",
  },
  {
    title: "After connect - no competitor angle",
    useWhen: "After a LinkedIn connection when you want the proven direct opener.",
    channel: "LinkedIn",
    message:
      "Thanks for connecting, {{firstName}}! We built a tool that automatically turns off branded ads when competitors are not bidding, so {{company}} can get the organic click instead of a paid one.\n\nAlternatively, the CPC algorithm lowers the bid to the minimum needed for branded ads to appear at the top of Google searches.\n\nDo you already have a way to do that?",
    whyItWorks:
      "It is simple, specific, and explains the two outcomes without using internal product language.",
  },
  {
    title: "LinkedIn comment follow-up",
    useWhen:
      "After someone comments on a relevant LinkedIn post and you want to connect the comment to the Signal use case.",
    channel: "LinkedIn",
    message:
      "Hi {{firstName}}, saw your comment on {{postAuthor}}'s post and thought you might find this interesting.\n\nWe built a tool that automatically pauses branded ads when no competitors are bidding, or lowers bids to the minimum needed to stay on top without overspending.\n\nDo you already have a way to do that?",
    whyItWorks:
      "It gives a clear reason for reaching out, then turns the comment into a practical question instead of a generic pitch.",
  },
  {
    title: "After connect - brand question with proof",
    useWhen: "After a LinkedIn connection when you want a stronger message with light proof.",
    channel: "LinkedIn",
    message:
      "Thanks for connecting, {{firstName}}! How are you currently handling branded search at {{company}} when no competitors are bidding?\n\nWe built a tool that automatically pauses those ads or lowers bids to the minimum needed to stay at the top.\n\nThis approach has helped teams reduce branded search costs while maintaining performance.\n\nHow are you currently monitoring these patterns in real time?",
    whyItWorks:
      "It starts with a direct buyer question, explains the mechanism simply, and ends with a practical monitoring question.",
  },
  {
    title: "After connect - quick chat",
    useWhen: "After a LinkedIn connection when you want the shortest direct version.",
    channel: "LinkedIn",
    message:
      "Hi {{firstName}} - thanks for connecting. How do you handle branded ads at {{company}} when no competitors are bidding on your brand?\n\nWe built a tool that scans Google and Bing search results in real time. When no competitors are present, it auto-pauses branded ads or lowers bids to the minimum needed to maintain the top position.\n\nWorth a quick chat?",
    whyItWorks:
      "It is direct, easy to understand, and asks for a small next step without over-explaining.",
  },
  {
    title: "After connect - organic click angle",
    useWhen: "After a LinkedIn connection when the strongest hook is wasted paid brand clicks.",
    channel: "LinkedIn",
    message:
      "Thanks for connecting, {{firstName}}! We built a tool that automatically turns off branded ads when competitors are not bidding, so {{company}} can get the organic click instead of a paid one.\n\nAlternatively, the CPC algorithm lowers the bid to the minimum needed for branded ads to appear at the top of Google searches.\n\nDo you already have a way to do that?",
    whyItWorks:
      "It makes the value concrete: get the organic click when paid coverage is not needed.",
  },
  {
    title: "After connect - ultra short",
    useWhen: "After a LinkedIn connection when you want one clean idea and one question.",
    channel: "LinkedIn",
    message:
      "Thanks for connecting, {{firstName}}. We built a tool that automatically turns off branded ads when competitors are not bidding, so {{company}} can get the organic click instead of a paid one.\n\nDo you already have a way to do that?",
    whyItWorks:
      "It is extremely short and keeps the buyer focused on one decision.",
  },
  {
    title: "After connect - paid strategy angle",
    useWhen: "After a LinkedIn connection with a paid search or performance stakeholder.",
    channel: "LinkedIn",
    message:
      "{{firstName}}, noticed you are involved with paid strategy at {{company}}. Quick question: how do you handle branded ads when no one is bidding on your brand?\n\nWe built a tool that pauses them when there is no competition or adjusts bids to the lowest level needed to stay on top, without overspending.\n\nWorth a quick chat?",
    whyItWorks:
      "It anchors to the person's likely responsibility and keeps the product explanation simple.",
  },
  {
    title: "LinkedIn first touch",
    useWhen: "You want a short opener before asking for a meeting.",
    channel: "LinkedIn",
    message:
      "Hi {{firstName}} - quick question on {{company}} brand search. How do you decide when paid brand coverage is still needed versus when organic already does enough?",
    whyItWorks:
      "It asks a real operational question, avoids a pitch, and gives the buyer an easy way to reply.",
  },
  {
    title: "Email first touch",
    useWhen: "You have a plausible fit but no verified account research yet.",
    channel: "Email",
    subject: "{{company}} paid brand question",
    message:
      "Hi {{firstName}},\n\nI had {{company}} on my list for one narrow reason: branded search can look healthy in reports even when some paid clicks are not changing the outcome.\n\nThe question is not whether branded search is good or bad. It is where paid coverage still protects demand, and where organic results may already do enough.\n\nWorth comparing how you decide this today?",
    whyItWorks:
      "It uses a specific business tension instead of category labels, seniority labels, or internal ICP language.",
  },
  {
    title: "Deck request reply",
    useWhen: "The prospect asks for a deck, overview, one-pager, or more info.",
    channel: "LinkedIn / Email",
    message:
      "Yes, happy to send it. I’ll keep it focused on your paid-brand question, not a generic overview.\n\nShort version: Signal is useful when the team wants to know where paid brand coverage is still needed and where organic results may already be doing enough.\n\nI can send the deck and add two bullets most relevant to your setup.",
    whyItWorks:
      "It answers the request first, keeps control of the narrative, and avoids dumping a generic pitch.",
  },
  {
    title: "No competitors bidding",
    useWhen: "The prospect asks how Signal handles brand ads when no competitors are present.",
    channel: "LinkedIn / Email",
    message:
      "Good question. If no competitors are bidding, I would not automatically keep or pause brand ads.\n\nI would first compare paid coverage with organic results to see whether the paid clicks are changing the outcome.\n\nSignal helps make that check practical by showing when paid brand is protecting demand and when organic may already be carrying it.",
    whyItWorks:
      "It does not expose internal terms like solo or ghost. It explains the decision in buyer language.",
  },
  {
    title: "Existing vendor reply",
    useWhen: "The prospect says they already use a tool, agency, or internal process.",
    channel: "LinkedIn / Email",
    message:
      "That makes sense. I would not frame this as replacing what you already use.\n\nThe useful question is whether your current setup clearly shows when paid brand is still needed versus when organic would have captured the demand anyway.\n\nWorth comparing how you decide that today?",
    whyItWorks:
      "It avoids attacking the current setup and shifts the conversation to decision quality.",
  },
  {
    title: "Low-pressure close",
    useWhen: "Final touch or after light silence.",
    channel: "Email",
    subject: "Closing the loop",
    message:
      "Hi {{firstName}},\n\nI’ll close the loop after this note.\n\nIf paid-brand efficiency becomes a priority later, the useful starting point is simple: where is paid coverage protecting demand, and where is it just adding cost?\n\nIf this is not relevant, no problem at all.",
    whyItWorks:
      "It closes politely while leaving a clear reason to re-open the conversation later.",
  },
] as const;

export const progressLabels: Record<keyof PlaybookProgressState, string> = {
  learnSignal: "Learn Signal reviewed",
  icp: "ICP reviewed",
  industries: "Industries reviewed",
  personas: "Personas reviewed",
  qualification: "Qualification reviewed",
  objections: "Objections reviewed",
  caseStudies: "Case Studies reviewed",
  practice: "Practice completed",
  readyForUsMarket: "Ready for US market",
  managerApproval: "Manager approval",
};

export function emptyProgress(): PlaybookProgressState {
  return {
    learnSignal: false,
    icp: false,
    industries: false,
    personas: false,
    qualification: false,
    objections: false,
    caseStudies: false,
    practice: false,
    readyForUsMarket: false,
    managerApproval: false,
  };
}

export function canManagerApprove(role: ViewerRole) {
  return role === "KNOWLEDGE_ADMIN";
}

export function calculateProgress(progress: PlaybookProgressState, viewerRole: ViewerRole) {
  const entries = Object.entries(progress) as Array<[keyof PlaybookProgressState, boolean]>;
  const completed = entries.filter(([, value]) => value);
  const percentage = Math.round((completed.length / entries.length) * 100);
  const managerApprovalVisible = canManagerApprove(viewerRole);

  return {
    completionPercentage: percentage,
    completedSections: completed.map(([key]) => progressLabels[key]),
    remainingSections: entries.filter(([, value]) => !value).map(([key]) => progressLabels[key]),
    readinessStatus: progress.managerApproval
      ? "Approved"
      : progress.readyForUsMarket
        ? "Ready for manager review"
        : percentage > 0
          ? "In progress"
          : "Not started",
    managerApprovalVisible,
  } as const;
}
