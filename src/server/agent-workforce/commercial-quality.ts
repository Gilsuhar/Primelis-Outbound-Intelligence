import "server-only";
import type { WorkforceRun, WorkforceSequence } from "@/features/agent-workforce/gate-a-contracts";

/** Shared decision rubric, not a message template or an instruction to invent account problems. */
export const commercialRelevanceRubric =
  "Commercial relevance test: explain why this company, why this individual, which branded-search decision is worth discussing, what exact evidence supports it, and why replying would be useful. A product launch, international presence or generic growth story is context, not proof of an advertising problem. Connect context to a concrete decision (coverage by query/market, defensive bidding, or paid/organic incrementality) as a hypothesis with a stated unknown. Do not assume a Growth executive owns Search or that a CMO operates bids. Separate verified responsibilities from title-based inference. Prefer one strong decision question over a list of benefits. Consider the buyer's likely objection and offer a useful, low-effort next exchange, not a dashboard tour. NO_PITCH is appropriate when neither verified business context nor relevant responsibility supports a useful inquiry.";

export const writingQualityRubric =
  "Editorial test: would this still make sense unchanged for an unrelated company or buyer? If yes, rethink the commercial premise, not just the salutation. Use a useful observation or clearly qualified hypothesis, not a generic compliment, title recital or manufactured pain. Each touch must earn its place with a new decision, supporting perspective or respectful close; do not restate the opener or explain Signal four times. Prefer one clear low-friction request when a request is useful; do not stack a meeting, demo, calendar link and data request. A reply with a perspective or permission to share something can be enough. No mandatory CTA in the closing. Keep roughly 55–100 words when useful, and shorter when stronger; no rigid word-count test. Avoid corporate filler, overfamiliarity, fake urgency and unsupported promises. Preserve a coherent thread while varying openings and sentence rhythm. A question is not a license to smuggle an invented premise: 'Why are competitors taking your traffic?' still alleges an unverified condition.";

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
export function editorialConcerns(sequence: WorkforceSequence): string[] {
  const issues: string[] = [];
  const sentences = new Map<string, number>();
  for (const message of sequence.messages) {
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
