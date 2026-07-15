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
    name: "Brand Marketing or Brand Leadership",
    tier: "TIER_2",
    caresAbout: "Brand protection, visibility, market consistency, and avoiding wasteful coverage.",
    relevance:
      "Team reply data shows Brand and Brand Marketing leaders also respond when the angle is simple and tied to brand control.",
    bestAngle:
      "Brand visibility and spend control: protect the brand when needed, avoid paying when organic coverage is enough.",
    suitableCta: "Worth seeing whether this should sit with your paid media or brand team?",
    commonObjection: "Paid media owns this.",
    secondaryStakeholder: "Paid Search or Performance Marketing owner",
    prioritizeWhen:
      "The prospect owns brand marketing, brand paid media, regional brand, or cross-market brand governance.",
    doNotPrioritizeWhen:
      "They focus only on creative, communications, or employer brand with no media responsibility.",
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
  source: "Outreach sequence reply and mailing exports, July 15 2026",
  scope:
    "Filtered to replied sequence rows and mailings related to Signal, legacy Cross Brand, branded ads, branded search, brand incrementality, and brand visibility.",
  limitation:
    "The exports include reply metadata, subjects, templates, accounts, personas, and timing, but not the prospect reply body. Use them to learn which angles created replies, not to quote prospect language.",
  currentProductName:
    "Use Signal as the current product name. Treat Cross Brand / Cross-Brand as legacy evidence for the same product.",
  relatedReplyRows: 179,
  strongestSubjectClusters: [
    {
      label: "Deactivating branded ads",
      replyRows: 67,
      useFor:
        "Direct first touches about turning off or lowering branded ads when no competitors are bidding.",
    },
    {
      label: "Primelis intro / company x Primelis",
      replyRows: 58,
      useFor:
        "Simple intro-style emails still worked when paired with a relevant brand-search angle. Keep them short and account-specific.",
    },
    {
      label: "Optimize branded ad spend / visibility",
      replyRows: 19,
      useFor:
        "More executive or finance-friendly wording when the buyer may care about waste, control, and reporting.",
    },
    {
      label: "Brand incrementality / branded search spend",
      replyRows: 7,
      useFor:
        "Performance-marketing buyers who already understand the paid versus organic measurement problem.",
    },
    {
      label: "Lower branded CPC",
      replyRows: 5,
      useFor:
        "Use this with paid-search specialists when the hook is bid reduction rather than pausing ads.",
    },
  ],
  strongestTemplateClusters: [
    {
      label: "General paid ads for context",
      replyRows: 26,
      useFor:
        "Follow-up emails that explain the business context without repeating the first-touch pitch.",
    },
    {
      label: "Auto Disable Branded Ads",
      replyRows: 29,
      useFor:
        "Direct messages about pausing branded ads when no competitors are present.",
    },
    {
      label: "Last email / close loop",
      replyRows: 18,
      useFor:
        "Polite final touches. Do not skip close-loop emails; replies came from later sequence steps too.",
    },
    {
      label: "Video / more context",
      replyRows: 24,
      useFor:
        "Use after the first touch when the prospect needs a concrete explanation or example.",
    },
  ],
  stepLearning: [
    "Step 2 produced the most replies in the new export, so the first follow-up must add new context instead of repeating the opener.",
    "Steps 3-6 also produced meaningful replies, so the sequence should vary the angle across context, proof, methodology, and close-loop.",
    "Keep the first email direct, then use follow-ups to explain why paid brand can look efficient while still wasting spend.",
  ],
  titleLearning: [
    "CMO and senior marketing leaders replied, but they need business language: waste, visibility, control, and staying covered only when needed.",
    "Paid search and paid media specialists replied to direct mechanics: no competitors bidding, lower CPC, pause ads, and stay on top.",
    "Digital, growth, and performance leaders replied when the message tied branded search to acquisition efficiency and reporting.",
  ],
  legacyLearning: [
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
    "SAP",
    "Stripe",
    "QuickBooks",
    "Dialpad",
    "Culture Amp",
    "Costco Wholesale",
    "Docusign",
    "Squarespace",
    "Kohl's",
    "SharkNinja",
  ],
  copyRules: [
    "Lead with the buyer's branded-search decision, not an internal category or ICP label.",
    "Use plain language: no competitors bidding, pause ads, lower bids, stay on top, avoid overspending.",
    "Do not let follow-ups repeat the opener; Step 2 should add context, Step 3 should add proof or method, and the last email should close the loop.",
    "For senior marketing leaders, translate bid mechanics into business language: wasted spend, visibility, control, and reporting.",
    "Keep Signal as the product name even when the historical sequence used Cross Brand.",
    "Do not cite exact meeting counts or customer savings unless the account owner confirms the approved proof.",
    "When a prospect engaged from LinkedIn, mention the visible trigger before explaining Signal.",
  ],
};

export const replyBackedSequenceSteps = [
  {
    step: "Email 1",
    replyStep: "Step #2",
    replyRows: 51,
    bestSubjects: ["deactivating branded ads", "Primelis - Intro", "{{company}} x Primelis - Intro"],
    repliedTemplates: [
      "Email 1A - Auto Disable Branded Ads",
      "Email 1B - Auto Disable Branded Ads",
      "Email 1A - General paid ads",
    ],
    role:
      "Open with one direct branded-search question. Do not over-explain Signal in the first message.",
  },
  {
    step: "Email 2",
    replyStep: "Step #3",
    replyRows: 38,
    bestSubjects: ["Re: deactivating branded ads", "Re: optimize branded ad spend"],
    repliedTemplates: [
      "Email 2A - General paid ads for context",
      "Email 2B - General paid ads for context",
    ],
    role:
      "Add business context: paid brand can look efficient in reports while still creating avoidable spend.",
  },
  {
    step: "Email 3",
    replyStep: "Step #4",
    replyRows: 20,
    bestSubjects: ["Re: brand incrementality", "Re: optimize branded ads"],
    repliedTemplates: ["Email 3A - Video", "Email 3 Video 1A - All", "Email 3B - Video"],
    role:
      "Add proof, method, or a short visual explanation. Keep it concrete and avoid technical jargon.",
  },
  {
    step: "Email 4",
    replyStep: "Step #5",
    replyRows: 29,
    bestSubjects: ["Re: deactivating branded ads", "lower branded cpc"],
    repliedTemplates: [
      "Email 4A - more context with image",
      "Email 4 - Auto Lower CPC on Branded Ads",
    ],
    role:
      "Vary the angle: lower CPC, keep top position, or reduce coverage only when competitors are absent.",
  },
  {
    step: "Close loop",
    replyStep: "Step #6",
    replyRows: 21,
    bestSubjects: ["Re: Primelis - Intro", "Re: deactivating branded ads"],
    repliedTemplates: ["Last email", "keep ads up 4A Steve"],
    role:
      "Close politely. The last email still produced replies, so it should not sound like a throwaway.",
  },
] as const;

export const teamProspectReplyEvidence = {
  source: "Team prospect export, July 15 2026",
  scope:
    "All 82 exported prospects were in Replied - Email stage. The useful non-duplicate learning is persona and industry fit, not message copy.",
  limitation:
    "The file does not include sent message bodies or prospect reply bodies. Use it to prioritize who to target and how to frame the angle.",
  relatedBrandOrPaidMediaProspects: 20,
  personaLearning: [
    {
      label: "Paid media and paid search owners",
      examples: [
        "Vice President, Paid Media",
        "Global Paid Media Lead",
        "Paid Search Head",
        "Manager, Paid Search",
        "Senior Manager, Paid Media & Analytics",
      ],
      guidance:
        "Keep as the cleanest operational target when the message is about bids, competitors, and branded-search efficiency.",
    },
    {
      label: "Brand and brand marketing leaders",
      examples: [
        "Chief Brand Officer",
        "Corporate Brand Head",
        "Director, Brand Marketing",
        "Senior Director & Head of Global Brand",
        "Manager, Brand Growth and Partnerships",
      ],
      guidance:
        "Use brand-control language instead of paid-search jargon: visibility, waste, no competitors bidding, and staying covered only when needed.",
    },
    {
      label: "Growth and demand generation",
      examples: [
        "Growth Marketing Manager, Paid Media",
        "Senior Director, Growth Marketing",
        "Director, Demand Generation",
        "Senior VP, Growth Marketing",
      ],
      guidance:
        "Use efficiency and acquisition language. Avoid over-technical bid mechanics unless they ask.",
    },
  ],
  industryLearning: [
    "Security Software",
    "CRM Software",
    "Software / SaaS",
    "Telephony and Wireless",
    "Retail",
    "ERP Software",
    "Manufacturing",
    "Financial Software",
    "Airlines and Travel",
  ],
  accountExamples: [
    "HubSpot",
    "Tenable",
    "Stripe",
    "Wrike",
    "Dialpad",
    "QuickBooks",
    "Sephora",
    "Lacoste",
    "Mercedes-Benz USA",
    "Delta",
    "M&T Bank",
    "Culture Amp",
  ],
  copyRules: [
    "If the title includes Brand, lead with control and visibility, not incrementality.",
    "If the title includes Paid Search or Paid Media, lead with no competitors bidding, pausing ads, and lowering bids.",
    "If the title includes Growth or Demand Generation, lead with wasted spend and acquisition efficiency.",
    "Do not assume a Brand leader owns bids. Ask whether this sits with paid media or brand.",
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
    title: "After connect - two-outcome explainer",
    useWhen: "After a LinkedIn connection when you need to explain both pause and bid-lowering outcomes.",
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
    title: "Email 2 - context follow-up",
    useWhen:
      "Reply-backed Step 3 pattern. Use when the first email did not get an answer and you need to add context, not repeat the opener.",
    channel: "Email",
    subject: "Re: {{company}} paid brand question",
    message:
      "Hi {{firstName}},\n\nThe reason I ask is that branded campaigns can look efficient in reports even when some paid clicks may not be changing the outcome.\n\nThe practical check is simple: when no competitors are bidding, does paid coverage still protect demand, or would organic have captured most of it anyway?\n\nSignal helps teams make that decision with search-page visibility, organic coverage, and bid control in one place.\n\nWorth comparing how you handle this today?",
    whyItWorks:
      "The CSV shows Step 3 generated strong replies from context follow-ups. This version adds a clear reason without repeating the first touch.",
  },
  {
    title: "Email 2A - Google cannot automate this",
    useWhen:
      "Worked follow-up style. Use when you want to explain the concrete platform gap behind the first-touch question.",
    channel: "Email",
    subject: "Re: deactivating branded ads",
    message:
      "Hi {{firstName}},\n\nFor context, Google does not offer an easy way to automatically pause or adjust branded ads when no competitors are bidding.\n\nAs a result, many teams end up paying for clicks that could have been captured organically or at a much lower CPC.\n\nHere is an example of this showing up when I searched for {{company}}:\n\n[Insert search example or screenshot if available]\n\nDo you have visibility into when this happens?\n\nBest,",
    whyItWorks:
      "This is close to the working email the team used: it explains the platform limitation, the wasted-click problem, and asks for visibility instead of forcing a meeting.",
  },
  {
    title: "Email 3 - proof or method",
    useWhen:
      "Reply-backed Step 4 pattern. Use when the buyer needs to understand the method before taking a meeting.",
    channel: "Email",
    subject: "Re: brand search at {{company}}",
    message:
      "Hi {{firstName}},\n\nA useful way to look at this is not paid versus organic in theory, but what is happening on the search page at the moment of the search.\n\nIf competitors are present, paid coverage may be protecting demand. If they are absent, the question becomes whether the paid click is still adding value.\n\nThat is the decision Signal is built to make easier.\n\nOpen to a quick compare?",
    whyItWorks:
      "The reply export shows video and methodology templates still created replies. This keeps the method plain and buyer-friendly.",
  },
  {
    title: "Email 3A - solo bidding explanation",
    useWhen:
      "Use after the buyer understands the problem and needs a clearer explanation of what Signal actually does.",
    channel: "Email",
    subject: "Re: branded search at {{company}}",
    message:
      "Hi {{firstName}},\n\nGoogle does not provide an automated way to pause or down-bid branded ads when no competitors are bidding.\n\nAs a result, most brands keep paying for clicks they would have received organically.\n\nSignal identifies these moments and can automatically reduce or pause bids until competition returns, while preserving brand coverage and performance.\n\nIt uses historical CTR and full brand coverage, organic plus paid, to calculate a blended view of performance and adjust bids in real time.\n\nDo you currently have a way to detect and manage this?",
    whyItWorks:
      "This keeps the stronger technical explanation from the old CrossBrand copy, but rewrites it to Signal and removes unnecessary internal naming.",
  },
  {
    title: "Email 4 - lower CPC angle",
    useWhen:
      "Reply-backed Step 5 pattern. Use with paid-search owners when the angle is not only pausing ads, but lowering bids intelligently.",
    channel: "Email",
    subject: "Re: lower branded CPC",
    message:
      "Hi {{firstName}},\n\nOne other angle: this is not always about turning brand ads off.\n\nIn some cases the better move is lowering the bid to the minimum needed to stay covered, especially when the search page is quiet and nobody is pushing CPC up.\n\nThat is where Signal can help: keep coverage where it matters, avoid overpaying where it does not.\n\nIs this something your team already checks regularly?",
    whyItWorks:
      "The data shows later-step replies from lower-CPC and more-context templates. This gives the sequence a new angle instead of another version of the same email.",
  },
  {
    title: "Email 4A - competitive CPC optimization",
    useWhen:
      "Use later in the sequence when the buyer may think Signal is only useful when no competitors are bidding.",
    channel: "Email",
    subject: "Re: optimize branded ads",
    message:
      "Hi {{firstName}},\n\nOne more point: Signal can also help when competitors are bidding.\n\nIn those cases, the goal is not to pause. It is to adjust CPC intelligently based on CTR and conversion signals, so the team stays covered without overspending.\n\nSo the use case is not only reducing waste when there is no competition. It is also keeping branded search efficient when the market gets more competitive.\n\nOpen to a quick discussion?",
    whyItWorks:
      "This is based on the working follow-up that explained competitive scenarios. It prevents the buyer from thinking the product only handles no-competitor cases.",
  },
  {
    title: "Email close loop - still useful",
    useWhen:
      "Reply-backed Step 6 pattern. Use as the last note because the exports show late-step replies were meaningful.",
    channel: "Email",
    subject: "Closing the loop",
    message:
      "Hi {{firstName}},\n\nI will close the loop after this note.\n\nIf branded-search efficiency becomes a priority later, the useful starting point is straightforward: where is paid coverage protecting demand, and where is it only adding cost?\n\nIf this is not relevant right now, no problem at all.",
    whyItWorks:
      "The reply export shows Step 6 and last-email templates still produced replies. The close should be polite, specific, and easy to ignore without pressure.",
  },
  {
    title: "LinkedIn connection request",
    useWhen: "Send as the connection request before pitching. Keep it shorter than a normal LinkedIn message.",
    channel: "LinkedIn",
    message:
      "Hi {{firstName}}, quick question on {{company}} brand search. Curious how your team decides when paid brand coverage is still needed versus when organic already does enough.",
    whyItWorks:
      "It asks a relevant operational question before pitching and gives the buyer a clear reason to accept.",
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
];

type WinningMessageChannel = (typeof winningMessages)[number]["channel"];

export const winningMessageGroups: Array<{
  label: string;
  description: string;
  channels: WinningMessageChannel[];
}> = [
  {
    label: "Email",
    description:
      "Use for sequenced outbound. Keep each step distinct: first touch, context, proof or method, then close-loop.",
    channels: ["Email"],
  },
  {
    label: "LinkedIn",
    description:
      "Use after a connection, comment, or visible trigger. Shorter, more direct, and less formal than email.",
    channels: ["LinkedIn"],
  },
  {
    label: "Reply handling",
    description:
      "Use when the prospect already answered. Reply to the question first, then guide the next step.",
    channels: ["LinkedIn / Email", "Email / LinkedIn"],
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
