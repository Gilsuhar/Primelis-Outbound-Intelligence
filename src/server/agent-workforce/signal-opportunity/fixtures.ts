import "server-only";
import { createHash } from "node:crypto";
import type { SignalEvidence, SearchEvidence } from "@/features/agent-workforce/signal-opportunity";
import type { CompanyJob } from "../company-queue/contracts";
import { fixtureExecutor, fixtureCompanies } from "../company-queue/fixtures";
import { SignalStages, type SignalAdapters } from "./pipeline";
import { searchQuotes } from "./evidence";

export const signalFixtureKnowledge = [
  {
    id: "simulated-product-approval",
    kind: "PRODUCT" as const,
    title: "SIMULATED approved product wording",
    text: "Signal monitors branded Google search conditions and competitor presence.",
    sourceIds: ["simulated-approval"],
    sourceUrls: ["https://knowledge.example/simulated"],
    restrictions: "SIMULATED ONLY. Not approved real product knowledge.",
  },
  {
    id: "simulated-bidding-approval",
    kind: "PRODUCT" as const,
    title: "SIMULATED playbook mechanism for writing evaluation",
    text: "Signal can lower bids or pause ads where configured, then restore coverage when competition returns.",
    sourceIds: ["simulated-approval"],
    sourceUrls: ["https://knowledge.example/simulated"],
    restrictions: "SIMULATED ONLY. Not approved real product knowledge.",
  },
];
export function signalFixtureEvidence(job: CompanyJob, now: Date): SignalEvidence {
  const fixture = fixtureCompanies.find((f) => f.fixture === job.fixture);
  if (
    job.mode !== "SIMULATED" ||
    !fixture ||
    fixture.companyDomain !== job.run.input.companyDomain ||
    fixture.companyName !== job.run.input.companyName
  )
    throw new Error("FIXTURE_NOT_ALLOWED");
  const target = {
    query: fixture.companyName,
    country: "US",
    location: "New York,New York,United States",
    device: "desktop" as const,
  };
  if (job.fixture === "RECOVERY")
    return {
      target,
      blockers: [
        "SIMULATED_DISCONNECTED_INTEGRATIONS: licensed search, contact and SERP inputs unavailable",
      ],
    };
  const search: SearchEvidence = {
    provider: "SIMILARWEB",
    authorized: true,
    recordId: "SIMULATED-export",
    sourceUrl: "https://exports.example/simulated-search",
    companyDomain: fixture.companyDomain,
    country: "US",
    device: "desktop",
    periodStart: new Date(+now - 31 * 86400000).toISOString(),
    periodEnd: new Date(+now - 86400000).toISOString(),
    retrievedAt: now.toISOString(),
    keyword: target.query,
    classification: "BRANDED",
    classificationBasis:
      "Synthetic exact brand keyword classification, not a provider observation.",
    paidSearchVisits: 12000,
    brandedPaidSharePercent: 62,
    visitsDefinition:
      "Estimated paid search visits to this domain in the specified country, device and period",
    shareDefinition:
      "Estimated visits from branded paid keywords divided by all estimated paid search visits, multiplied by 100",
    limitations: [
      "SIMULATED licensed export. Estimates are not ad spend, account analytics or proven savings.",
    ],
    // Explicitly fictional observations have no third-party publication requirement.
    attributionRequired: false,
    excerpt: "",
  };
  search.excerpt = [
    fixture.companyName,
    ...searchQuotes(search),
    search.visitsDefinition,
    search.shareDefinition,
    search.classificationBasis,
    ...search.limitations,
  ].join("\n");
  const ads = [
    { title: "Synthetic brand ad", url: `https://${fixture.companyDomain}/` },
    { title: "Synthetic other advertiser", url: "https://other-advertiser.example/" },
  ];
  const observedAt = now.toISOString();
  return {
    target,
    search,
    blockers: [],
    serp: {
      ...target,
      id:
        "serp:" +
        createHash("sha256")
          .update(target.query + observedAt + JSON.stringify(ads))
          .digest("hex")
          .slice(0, 20),
      observedAt,
      sourceUrl: "https://www.google.com/search?q=" + encodeURIComponent(target.query),
      provider: "SERPAPI",
      ads,
      brandAdvertising: "OBSERVED",
      otherAdvertiserDomains: ["other-advertiser.example"],
      limitation:
        "SIMULATED snapshot; other advertiser is not a verified competitor; no performance or savings measurements.",
      captureRecommendation:
        "Obtain an authorized real dated screenshot matching query, location and device.",
    },
  };
}
export function signalFixtureAdapters(): SignalAdapters {
  return {
    mode: "SIMULATED",
    collect: async (job, now) => signalFixtureEvidence(job, now),
    contact: async (job) =>
      job.fixture === "RECOVERY"
        ? {
            ready: false,
            blockers: ["CONTACT_VERIFICATION_AND_COMPLETE_OUTBOUND_HISTORY_UNAVAILABLE"],
            contact: null,
          }
        : {
            ready: true,
            blockers: [],
            contact: {
              name: "Alex Example (fictional)",
              title: "Head of Paid Search",
              reason:
                "SIMULATED independent current employment, explicit Paid Search remit, validated email, owned ICP, suppression and four-calendar-month history clearance; no real person qualified.",
              sourceUrl: "https://professional.example/simulated-verification",
            },
          },
    knowledge: async (job) => (job.fixture === "RECOVERY" ? [] : signalFixtureKnowledge),
    runtime: (job) => ({
      mode: "SIMULATED",
      reader: async () => {
        throw new Error("NETWORK_FORBIDDEN_IN_FIXTURE");
      },
      withAccounting: (work) => work(),
      model: {
        discover: async () => {
          throw new Error("GENERIC_DISCOVERY_NOT_USED");
        },
        structured: async (_stage, schema, _instruction, raw) => {
          const input = raw as { research: CompanyJob["run"]["research"] };
          const ids = input.research.facts.map((f) => f.id),
            rejected = job.fixture === "UNSUPPORTED";
          return schema.parse({
            identityMatches: true,
            supportedFactIds: rejected ? ids.slice(1) : ids,
            rejectedFactIds: rejected ? ids.slice(0, 1) : [],
            concerns: rejected
              ? [
                  {
                    severity: "BLOCKING",
                    code: "NUMERIC_OR_PERIOD_CONTEXT",
                    scope: "FACT",
                    reason:
                      "Simulated independent reviewer cannot corroborate the estimate's provider methodology; hold the candidate, never force acceptance.",
                    factIds: ids.slice(0, 1),
                    sourceIds: input.research.facts[0].sourceIds,
                  },
                ]
              : [],
          });
        },
      },
    }),
  };
}
export const signalFixtureExecutor = () =>
  new SignalStages(signalFixtureAdapters(), fixtureExecutor());
