export type IcpSegmentInsight = {
  segment: string;
  share: number;
  accounts: number;
  examples: string[];
  strongestRoles: string[];
  whyItBooks: string;
  outreachMove: string;
};

export type IcpStageMetric = {
  label: string;
  value: string;
  detail: string;
};

export const hubspotIcpSnapshot = {
  pulledAt: "2026-07-16",
  sourceNote:
    "HubSpot read-only snapshot. Direct Meeting Events require connector reauthorization, so this view uses accessible Signal/Cross Brand deal records, meeting-booked deal fields, and customer/opportunity suppression records.",
  hubspotSearches: [
    {
      label: "Signal deal matches",
      count: 102,
      href: "https://app.hubspot.com/contacts/144053930/objects/0-3/views/all/list?query=Signal&utm_source=app_12360546_mcp&utm_medium=ai_agent&utm_campaign=icp_insights",
    },
    {
      label: "Cross Brand deal matches",
      count: 134,
      href: "https://app.hubspot.com/contacts/144053930/objects/0-3/views/all/list?query=Cross%20Brand&utm_source=app_12360546_mcp&utm_medium=ai_agent&utm_campaign=icp_insights",
    },
    {
      label: "Signal advanced-stage deals",
      count: 66,
      href: "https://app.hubspot.com/contacts/144053930/objects/0-3/views/all/list?query=Signal&utm_source=app_12360546_mcp&utm_medium=ai_agent&utm_campaign=icp_insights",
    },
    {
      label: "Signal deals with meeting booked field",
      count: 14,
      href: "https://app.hubspot.com/contacts/144053930/objects/0-3/views/all/list?query=Signal&utm_source=app_12360546_mcp&utm_medium=ai_agent&utm_campaign=icp_insights",
    },
  ],
  stageMetrics: [
    {
      label: "Suppressed customer accounts",
      value: "62",
      detail: "Closed-won or customer-linked Signal / legacy Cross Brand records already used for Do Not Contact.",
    },
    {
      label: "Advanced opportunities",
      value: "10",
      detail: "Active advanced Signal / Cross Brand opportunities that should not be targeted cold.",
    },
    {
      label: "Advanced Signal deals",
      value: "66",
      detail: "Signal deals in Intro booked, SQL, POA, proposal, negotiation, or closed-won stages.",
    },
    {
      label: "Meeting-booked Signal deals",
      value: "14",
      detail: "Deals where HubSpot exposes the meeting-booked property without Meeting Event permissions.",
    },
  ] satisfies IcpStageMetric[],
  segments: [
    {
      segment: "Fashion, luxury, and apparel",
      share: 24,
      accounts: 17,
      examples: ["Dior", "Chloe", "TAG Heuer", "Sandro", "Polene", "Lacoste"],
      strongestRoles: ["Paid Search lead", "Performance Marketing", "Digital / E-commerce"],
      whyItBooks:
        "High brand demand, expensive branded coverage, and clear tension between protecting brand traffic and overpaying for demand organic may already capture.",
      outreachMove:
        "Lead with a simple branded-search decision question, then use a relevant fashion/luxury case study only when approved.",
    },
    {
      segment: "Retail, e-commerce, and consumer brands",
      share: 26,
      accounts: 19,
      examples: ["Crocs", "La Redoute", "PlanetArt", "Catbird", "SelectBlinds", "Kitsch"],
      strongestRoles: ["Director of Paid Search", "Growth", "Acquisition", "E-commerce"],
      whyItBooks:
        "Branded search often looks efficient in reports, but volume and repeat purchase economics make small wasted-spend pockets meaningful.",
      outreachMove:
        "Use concrete language: when competitors are absent, do you pause, lower bids, or keep paying for clicks?",
    },
    {
      segment: "SaaS, software, and B2B technology",
      share: 13,
      accounts: 9,
      examples: ["AppsFlyer", "Apollo.io", "Similarweb", "Tenable", "Freshworks", "Databricks"],
      strongestRoles: ["Growth", "Demand Generation", "Paid Media", "Marketing Ops"],
      whyItBooks:
        "Teams care about CAC, qualified lead cost, and whether branded clicks are truly incremental when prospects already know the brand.",
      outreachMove:
        "Avoid retail language. Frame the problem around pipeline efficiency, demo/MQL economics, and measurement confidence.",
    },
    {
      segment: "Travel and mobility",
      share: 11,
      accounts: 8,
      examples: ["Copa Airlines", "Europcar", "Corsair", "Air Caraibes", "Universal Orlando"],
      strongestRoles: ["Performance Marketing", "Acquisition", "Revenue / Digital"],
      whyItBooks:
        "High-intent branded queries and route/location competition make paid brand coverage a real operating decision.",
      outreachMove:
        "Use market-by-market control and competitor presence rather than broad cost-saving claims.",
    },
    {
      segment: "Financial services and insurance",
      share: 8,
      accounts: 6,
      examples: ["AXA", "Allianz", "Nickel", "Sofinco", "Consorcio Financiero"],
      strongestRoles: ["Acquisition", "Performance Marketing", "Digital"],
      whyItBooks:
        "CPC sensitivity is high, brand trust matters, and teams need cautious wording around efficiency and control.",
      outreachMove:
        "Keep the message conservative: visibility, bid control, and avoiding unnecessary spend without claiming guaranteed savings.",
    },
    {
      segment: "Home, living, and services",
      share: 8,
      accounts: 6,
      examples: ["3 Day Blinds", "Heytens", "Serena & Lily", "Best Mobilier"],
      strongestRoles: ["Paid Search", "Growth", "E-commerce"],
      whyItBooks:
        "Brand demand is measurable and purchase intent is strong, so paid brand waste can hide inside otherwise healthy campaigns.",
      outreachMove:
        "Start with the no-competitor-bidding question and keep the CTA operational, not strategic.",
    },
    {
      segment: "Entertainment, gaming, and media",
      share: 6,
      accounts: 4,
      examples: ["Plarium", "Playtika", "Mixbook", "Giftory"],
      strongestRoles: ["Growth", "Paid Media", "Acquisition"],
      whyItBooks:
        "High-volume branded demand and paid-social/search overlap make efficiency checks relevant, but proof should be verified.",
      outreachMove:
        "Use this as a strong hypothesis segment until more meeting data is connected.",
    },
    {
      segment: "Agencies, holdings, and other enterprise",
      share: 4,
      accounts: 3,
      examples: ["WPP", "THG", "Manutan"],
      strongestRoles: ["Paid Search leadership", "Digital transformation", "Marketing leadership"],
      whyItBooks:
        "The fit is usually tied to multi-brand complexity and internal ownership, not company size alone.",
      outreachMove:
        "Qualify ownership first, then decide whether Signal is a fit for one brand, one market, or a portfolio rollout.",
    },
  ] satisfies IcpSegmentInsight[],
  dealExamples: [
    {
      company: "Picard Surgelees",
      stage: "SQL",
      signal: "Signal deal, advanced stage",
      segment: "Retail / food",
    },
    {
      company: "Christian Dior Couture",
      stage: "Proposal sent",
      signal: "Signal Optimization Tech",
      segment: "Fashion and luxury",
    },
    {
      company: "Similarweb",
      stage: "SQL",
      signal: "Signal Optimization Tech",
      segment: "B2B SaaS and technology",
    },
    {
      company: "TAG Heuer USA",
      stage: "Closed won",
      signal: "Signal Cross Brand Optimization Tech",
      segment: "Fashion and luxury",
    },
    {
      company: "Chloe",
      stage: "Closed won",
      signal: "Cross Brand contract",
      segment: "Fashion and luxury",
    },
    {
      company: "Tenable",
      stage: "Closed won",
      signal: "Signal Cross Brand Tech",
      segment: "B2B SaaS and technology",
    },
    {
      company: "Catbird",
      stage: "Intro booked",
      signal: "Signal deal with meeting booked",
      segment: "Retail / e-commerce",
    },
    {
      company: "Birkenstock",
      stage: "Proposal sent",
      signal: "Signal deal with meeting booked",
      segment: "Fashion and apparel",
    },
  ],
};
