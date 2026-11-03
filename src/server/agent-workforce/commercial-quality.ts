import "server-only";
import type { WorkforceRun, WorkforceSequence } from "@/features/agent-workforce/gate-a-contracts";

/** Shared decision rubric, not a message template or an instruction to invent account problems. */
export const commercialRelevanceRubric =
  "Commercial relevance test: explain why this company, why this individual, which branded-search decision is worth discussing, what exact evidence supports it, and why replying would be useful. A product launch, international presence or generic growth story is context, not proof of an advertising problem. Connect context to a concrete decision (coverage by query/market, defensive bidding, or paid/organic incrementality) as a hypothesis with a stated unknown. Do not assume a Growth executive owns Search or that a CMO operates bids. Separate verified responsibilities from title-based inference. Prefer one strong decision question over a list of benefits. Consider the buyer's likely objection and offer a useful, low-effort next exchange, not a dashboard tour. NO_PITCH is appropriate when neither verified business context nor relevant responsibility supports a useful inquiry.";

export const cloudDraftingStyle =
  "Keep outbound short, direct and grounded in the recipient's verified responsibility. Focus on the possibility of reducing branded CPC, never invented savings or guaranteed unchanged conversions. Explain minute-by-minute SERP monitoring only when approved product evidence supports that cadence. Do not automatically offer free three-day monitoring or insert calendar links. When a meeting CTA fits, prefer a specific 15-minute discussion of the supported Search decision; do not force a meeting ask into every follow-up. Screenshots must match the target brand, query, market, device and observation time. Research completed, draft generated, human reviewed and explicitly approved for sending are separate states; drafting never authorizes outbound. ";

export const writingQualityRubric = cloudDraftingStyle +
  "Editorial test: would this still make sense unchanged for an unrelated company or buyer? If yes, rethink the commercial premise, not just the salutation. Use a useful observation or clearly qualified hypothesis, not a generic compliment, title recital or manufactured pain. Each touch must earn its place with a new decision, supporting perspective or respectful close; do not restate the opener or explain Signal four times. Prefer one clear low-friction request when a request is useful; do not stack a meeting, demo, calendar link and data request. A reply with a perspective or permission to share something can be enough. No mandatory CTA in the closing. Keep roughly 55–100 words when useful, and shorter when stronger; no rigid word-count test. Avoid corporate filler, overfamiliarity, fake urgency and unsupported promises. Preserve a coherent thread while varying openings and sentence rhythm. A question is not a license to smuggle an invented premise: 'Why are competitors taking your traffic?' still alleges an unverified condition.";

/** Only the simple internal writer/reviewer use this calibration. Examples remain style, not proof. */
export const internalSalesWritingStandard = cloudDraftingStyle +
  "Editorial priority: use the supplied Gil examples for brevity and commercial clarity, never as factual authority or sentence templates. For cold first touches, give the reply-observed loveholidays-cold-reply example primary style weight: its direct question, plain Signal explanation and easy close are a style benchmark, not copy to reuse. " +
  "Choose the strongest defensible angle independently. Use verified company or personal context only when it naturally makes the business question more relevant; omit unrelated launches, expansion or company facts. When research is thin, a clear product-led question is stronger than forced personalization. " +
  "In the opening email, explain one relevant mechanism from supplied approved product knowledge in ordinary language and connect it to a practical benefit. Depending on that knowledge, this may mean monitoring branded Google/Bing results, identifying when the brand is the only advertiser or competitors are present, and lowering bids or pausing where supported/configured to avoid paying more than needed while keeping protection when competition matters. Do not list every function or imply the account has these conditions. Protecting performance is an objective, never a guarantee. " +
  "Prefer a useful business question over abstract phrases such as 'coverage decisions', 'current search conditions', or 'performance preservation as the goal'. Safety guidance is for the writer, not customer-facing copy: keep claims accurate without repeating configuration caveats or research disclaimers in every email. " +
  "Write three brief, natural follow-ups that do not repeat the full product explanation. Add a distinct useful point only when supported by approved product knowledge or relevant evidence; otherwise make the follow-up or close simple and human. Avoid stock transitions like 'one thing worth calling out' or 'the other useful part'. Use a natural low-pressure CTA, without stacking asks. This is guidance, not a fixed four-step structure. " +
  "Use one relevant customer example only when the supplied knowledge includes its exact approved result, metric and external-use permission; otherwise omit proof. Never infer approval from a style example. Keep citations and research limitations in the internal review unless attribution is needed for truthful copy.";

export const internalSalesReviewStandard =
  "Judge the copy against the supplied Gil examples, not merely against schema validity or absence of fabricated facts. Factual safety is necessary but does not earn an editorial PASS. " +
  "Inspect each email: is the offer understandable, is the Signal mechanism concrete, is the benefit meaningful, and is the question easy to answer? " +
  "Set commercialUsefulness=false when vague monitoring/coverage language obscures what the buyer can actually do; do not reward repeated configuration caveats as commercial clarity. " +
  "Set naturalLanguage=false for awkward metaphors, consulting jargon or copied internal-policy wording. Set prospectRelevance=false for forced product-list personalization or unsupported leaps from assortment to search complexity. " +
  "Set nonRepetitive=false when follow-ups repeat the same pitch in different words; assess substantive progression, not lexical variation. " +
  "A truthful product-led inquiry may pass without a unique research hook, but must still offer a specific useful conversation. No customer proof is better than unapproved proof. " +
  "For every editorial failure, put the email number, exact weak phrase (or pair of repetitive emails), failed criterion and concise reason in concerns; return REVISE, even when all factual checks pass. " +
  "Unsupported assertions or implications still require HOLD and unsupportedAssertions. Do not silently rewrite copy or invent missing support. PASS means both factual and commercial standards were met, not permission to send.";

/** Narrow editorial backstop, not a substitute for semantic quality review. Internal path only. */
export function internalSalesEditorialConcerns(sequence: {
  messages: Pick<WorkforceSequence["messages"][number], "step" | "subject" | "body">[];
}): string[] {
  const issues = editorialConcerns(sequence);
  const caveated = sequence.messages.filter((message) =>
    /\b(?:where|when) configured\b/i.test(message.body),
  );
  if (caveated.length >= 3)
    issues.push(
      `Emails ${caveated.map((message) => message.step).join(", ")} repeat configuration disclaimers instead of expressing the benefit naturally; preserve necessary qualifications without repeating internal policy language`,
    );
  return issues;
}

export function strategyGroundingConcerns(
  run: Pick<WorkforceRun, "research"> & Partial<Pick<WorkforceRun, "writingMode">>,
  strategy: NonNullable<WorkforceRun["strategy"]>,
) {
  if (strategy.angle === "NO_PITCH" || run.writingMode === "INSIGHT_LED") return [];
  const facts = run.research.facts.filter((f) => strategy.supportingFactIds.includes(f.id));
  if (run.writingMode === "EVIDENCE_LED")
    return facts.some(
      (f) =>
        f.subject === "ACCOUNT" &&
        ["BUSINESS_MODEL", "PRODUCTS", "MARKETS", "DEVELOPMENT"].includes(f.category),
    )
      ? []
      : ["Evidence-led strategy needs verified company context"];
  return facts.some(
    (f) =>
      f.subject === "ACCOUNT" &&
      ["BUSINESS_MODEL", "PRODUCTS", "MARKETS", "DEVELOPMENT"].includes(f.category),
  ) &&
    facts.some(
      (f) => f.subject === "PROSPECT" && ["POSITION", "RESPONSIBILITY"].includes(f.category),
    )
    ? []
    : [
        "Strategy must cite both verified company context and prospect relevance; a title alone is not a commercial reason to contact",
      ];
}

/** Narrow, auditable editorial checks complement the independent semantic critic. */
export function editorialConcerns(sequence: {
  messages: Pick<WorkforceSequence["messages"][number], "step" | "subject" | "body">[];
}): string[] {
  const issues: string[] = [];
  const sentences = new Map<string, number>();
  for (const message of sequence.messages) {
    if (/guarantee(?:d)?\b.{0,60}\b(savings|conversions|CPC)|\b(conversions (?:will |stay |remain )unchanged|without (?:any )?(?:conversion loss|losing (?:any )?conversions))\b/i.test(message.body))
      issues.push(`Email ${message.step} makes an unsupported performance guarantee`);
    if (/free.{0,12}(?:three|3)[ -]day|(?:three|3)[ -]day.{0,12}free/i.test(message.body))
      issues.push(`Email ${message.step} offers unapproved free monitoring`);
    if (/https?:\/\/(?:www\.)?(?:calendly\.com|cal\.com)\//i.test(message.body))
      issues.push(`Email ${message.step} includes an automatic calendar link requiring explicit review`);
    if (
      /i hope this email finds you well|revolutionize your strategy|unlock unprecedented savings|game[- ]changing solution|just checking in|bumping this|circling back|impressed by your (?:growth|success|journey)|admire your (?:growth|success|journey)/i.test(
        message.subject + " " + message.body,
      )
    )
      issues.push(`Email ${message.step} needs a more natural, non-generic opening or phrasing`);
    for (const sentence of message.body.split(/(?<=[.!?])\s+|\n+/)) {
      const words = sentence.toLowerCase().match(/[a-z0-9]+/g) ?? [];
      // Short greetings, signatures and shared subjects are not repeated commercial arguments.
      if (words.length < 10) continue;
      const key = words.join(" ");
      const previous = sentences.get(key);
      if (previous && previous !== message.step)
        issues.push(
          `Emails ${previous} and ${message.step} repeat a substantive sentence; add a new reason to reply`,
        );
      else sentences.set(key, message.step);
    }
  }
  return [...new Set(issues)];
}
