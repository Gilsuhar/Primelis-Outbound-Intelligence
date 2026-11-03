import { createHash } from "node:crypto";
import { importedPublicEvidenceSchema } from "@/features/agent-workforce/company-research/internal-review";

const PROFILE_URL = "https://ch.linkedin.com/in/alicedebenetti";
const THEORG_URL = "https://theorg.com/org/swarovski/org-chart/alice-de-benetti";
const THEORG_RESOLVED_URL = "https://theorg.com/org/swarovski/person/alice-de-benetti";
const ONE_SEARCH_URL =
  "https://www.linkedin.com/posts/jan-duong_super-proud-of-all-the-hardwork-that-alice-activity-7208398891946258432-NNpd";
const GARTNER_POST_URL =
  "https://www.linkedin.com/posts/silvia-schmucker-12b59816_gartner-has-just-announced-its-digital-iq-activity-7468681128900657153-iER0";

function source(
  url: string,
  resolvedUrl: string | null,
  title: string,
  publisher: string,
  displayedDate: string,
  temporalScope: "HISTORICAL" | "RECENT_RELATIVE_DATE" | "UNDATED_UNVERIFIED_LISTING",
  excerpt: string,
  retrievedAt: string,
) {
  const id = `import:${createHash("sha256")
    .update(url + excerpt)
    .digest("hex")
    .slice(0, 20)}`;
  return {
    id,
    originalUrl: url,
    resolvedUrl,
    title,
    publisher,
    publicationDate: null,
    displayedDate,
    temporalScope,
    retrievedAt,
    excerpt,
    sha256: createHash("sha256").update(excerpt).digest("hex"),
  };
}

/** Snapshot only excerpts actually returned by the connected read-only web viewer. */
export function buildAlicePublicEvidenceImport(capturedAt = new Date()) {
  const retrievedAt = capturedAt.toISOString();
  const theOrgExcerpt =
    "Unverified\nAlice de Benetti\nOne Search Lead (Global)\n" +
    "Alice De Benetti is a seasoned professional with experience in digital marketing, specifically in SEO and search marketing.";
  const oneSearchExcerpt =
    "We're delighted to have bagged SILVER in the Media Innovation category at The Drum Awards Marketing EMEA alongside our client SWAROVSKI. In just 18 months, our integrated media search campaign, One Search, boosted Swarovski's global search performance across 38 markets. The results? 19% growth in incremental revenue, 16% growth in website traffic, with a 14% reduction in paid media investment.";
  const oneSearchIntro =
    "Super proud of all the hardwork that Alice De Benetti and Vinny Karkera, along with our agency partners Jellyfish have put into our One Search strategy. The team continues to innovate and optimise our SEA and SEO channels for a truly wholistic approach and 2024 is looking stronger than ever.";
  const gartnerExcerpt =
    "Gartner has just announced its Digital IQ 2026 Luxury Brands Index, and Swarovski has been ranked #3 Luxury Retail Brand globally, improving from #5 in 2025. This achievement is the result of a truly cross-functional effort, spanning Digital Commerce, Brand, CRM, Digital and beyond - showing what we can accomplish when we align around a common ambition. A big thank you to everyone who contributed to this success. Congratulations to all - Helga Maier, Zeno Scapin, Dirk Linke, Iker Tolosa, Michela Vecchi, Jo Jackson, Andrea Mornata, Nora Groenow, Vittoria Di Stefano, Alice De Benetti, Vinny Karkera, and so many others who have contributed!";
  const sources = [
    source(
      THEORG_URL,
      THEORG_RESOLVED_URL,
      "Alice de Benetti — One Search Lead (Global)",
      "The Org",
      "No publication date shown; profile explicitly labeled Unverified; crawled today.",
      "UNDATED_UNVERIFIED_LISTING",
      theOrgExcerpt,
      retrievedAt,
    ),
    source(
      ONE_SEARCH_URL,
      ONE_SEARCH_URL,
      "Jan Duong LinkedIn post about Swarovski One Search",
      "LinkedIn / Jan Duong and Jellyfish post",
      "LinkedIn displayed ‘2y’; post text references 2024; exact publication date unavailable.",
      "HISTORICAL",
      `${oneSearchIntro}\n\n${oneSearchExcerpt}`,
      retrievedAt,
    ),
    source(
      GARTNER_POST_URL,
      GARTNER_POST_URL,
      "Silvia Schmucker LinkedIn post about Gartner Digital IQ 2026",
      "LinkedIn / Silvia Schmucker",
      "LinkedIn displayed ‘4mo’; exact publication date unavailable.",
      "RECENT_RELATIVE_DATE",
      gartnerExcerpt,
      retrievedAt,
    ),
  ];
  const [org, oneSearch, gartner] = sources;
  return importedPublicEvidenceSchema.parse({
    kind: "PUBLIC_EVIDENCE_IMPORT",
    status: "PENDING_INDEPENDENT_GROUNDING",
    capturedAt: retrievedAt,
    captureMethod: "CONNECTED_WEB_READ_ONLY",
    sources,
    sourceReports: [
      {
        id: "report:org-listing",
        statement:
          "The Org page displays the title One Search Lead (Global) and explicitly labels Alice's profile Unverified; this is an undated third-party listing, not current-role verification.",
        sourceId: org.id,
        exactQuote: "Unverified\nAlice de Benetti\nOne Search Lead (Global)",
        status: "SOURCE_REPORTED_UNVERIFIED",
      },
      {
        id: "report:one-search-intro",
        statement:
          "The historical LinkedIn post credits Alice and describes an integrated SEA/SEO One Search approach, with its text referring to 2024.",
        sourceId: oneSearch.id,
        exactQuote: oneSearchIntro,
        status: "SOURCE_REPORTED_UNVERIFIED",
      },
      {
        id: "report:one-search-results",
        statement:
          "The edited Jellyfish LinkedIn post reports an 18-month One Search campaign across 38 markets and claims 19% incremental-revenue growth, 16% website-traffic growth, and 14% lower paid-media investment; outcomes are not independently verified.",
        sourceId: oneSearch.id,
        exactQuote: oneSearchExcerpt,
        status: "SOURCE_REPORTED_UNVERIFIED",
      },
      {
        id: "report:gartner-post",
        statement:
          "A recent LinkedIn post claims Swarovski ranked #3 in Gartner's 2026 Luxury Brands Index, up from #5 in 2025, and tags Alice among contributors; the ranking is not independently verified and the tag does not establish her current title or duties.",
        sourceId: gartner.id,
        exactQuote: gartnerExcerpt,
        status: "SOURCE_REPORTED_UNVERIFIED",
      },
    ],
    unavailableSources: [{ url: PROFILE_URL, checkedAt: retrievedAt, code: "HTTP_429" }],
    aliceCurrentEmployment: "UNKNOWN",
    aliceCurrentTitle: "UNKNOWN",
    aliceCurrentResponsibilities: "UNKNOWN",
  });
}
