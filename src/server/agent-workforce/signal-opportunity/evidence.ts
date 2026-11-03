import "server-only";
import { createHash } from "node:crypto";
import {
  signalEvidenceSchema,
  publicEvidenceUrl,
  type SearchEvidence,
  type SignalEvidence,
} from "@/features/agent-workforce/signal-opportunity";
import { sourceSchema, groundedFactSchema } from "@/features/agent-workforce/gate-a-contracts";
import type { CompanyRun } from "@/features/agent-workforce/company-research/contracts";
import { allowedSourceUrl } from "../public-sources";
import { adaptCacheReceipt, projectCachedKeyword } from "../similarweb-cache/adapter";
import type { CacheScope } from "@/features/agent-workforce/similarweb-cache";

export const searchQuotes = (s: SearchEvidence) => [
  `${s.companyDomain}: ${s.paidSearchVisits} estimated paid search visits; ${s.country}, ${s.device}, ${s.periodStart.slice(0, 10)} to ${s.periodEnd.slice(0, 10)}.`,
  `${s.companyDomain}: ${s.brandedPaidSharePercent}% estimated branded share of paid search visits; branded keyword "${s.keyword}"; ${s.country}, ${s.device}, ${s.periodStart.slice(0, 10)} to ${s.periodEnd.slice(0, 10)}.`,
];
const age = (at: string, now: Date, days: number) =>
  Number.isFinite(Date.parse(at)) &&
  Date.parse(at) <= +now &&
  +now - Date.parse(at) <= days * 86400000;
const publicUrl = (url: string) =>
  publicEvidenceUrl.safeParse(url).success && allowedSourceUrl(url);
/** No network requests. Provider adapters must attest licensed access and supply retained source text. */
export function projectSignalEvidence(
  run: CompanyRun,
  raw: SignalEvidence,
  now: Date,
  mode: "SIMULATED" | "LIVE" = "LIVE",
  expectedCacheScope?: CacheScope,
) {
  const evidence = signalEvidenceSchema.parse(raw),
    blockers = [...evidence.blockers];
  const sources: CompanyRun["research"]["sources"] = [],
    facts: CompanyRun["research"]["facts"] = [];
  function add(
    url: string,
    title: string,
    excerpt: string,
    observedAt: string,
    statements: { statement: string; quote: string }[],
  ) {
    const source = sourceSchema.parse({
      id:
        "web:" +
        createHash("sha256")
          .update(url + excerpt)
          .digest("hex")
          .slice(0, 20),
      url,
      title,
      excerpt,
      observedAt,
      sourceType: "AUTHORIZED_PROVIDER",
    });
    sources.push(source);
    statements.forEach(({ statement, quote }) =>
      facts.push(
        groundedFactSchema.parse({
          id: `account:signal-${facts.length + 1}`,
          subject: "ACCOUNT",
          category: "MARKETS",
          statement,
          sourceIds: [source.id],
          confidence: "MEDIUM",
          limitations: [
            "Observation or estimate only; no proven waste, savings, incrementality or buying intent.",
          ],
          quotes: [{ sourceId: source.id, text: quote }],
        }),
      ),
    );
  }
  const s = evidence.search;
  if (evidence.cachedSearch) {
    try {
      if (s || !expectedCacheScope) throw new Error("CACHE_SCOPE_REQUIRED_OR_CONFLICTING_EVIDENCE");
      const receipt = adaptCacheReceipt(evidence.cachedSearch, expectedCacheScope, mode, now);
      if (
        receipt.scope.domain !== run.input.companyDomain ||
        receipt.scope.country !== evidence.target.country ||
        receipt.scope.keyword.toLowerCase() !== evidence.target.query.toLowerCase()
      )
        throw new Error();
      const cached = projectCachedKeyword(receipt);
      sources.push(cached.source);
      facts.push(...cached.facts);
      blockers.push(...cached.blockers);
      // Total devices remains separate from the independently collected SERP device scope.
    } catch {
      blockers.push("CACHE_EVIDENCE_IDENTITY_SCOPE_PERMISSION_OR_INTEGRITY_FAILED");
    }
  }
  if (!s && !evidence.cachedSearch)
    blockers.push("SIMILARWEB_AUTHORIZED_PAID_SEARCH_BRANDED_EXPORT_REQUIRED");
  else if (
    s &&
    (s.companyDomain !== run.input.companyDomain ||
      s.country !== evidence.target.country ||
      s.device !== evidence.target.device ||
      s.keyword.toLowerCase() !== evidence.target.query.toLowerCase() ||
      !publicUrl(s.sourceUrl) ||
      !age(s.retrievedAt, now, 30) ||
      !age(s.periodEnd, now, 90) ||
      Date.parse(s.periodStart) >= Date.parse(s.periodEnd) ||
      Date.parse(s.periodEnd) > Date.parse(s.retrievedAt) ||
      !searchQuotes(s).every((q) => s.excerpt.includes(q)) ||
      !s.excerpt.toLowerCase().includes(run.input.companyName.toLowerCase()) ||
      ![s.visitsDefinition, s.shareDefinition, s.classificationBasis, ...s.limitations].every((v) =>
        s.excerpt.includes(v),
      ))
  )
    blockers.push("SIMILARWEB_IDENTITY_SCOPE_FRESHNESS_OR_EXACT_METRIC_SUPPORT_FAILED");
  else if (s && !evidence.cachedSearch)
    add(
      s.sourceUrl,
      "Authorized Similarweb export: estimates, not account actuals",
      s.excerpt,
      s.retrievedAt,
      searchQuotes(s).map((quote) => ({ statement: quote, quote })),
    );
  const o = evidence.serp;
  if (!o) blockers.push("DATED_LOCATION_SPECIFIC_BRANDED_SERP_REQUIRED");
  else {
    const expectedId =
      "serp:" +
      createHash("sha256")
        .update(o.query + o.observedAt + JSON.stringify(o.ads))
        .digest("hex")
        .slice(0, 20);
    const hosts = o.ads.map((a) => {
      try {
        return new URL(a.url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    });
    const owned = (h: string) =>
      h === run.input.companyDomain || h.endsWith("." + run.input.companyDomain);
    const other = [...new Set(hosts.filter((h) => !owned(h)))].sort();
    if (
      o.id !== expectedId ||
      o.query.toLowerCase() !== evidence.target.query.toLowerCase() ||
      o.country.toUpperCase() !== evidence.target.country ||
      o.location !== evidence.target.location ||
      o.device !== evidence.target.device ||
      !age(o.observedAt, now, 1) ||
      !publicUrl(o.sourceUrl) ||
      new URL(o.sourceUrl).hostname !== "www.google.com" ||
      o.ads.some((a) => !publicUrl(a.url)) ||
      o.brandAdvertising !== (hosts.some(owned) ? "OBSERVED" : "NOT_OBSERVED") ||
      JSON.stringify([...o.otherAdvertiserDomains].sort()) !== JSON.stringify(other)
    )
      blockers.push("SERP_IDENTITY_SCOPE_FRESHNESS_OR_AD_IDENTITY_FAILED");
    else {
      const quote = JSON.stringify({
        query: o.query,
        location: o.location,
        country: o.country,
        device: o.device,
        observedAt: o.observedAt,
        brandAdvertising: o.brandAdvertising,
        otherAdvertiserDomains: o.otherAdvertiserDomains,
      });
      if (quote.length > 1000) blockers.push("SERP_QUOTE_TOO_LARGE");
      else
        add(
          o.sourceUrl,
          "Dated branded Google SERP observation",
          JSON.stringify({
            company: run.input.companyName,
            observation: JSON.parse(quote),
            ads: o.ads,
            limitation: o.limitation,
          }),
          o.observedAt,
          [
            {
              quote,
              statement: `For "${o.query}" in ${o.location} (${o.country}, ${o.device}) at ${o.observedAt}, brand advertising was ${o.brandAdvertising}; other advertiser domains: ${other.join(", ") || "none listed"}. This single snapshot does not establish competitor identity, persistent absence, CPC, CTR, CVR or incrementality.`,
            },
          ],
        );
    }
  }
  return { evidence, blockers: [...new Set(blockers)], sources, facts };
}
