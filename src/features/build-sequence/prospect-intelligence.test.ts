import { describe, expect, it } from "vitest";

import type { BuildSequenceInput, SequenceKnowledgeRecord } from "./types";
import { buildProspectIntelligence, interpretProspectContext, rankProspectInsights } from "./prospect-intelligence";

const input: BuildSequenceInput = {
  companyName: "Cursor",
  companyWebsite: "cursor.com",
  contactFirstName: "Ari",
  contactRole: "Head of Growth",
  observedTrigger: "Light discovery before pitching Signal",
  primaryChannel: "EMAIL",
  sequenceLength: 4,
  desiredTone: "CONSULTATIVE",
  desiredOverallDuration: "10 business days",
};

const proof: SequenceKnowledgeRecord = {
  id: "proof",
  title: "AppsFlyer proof",
  type: "CASE_STUDY",
  approvalStatus: "APPROVED",
  approvedText: "Case study: AppsFlyer. Brand ad spend decreased by 29% while qualified leads increased 25%.",
  channels: ["EMAIL", "LINKEDIN"],
  sourceIds: ["source-1"],
  sourceTitles: ["Approved source"],
  sourceDates: ["2026-01-01"],
};

describe("Prospect Intelligence extraction", () => {
  it("classifies SOLO evidence from multiple solo keywords", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "cursor - brand bidding alone\ncursor pricing - brand alone",
    });

    expect(intelligence.serpScenario).toBe("SOLO");
    expect(intelligence.serpEvidence.soloKeywords).toEqual([
      "cursor",
      "cursor pricing",
    ]);
    expect(intelligence.primaryAngle).toMatch(/solo branded-search periods/i);
  });

  it("classifies CONTESTED evidence when competitors are visible on all terms", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "cursor build - competitor visible\ncursor ai editor - competitor visible",
    });

    expect(intelligence.serpScenario).toBe("CONTESTED");
    expect(intelligence.primaryAngle).toMatch(/minimum defensive CPC/i);
  });

  it("classifies MIXED evidence when solo and contested terms are both supplied", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "cursor pricing - brand alone\ncursor build plan - competitor visible",
    });

    expect(intelligence.serpScenario).toBe("MIXED");
    expect(intelligence.primaryAngle).toMatch(/one static rule/i);
  });

  it("uses structured keyword evidence before free-text SERP notes", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "generic notes only",
      keywords: [
        { term: "Cursor pricing", status: "solo" },
        { term: "Cursor AI editor", status: "contested", competitor: "Notion" },
      ],
    });

    expect(intelligence.serpScenario).toBe("MIXED");
    expect(intelligence.serpEvidence.soloKeywords).toEqual(["Cursor pricing"]);
    expect(intelligence.serpEvidence.contestedKeywords).toEqual(["Cursor AI editor"]);
    expect(intelligence.serpEvidence.competitors).toEqual(["Notion"]);
  });

  it("filters structured keyword evidence that does not match the prospect company", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      keywords: [
        { term: "Nike running shoes", status: "contested", competitor: "Adidas" },
      ],
    });

    expect(intelligence.serpScenario).toBe("UNKNOWN");
    expect(intelligence.serpEvidence.structuredKeywords).toEqual([]);
    expect(JSON.stringify(intelligence)).not.toContain("Nike running shoes");
  });

  it("classifies UNKNOWN when no SERP evidence is supplied", () => {
    const intelligence = buildProspectIntelligence(input);

    expect(intelligence.serpScenario).toBe("UNKNOWN");
    expect(intelligence.confidence.serp).toBe("LOW");
    expect(intelligence.serpEvidence.soloKeywords).toEqual([]);
    expect(intelligence.serpEvidence.contestedKeywords).toEqual([]);
  });

  it("keeps generic all-keyword notes out of rendered keyword samples", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "solo brand moments on all kws biiding",
    });

    expect(intelligence.serpScenario).toBe("SOLO");
    expect(intelligence.serpEvidence.keywords).toEqual([]);
    expect(intelligence.serpEvidence.soloKeywords).toEqual([]);
  });

  it("keeps employment-duration metadata out of personalization facts", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      prospectContext: "Full-time · 3 yrs 3 mos\nOct 2025 - Present · 11 mos\nPosted about improving paid search measurement.",
    });

    expect(intelligence.relevantFacts).toEqual([
      "Posted about improving paid search measurement.",
    ]);
  });

  it("does not treat LinkedIn section labels as prospect names", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      contactFirstName: undefined,
      contactRole: "Head of Performance Marketing",
      prospectContext: "About\nPPC Team Lead\nOct 2025 - Present · 11 mos",
    });

    expect(intelligence.prospectName).toBeUndefined();
    expect(intelligence.jobTitle).toBe("PPC Team Lead");
    expect(intelligence.relevantFacts).toEqual([]);
  });

  it("does not accept role fragments as prospect first names", () => {
    for (const roleFragment of ["Head", "Senior", "Paid", "Director", "VP", "Growth"]) {
      const intelligence = buildProspectIntelligence({
        ...input,
        contactFirstName: roleFragment,
        prospectContext: `${roleFragment}\nCursor\nPaid Search Lead`,
      });

      expect(intelligence.prospectName, roleFragment).not.toBe(roleFragment);
    }
  });

  it("does not treat bare company names or source labels as personalization facts", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      prospectContext:
        "About: I build performance marketing teams across paid search.\nCursor\nSERP:\nCursor pricing - solo",
    });

    expect(intelligence.relevantFacts).toEqual([
      "I build performance marketing teams across paid search.",
    ]);
    expect(intelligence.relevantFacts).not.toContain("Cursor");
    expect(intelligence.relevantFacts.join(" ")).not.toContain("About:");
  });

  it("does not treat absence of SERP evidence as SERP evidence", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "No verified SERP evidence supplied.\nNo verified screenshot yet.",
    });

    expect(intelligence.serpScenario).toBe("UNKNOWN");
    expect(intelligence.serpEvidence.keywords).toEqual([]);
    expect(intelligence.serpEvidence.observations).toEqual([]);
  });

  it("normalizes dash competitor syntax without including the keyword in the competitor", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "Cursor accounting - competitor BookPilot appeared",
    });

    expect(intelligence.serpScenario).toBe("CONTESTED");
    expect(intelligence.serpEvidence.contestedKeywords).toEqual(["Cursor accounting"]);
    expect(intelligence.serpEvidence.competitors).toContain("BookPilot");
    expect(intelligence.serpEvidence.competitors).not.toContain("Cursor accounting - competitor BookPilot");
  });

  it("extracts a prospect name and role from pasted profile context without treating the role as a fact", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      contactFirstName: undefined,
      contactRole: "Head of Performance Marketing",
      prospectContext: "Mia Johnson\nPPC Team Lead\nFull-time · 3 yrs 3 mos",
    });

    expect(intelligence.prospectName).toBe("Mia");
    expect(intelligence.jobTitle).toBe("PPC Team Lead");
    expect(intelligence.relevantFacts).toEqual([]);
  });

  it("extracts persona from supplied context without inventing responsibilities", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      contactRole: "Marketing Lead",
      prospectContext: "Ari posted about experimentation and growth efficiency across self-serve acquisition.",
    });

    expect(intelligence.persona).toBe("GROWTH");
    expect(intelligence.relevantFacts[0]).toContain("experimentation");
    expect(JSON.stringify(intelligence)).not.toMatch(/branded search responsibility/i);
  });

  it("recommends only an approved proof point when records include proof", () => {
    const intelligence = buildProspectIntelligence(input, [proof]);

    expect(intelligence.recommendedProofPoint).toContain("AppsFlyer");
    expect(intelligence.recommendedProofPoint).toContain("29%");
  });

  it("ranks Tanvi's commercial paid-search responsibilities above her raw LinkedIn headline", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      companyName: "Hush",
      contactFirstName: "Tanvi",
      contactRole: "Paid Search Coordinator",
      prospectContext: [
        "Tanvi Mhatre",
        "Performance Marketer | Google Ads · Microsoft Ads · Programmatic · Display | Documenting & building my career in public",
        "Paid Search Coordinator",
        "Hush",
        "Now works at Hush managing paid search, display, YouTube, and programmatic campaigns across Google Ads, Microsoft Ads, and SA360.",
        "Hands-on across campaign strategy, optimisation, and performance reporting.",
        "Also documents her marketing career in public.",
        "Wanted to be a doctor.",
        "Chemistry degree.",
        "Forensic science diploma.",
        "Anchoring qualification.",
        "Moved to London at 22.",
      ].join("\n"),
    });

    expect(intelligence.selectedInsights.map((insight) => insight.text).slice(0, 3)).toEqual([
      "Now works at Hush managing paid search, display, YouTube, and programmatic campaigns across Google Ads, Microsoft Ads, and SA360.",
      "Hands-on across campaign strategy, optimisation, and performance reporting.",
      "Also documents her marketing career in public.",
    ]);
    expect(intelligence.selectedInsights[0]?.text).not.toMatch(/^Performance Marketer \|/i);
    expect(intelligence.selectedInsights.map((insight) => insight.text).join(" ")).not.toMatch(
      /wanted to be a doctor|chemistry|forensic|anchoring|moved to london/i,
    );
  });

  it("selects commercially useful top facts across varied prospect contexts", () => {
    const cases = [
      {
        label: "strong paid-search responsibilities",
        facts: [
          "Performance Marketer | Google Ads · Microsoft Ads · Programmatic · Display",
          "Manages paid search across Google Ads, Microsoft Ads, and SA360.",
          "Has a chemistry degree.",
        ],
        expectedTop: /manages paid search across google ads, microsoft ads, and sa360/i,
      },
      {
        label: "AI automation interest",
        facts: [
          "Exploring AI and automation for paid-search decisions.",
          "Likes building personal productivity systems.",
          "Head of Growth | SaaS | AI",
        ],
        expectedTop: /ai and automation for paid-search decisions/i,
      },
      {
        label: "international expansion",
        facts: [
          "Expanded paid search into five international markets this year.",
          "Moved to London at 22.",
          "Senior Performance Marketer",
        ],
        expectedTop: /international markets/i,
      },
      {
        label: "efficiency pressure",
        facts: [
          "Under budget pressure to improve paid-search efficiency without losing coverage.",
          "Documents career lessons publicly.",
          "Marketing Lead",
        ],
        expectedTop: /budget pressure.*paid-search efficiency/i,
      },
      {
        label: "strong SERP adjacent evidence",
        facts: [
          "Reviewing branded SERP changes for high-CPC terms each week.",
          "Studied forensic science.",
          "Performance Marketer | Search",
        ],
        expectedTop: /branded serp changes/i,
      },
      {
        label: "weak context",
        facts: ["Paid Search Manager", "Hush", "About"],
        expectedTop: undefined,
      },
      {
        label: "only title company",
        facts: ["Senior Paid Search Manager", "RetailCo"],
        expectedTop: undefined,
      },
      {
        label: "irrelevant personal history",
        facts: [
          "Wanted to be a doctor before moving into marketing.",
          "Has a forensic science diploma.",
          "Runs Google Ads budget reviews.",
        ],
        expectedTop: /google ads budget reviews/i,
      },
      {
        label: "noisy LinkedIn headline",
        facts: [
          "Head of Growth | SaaS | AI | Advisor | Speaker",
          "Owns paid acquisition reporting across Google Ads and Bing.",
        ],
        expectedTop: /owns paid acquisition reporting/i,
      },
      {
        label: "multiple plausible facts",
        facts: [
          "Leads performance reporting for branded-search campaigns.",
          "Testing automation for bid changes.",
          "Recently promoted to Growth Lead.",
        ],
        expectedTop: /branded-search campaigns|automation for bid changes/i,
      },
    ];

    const ranked = cases.map((item) => ({
      label: item.label,
      top3: rankProspectInsights(item.facts, input).map((insight) => insight.text),
      expectedTop: item.expectedTop,
    }));

    for (const item of ranked) {
      if (!item.expectedTop) {
        expect(item.top3, item.label).toEqual([]);
        continue;
      }
      expect(item.top3[0], item.label).toMatch(item.expectedTop);
      expect(item.top3[0], item.label).not.toMatch(/\|.*\||wanted to be|forensic|chemistry|^hush$/i);
    }
  });

  it("interprets current company and historical background without projecting history onto the current account", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      companyName: "Buildots",
      contactFirstName: "Shachar",
      contactRole: "CMO",
      prospectContext: [
        "Shachar Radin Shomrat",
        "Current:",
        "CMO @ Buildots",
        "B2B SaaS, performance-driven growth marketing, paid search, marketing automation, demand generation, data-driven and analytical.",
        "Historical:",
        "5 years at McCann Erickson.",
        "Built demand generation at Voxbone.",
        "During tenure as CMO at myThings led performance marketing.",
      ].join("\n"),
    });

    expect(intelligence.contextInterpretation.currentCompany).toBe("Buildots");
    expect(intelligence.contextInterpretation.currentRole).toBe("CMO");
    expect(intelligence.contextInterpretation.historicalCompanies.map((item) => item.text)).toContain("McCann Erickson");
    expect(intelligence.contextInterpretation.historicalCompanies.map((item) => item.text)).toContain("Voxbone");
    expect(intelligence.contextInterpretation.historicalCompanies.map((item) => item.text)).toContain("myThings");
    expect(intelligence.selectedInsights[0]?.text).toMatch(/B2B SaaS|performance-driven growth|paid search/i);
    expect(intelligence.selectedInsights[0]?.temporalStatus).not.toBe("HISTORICAL");
  });

  it("keeps Tanvi's current paid-search context above unrelated personal history", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      companyName: "Hush",
      contactFirstName: "Tanvi",
      contactRole: "Paid Search Coordinator",
      prospectContext: [
        "Tanvi Mhatre",
        "Current:",
        "Paid Search Coordinator at Hush.",
        "Manages paid search across Google Ads, Microsoft Ads, and SA360.",
        "Hands-on campaign optimisation and performance reporting.",
        "Historical/personal:",
        "Wanted to be a doctor.",
        "Chemistry degree.",
        "Forensic science diploma.",
        "Moved to London at 22.",
      ].join("\n"),
    });

    expect(intelligence.contextInterpretation.currentCompany).toBe("Hush");
    expect(intelligence.contextInterpretation.currentRole).toBe("Paid Search Coordinator");
    expect(intelligence.selectedInsights.map((insight) => insight.text).slice(0, 2)).toEqual([
      "Manages paid search across Google Ads, Microsoft Ads, and SA360.",
      "Hands-on campaign optimisation and performance reporting.",
    ]);
    expect(intelligence.contextInterpretation.personalBackground.map((item) => item.text).join(" ")).toMatch(
      /doctor|chemistry|forensic|London/i,
    );
  });

  it("handles varied current and historical contexts without unsupported historical-to-current projection", () => {
    const cases = [
      {
        label: "current CMO with historical agency background",
        context: "Current:\nCMO @ Constructly\nRuns B2B SaaS demand generation and performance marketing.\nHistorical:\n6 years at a creative agency managing client accounts.",
        company: "Constructly",
        role: "CMO",
        historical: /creative agency/i,
        top: /B2B SaaS demand generation|performance marketing/i,
      },
      {
        label: "current paid-search manager with academic history",
        context: "Current:\nPaid Search Manager at RetailFlow.\nOwns Google Ads and Microsoft Ads reporting.\nHistorical:\nStudied chemistry and forensic science.",
        company: "RetailFlow",
        role: "Paid Search Manager",
        historical: /chemistry|forensic/i,
        top: /Google Ads and Microsoft Ads reporting/i,
      },
      {
        label: "founder with previous enterprise role",
        context: "Current:\nFounder @ LedgerPath\nFocused on efficient acquisition for B2B buyers.\nHistorical:\nPreviously led enterprise marketing at CloudScale.",
        company: "LedgerPath",
        role: "Founder",
        historical: /CloudScale/i,
        top: /efficient acquisition/i,
      },
      {
        label: "growth leader with previous expansion",
        context: "Current:\nGrowth Lead at FitMarket.\nImproving paid-search efficiency.\nHistorical:\nExpanded international campaigns at a prior company.",
        company: "FitMarket",
        role: "Growth Lead",
        historical: /international campaigns/i,
        top: /paid-search efficiency/i,
      },
      {
        label: "current agency employee",
        context: "Current:\nPPC Team Lead at North Agency.\nManages multiple client accounts across Google Ads and Bing.\nHistorical:\nStarted in SEO.",
        company: "North Agency",
        role: "PPC Team Lead",
        historical: /SEO/i,
        top: /multiple client accounts/i,
      },
      {
        label: "in-house marketer with previous agency background",
        context: "Current:\nPerformance Marketing Manager at HomeCart.\nOwns branded paid search.\nHistorical:\nPreviously worked at an agency managing client accounts.",
        company: "HomeCart",
        role: "Performance Marketing Manager",
        historical: /agency managing client accounts/i,
        top: /branded paid search/i,
      },
      {
        label: "recent job change",
        context: "Current:\nRecently joined DataDock as Head of Demand Generation.\nFocused on pipeline quality.\nHistorical:\nFormer VP Marketing at OldStack.",
        company: "DataDock",
        role: "Head of Demand Generation",
        historical: /OldStack/i,
        top: /pipeline quality/i,
      },
      {
        label: "many previous employers",
        context: "Current:\nDigital Marketing Director at BrightOps.\nRuns performance reporting.\nHistorical:\nPreviously at AlphaCo, BetaCo, and GammaCo.",
        company: "BrightOps",
        role: "Digital Marketing Director",
        historical: /AlphaCo|BetaCo|GammaCo/i,
        top: /performance reporting/i,
      },
      {
        label: "weak current role context",
        context: "Current:\nMarketing Lead @ QuietCRM\nHistorical:\nBuilt growth programs at a previous employer.",
        company: "QuietCRM",
        role: "Marketing Lead",
        historical: /previous employer/i,
        top: /Marketing Lead|growth programs/i,
      },
      {
        label: "ambiguous dates",
        context: "Head of Growth @ PagePilot\nWorked on Google Ads reporting.\nEarlier role at DemoWare.",
        company: "PagePilot",
        role: "Head of Growth",
        historical: /DemoWare/i,
        top: /Google Ads reporting/i,
      },
    ];

    for (const item of cases) {
      const intelligence = buildProspectIntelligence({
        ...input,
        companyName: item.company,
        contactRole: "Head of Performance Marketing",
        prospectContext: item.context,
      });
      const interpreted = interpretProspectContext(
        { ...input, companyName: item.company, prospectContext: item.context },
        intelligence.relevantFacts,
      );

      expect(interpreted.currentCompany, item.label).toBe(item.company);
      expect(interpreted.currentRole, item.label).toContain(item.role.split(" ")[0]);
      expect(JSON.stringify(interpreted.historicalExperience), item.label).toMatch(item.historical);
      expect(intelligence.selectedInsights[0]?.text ?? `${intelligence.jobTitle} at ${intelligence.companyName}`, item.label).toMatch(item.top);
      expect(intelligence.selectedInsights[0]?.text ?? "", item.label).not.toMatch(/managing client accounts.*previously|prior company/i);
    }
  });
});
