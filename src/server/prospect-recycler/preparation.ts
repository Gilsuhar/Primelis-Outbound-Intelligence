import "server-only";
import { createHash } from "node:crypto";
import type { RecyclerInput } from "@/features/prospect-recycler/contracts";
import type { QualificationEvidence } from "@/features/prospect-recycler/qualification";
import { evaluateQualifiedRecyclerBatch } from "@/features/prospect-recycler/qualification";
import type { RecyclerPreparation } from "@/features/prospect-recycler/preparation";
import type { CompanyJob } from "../agent-workforce/company-queue/contracts";
import type { KnowledgeRecord } from "@/features/agent-workforce/gate-a-contracts";
import { evaluateSignal } from "../agent-workforce/signal-opportunity/evaluation";
import { assessSignalPacket } from "../agent-workforce/signal-opportunity/packet-evals";

/** Connects existing Recycler and Signal agents. Pure projection: no providers, jobs or persistence.
 * Inputs are trusted server-owned records, never browser-supplied clearance or model assertions. */
export function prepareRecyclerCandidate(options: {
  input: RecyclerInput;
  qualification: QualificationEvidence;
  name: string;
  asOf: string;
  mode: "SIMULATED" | "LIVE";
  job?: CompanyJob;
  knowledge: KnowledgeRecord[];
  binding?: { hubspotId: string; jobId: string; checkedAt: string };
}): RecyclerPreparation {
  const { input, qualification, job, binding, asOf, mode } = options;
  const decision = evaluateQualifiedRecyclerBatch(
    [input],
    { [input.candidateId]: qualification },
    asOf,
  )[0];
  const result: RecyclerPreparation = {
    version: createHash("sha256")
      .update(
        JSON.stringify({
          input,
          qualification,
          job,
          binding,
          asOf,
          mode,
          knowledge: options.knowledge,
        }),
      )
      .digest("hex"),
    evaluatedAt: asOf,
    mode,
    research: "MISSING",
    drafting: "MISSING",
    humanReview: "PENDING",
    canSend: false,
    canEnroll: false,
    reasons: [],
    brief: [],
    emails: [],
    quality: { checksPassed: false, wordsPerEmail: [], concerns: [] },
    screenshot: {
      status: "MISSING",
      instruction:
        "No screenshot available. Obtain a current authorized capture matching the exact brand, query, market and device; a screenshot cannot prove CPC overspending.",
    },
  };
  const topics = [
    "Company overview",
    "Search responsibilities",
    "Branded Search opportunity",
    "SERP observations",
    "Branded CPC efficiency",
    "Similarweb insights",
    "Messaging angle",
    "Evidence freshness",
  ];
  result.brief = topics.map((topic) => ({
    topic,
    status: "MISSING",
    text: "Evidence unavailable; no claim inferred.",
    sources: [],
  }));
  if (decision.status !== "ELIGIBLE") {
    result.research = "BLOCKED";
    result.drafting = "BLOCKED";
    result.reasons = decision.reasons.map((r) => r.code);
    return result;
  }
  if (!job?.signalEvidence || !job.signalReport) {
    result.reasons.push("RESEARCH_NOT_AVAILABLE");
    return result;
  }
  const same = (a: string | undefined, b: string | undefined) =>
    !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  const hubspotId = input.identity.records.find((r) => r.system === "HUBSPOT")?.id;
  const boundAt = Date.parse(binding?.checkedAt ?? "");
  if (
    !binding ||
    binding.hubspotId !== hubspotId ||
    binding.jobId !== job.id ||
    !Number.isFinite(boundAt) ||
    boundAt > Date.parse(asOf) ||
    Date.parse(asOf) - boundAt > 86400000 ||
    job.mode !== mode ||
    !same(job.run.input.companyDomain, input.identity.employerDomain) ||
    !same(job.run.input.companyName, qualification.company?.name) ||
    !same(job.signalReport.contact?.name, options.name) ||
    !same(job.signalReport.contact?.title, qualification.responsibility?.title)
  ) {
    result.reasons.push("RESEARCH_IDENTITY_OR_MODE_MISMATCH");
    result.drafting = "BLOCKED";
    return result;
  }
  const report = evaluateSignal(
    job.run,
    job.signalEvidence,
    { ready: true, blockers: [], contact: job.signalReport.contact },
    options.knowledge,
    new Date(asOf),
    mode,
  );
  const assessed = assessSignalPacket(job.run, report, new Date(asOf));
  if (report.eligibility !== "Eligible" || assessed.status !== "DETERMINISTIC_CHECKS_PASS") {
    result.reasons = report.blockers.length ? report.blockers : ["DRAFT_QUALITY_REVIEW_REQUIRED"];
    result.quality.concerns = "editorialIssues" in assessed ? (assessed.editorialIssues ?? []) : [];
    result.drafting = "NEEDS_REVISION";
    return result;
  }
  result.research = "COMPLETE";
  result.drafting = "READY_FOR_REVIEW";
  const sources = [...new Set(job.run.research.sources.map((s) => s.url))];
  const insight = (index: number) => report.insights[index]?.statement ?? "Evidence unavailable.";
  result.brief = [
    {
      topic: topics[0],
      status: "MISSING",
      text: "A broader company overview is not included in this Search evidence packet.",
      sources: [],
    },
    {
      topic: topics[1],
      status: "SUPPORTED",
      text: `${qualification.responsibility!.title}; Search responsibility verified by ${qualification.responsibility!.source}.`,
      sources: [report.contact!.sourceUrl],
    },
    { topic: topics[2], status: "SUPPORTED", text: insight(1), sources },
    {
      topic: topics[3],
      status: "SUPPORTED",
      text: insight(2),
      sources: [job.signalEvidence.serp!.sourceUrl],
    },
    {
      topic: topics[4],
      status: "HYPOTHESIS",
      text: "Check whether branded bids could be lower when competitive pressure drops. CPC, spend and achievable savings are not established.",
      sources: [],
    },
    {
      topic: topics[5],
      status: "SUPPORTED",
      text: insight(0),
      sources: [job.signalEvidence.search!.sourceUrl],
    },
    {
      topic: topics[6],
      status: "HYPOTHESIS",
      text: report.hypothesis ?? "Explore efficient branded bidding.",
      sources: [],
    },
    {
      topic: topics[7],
      status: "SUPPORTED",
      text: `SERP observed ${job.signalEvidence.serp!.observedAt}; search evidence retrieved ${job.signalEvidence.search!.retrievedAt}.`,
      sources,
    },
  ];
  result.emails = report.emails
    .slice(0, 2)
    .map((email) => ({ subject: email.subject, body: email.body, evidenceIds: email.factIds }));
  result.quality = {
    checksPassed: true,
    wordsPerEmail: result.emails.map((email) => email.body.split(/\s+/).filter(Boolean).length),
    concerns: [
      "Human semantic and commercial review required; deterministic checks do not authorize sending.",
    ],
  };
  result.screenshot = {
    status: "RECOMMENDED",
    sourceUrl: job.signalEvidence.serp!.sourceUrl,
    instruction: `Capture ${job.signalEvidence.target.query} in ${job.signalEvidence.target.location} on ${job.signalEvidence.target.device}, matching the observation at ${job.signalEvidence.serp!.observedAt}. No screenshot is attached; this does not establish overspending.`,
  };
  return result;
}
