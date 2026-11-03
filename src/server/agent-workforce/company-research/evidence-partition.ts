import "server-only";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { validateResearch } from "../evidence-validation";

const contextGap = "Company identity and business context are not supported";
const factIssue = (issue: string) =>
  /^(Low-confidence fact requires research|Fact lacks quoted source support|Quote does not occur in its actual source): /.test(
    issue,
  );
const privateText =
  /@|Bearer\s|\bsk-|postgres(?:ql)?:\/\/|password|api[_ -]?key|token|secret|\+?\d[\d(). -]{8,}\d/i;
const retain = (text: string, max: number) =>
  privateText.test(text) ? "[omitted: potentially sensitive]" : text.slice(0, max);

/** Partition only fact-local failures. Shared identity/source/duplicate defects still fail closed.
 * A surviving quote is a candidate, never semantic acceptance; independent review is mandatory.
 */
export function partitionCompanyEvidence(run: WorkforceRun, now: Date) {
  const allIssues = validateResearch(run, now, { company: true, prospect: false });
  const globalIssues = allIssues.filter((issue) => !factIssue(issue) && issue !== contextGap);
  const accepted: WorkforceRun["research"]["facts"] = [];
  const rejected = [];
  const quarantined = [];
  const sources = new Map(run.research.sources.map((source) => [source.id, source]));
  for (const [index, fact] of run.research.facts.entries()) {
    // A claim may cite several excerpts. Quarantine each invalid quote, and retain only
    // original source IDs with at least one exact quote. Never infer or repair an ID.
    const exactQuotes = fact.quotes.filter(
      (quote) =>
        fact.sourceIds.includes(quote.sourceId) &&
        !!sources.get(quote.sourceId)?.excerpt.includes(quote.text),
    );
    const exactQuoteSet = new Set(exactQuotes);
    const invalidQuotes = fact.quotes.filter((quote) => !exactQuoteSet.has(quote));
    const citationSourceIds = fact.sourceIds.filter((id) =>
      exactQuotes.some((quote) => quote.sourceId === id),
    );
    const citationFilteredFact = {
      ...fact,
      sourceIds: citationSourceIds,
      quotes: exactQuotes,
    };
    if (invalidQuotes.length) {
      quarantined.push({
        factId: /^account:[A-Za-z0-9:_-]{1,140}$/.test(fact.id) && !privateText.test(fact.id)
          ? fact.id
          : `candidate-${index + 1}`,
        statement: retain(fact.statement, 800),
        sourceIds: [...new Set(invalidQuotes.map((quote) => quote.sourceId))]
          .slice(0, 8)
          .map((id) => (/^web:[a-f0-9]{20}$/.test(id) ? id : "unknown-source")),
        quotes: invalidQuotes.map((quote) => ({
          sourceId: /^web:[a-f0-9]{20}$/.test(quote.sourceId) ? quote.sourceId : "unknown-source",
          text: retain(quote.text, 1000),
          exactMatch: false as const,
        })).slice(0, 4),
        reasons: [
          "Invalid quotations were quarantined; the unchanged claim and remaining exact citations require independent grounding.",
        ],
      });
    }
    const issues = validateResearch({
      ...run,
      research: { ...run.research, facts: [citationFilteredFact] },
    }, now, {
      company: true,
      prospect: false,
    }).filter(factIssue);
    if (fact.subject !== "ACCOUNT" || !fact.id.startsWith("account:"))
      issues.push("Company-only research cannot establish contact facts or responsibilities");
    if (globalIssues.length || issues.length || !exactQuotes.length) {
      rejected.push({
        factId:
          /^account:[A-Za-z0-9:_-]{1,140}$/.test(fact.id) && !privateText.test(fact.id)
            ? fact.id
            : `candidate-${index + 1}`,
        statement: retain(fact.statement, 800),
        sourceIds: fact.sourceIds
          .slice(0, 8)
          .map((id) => (/^web:[a-f0-9]{20}$/.test(id) ? id : "unknown-source")),
        quotes: fact.quotes.map((quote) => ({
          sourceId: /^web:[a-f0-9]{20}$/.test(quote.sourceId) ? quote.sourceId : "unknown-source",
          text: retain(quote.text, 1000),
          exactMatch:
            fact.sourceIds.includes(quote.sourceId) &&
            !!run.research.sources
              .find((s) => s.id === quote.sourceId)
              ?.excerpt.includes(quote.text),
        })),
        reasons: [...globalIssues, ...issues].map((s) => retain(s, 300)).slice(0, 10),
      });
    } else accepted.push(citationFilteredFact);
  }
  const gaps = validateResearch({ ...run, research: { ...run.research, facts: accepted } }, now, {
    company: true,
    prospect: false,
  });
  return {
    accepted,
    rejected: rejected.slice(0, 12),
    quarantined: quarantined.slice(0, 12),
    globalIssues,
    gaps,
  };
}
