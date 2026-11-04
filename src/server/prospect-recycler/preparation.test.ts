// @vitest-environment node
import { beforeAll, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { CompanyQueue } from "../agent-workforce/company-queue/engine";
import { MemoryQueueStore } from "../agent-workforce/company-queue/test-support";
import { fixtureCompanies } from "../agent-workforce/company-queue/fixtures";
import {
  signalFixtureExecutor,
  signalFixtureKnowledge,
} from "../agent-workforce/signal-opportunity/fixtures";
import type { CompanyJob } from "../agent-workforce/company-queue/contracts";
import { qualifiedFixture, qualificationTime as now } from "@/test/recycler-qualified";
import { prepareRecyclerCandidate } from "./preparation";
import { loadRecyclerReview } from "./review";
import { emptySnapshot } from "./shared";
import type { SupplementalEvidence } from "./types";
let job: CompanyJob;
beforeAll(async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("OFFLINE_ONLY"));
  try {
    const store = new MemoryQueueStore(),
      queue = new CompanyQueue(store, signalFixtureExecutor(), () => new Date(now));
    const { fixture, ...input } = fixtureCompanies[0];
    await queue.enqueue("fictional", input, "recycler-product", fixture, "SIGNAL_OPPORTUNITY_V1");
    for (let i = 0; i < 6; i++) await queue.tick("fictional");
    job = (await store.read("fictional")).jobs[0];
    expect(job.signalReport?.eligibility).toBe("Eligible");
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});
function input() {
  const f = qualifiedFixture(now),
    domain = job.run.input.companyDomain;
  f.input.identity.employerDomain = domain;
  f.input.identity.email = `alex@${domain}`;
  for (const verification of [f.input.emailVerification!, f.input.employmentVerification!]) {
    verification.employerDomain = domain;
    verification.email = f.input.identity.email;
  }
  for (const receipt of Object.values(f.qualification)) receipt.employerDomain = domain;
  f.qualification.company!.name = job.run.input.companyName;
  f.qualification.responsibility!.title = job.signalReport!.contact!.title;
  return {
    ...f,
    name: job.signalReport!.contact!.name,
    asOf: now,
    mode: "SIMULATED" as const,
    job: structuredClone(job),
    knowledge: signalFixtureKnowledge,
    binding: { hubspotId: f.input.identity.records[0].id, jobId: job.id, checkedAt: now },
  };
}
it("completes synthetic collection, qualification, existing research, drafting and pending human review", async () => {
  const options = input(),
    snapshot = emptySnapshot(
      {
        record: options.input.identity.records[0],
        fullName: options.name,
        emails: [options.input.identity.email!],
        email: options.input.identity.email,
        employerDomain: options.input.identity.employerDomain,
      },
      now,
    );
  snapshot.historyTraversal = "COMPLETE";
  snapshot.communications = options.input.communications;
  const proof: SupplementalEvidence = {
    qualification: options.qualification,
    history: options.input.history,
    sequences: options.input.sequences,
    suppressions: options.input.suppressions,
    emailVerification: options.input.emailVerification,
    employmentVerification: options.input.employmentVerification,
  };
  const list = await loadRecyclerReview({
    mode: "DEMO",
    asOf: now,
    source: "HUBSPOT",
    evidence: { [options.input.candidateId]: proof },
    readers: {
      HUBSPOT: {
        system: "HUBSPOT",
        discover: async () => ({
          status: "COMPLETE",
          pages: 1,
          issues: [],
          items: [snapshot.prospect],
        }),
        collect: async () => snapshot,
      },
    },
  });
  expect(list.rows[0].decision.status).toBe("ELIGIBLE");
  const packet = prepareRecyclerCandidate(options);
  expect(packet.quality.concerns.filter((c) => !c.startsWith("Human semantic"))).toEqual([]);
  expect(packet).toMatchObject({
    research: "COMPLETE",
    drafting: "READY_FOR_REVIEW",
    humanReview: "PENDING",
    canSend: false,
    canEnroll: false,
  });
  expect(packet.emails).toHaveLength(2);
  expect(packet.quality.wordsPerEmail.every((n) => n < 110)).toBe(true);
  expect(packet.brief.find((section) => section.topic === "Branded CPC efficiency")?.status).toBe(
    "HYPOTHESIS",
  );
  expect(packet.screenshot.status).toBe("RECOMMENDED");
  mkdirSync("outputs", { recursive: true });
  writeFileSync(
    "outputs/recycler-product-row.json",
    JSON.stringify({ ...list.rows[0], preparation: packet }, null, 2),
  );
});
it.each(["company", "contact", "hubspot", "mode", "stale"])(
  "blocks a mismatched %s research handoff",
  (mismatch) => {
    const options = input();
    if (mismatch === "company") options.job.run.input.companyDomain = "other.example";
    if (mismatch === "contact") options.name = "Another Person";
    if (mismatch === "hubspot") options.binding.hubspotId = "other";
    if (mismatch === "mode") options.job.mode = "LIVE";
    if (mismatch === "stale") options.binding.checkedAt = "2020-01-01T00:00:00Z";
    const result = prepareRecyclerCandidate(options);
    expect(result.drafting).toBe("BLOCKED");
    expect(result.emails).toEqual([]);
  },
);
it("never starts research or drafts for a disqualified candidate", () => {
  const options = input();
  options.qualification.company!.employees = 79;
  const result = prepareRecyclerCandidate(options);
  expect(result.research).toBe("BLOCKED");
  expect(result.emails).toEqual([]);
});
it("keeps missing sources missing and rejects unsupported copy", () => {
  const options = input();
  delete options.job.signalEvidence!.search;
  expect(prepareRecyclerCandidate(options).emails).toEqual([]);
  const other = input();
  other.job.run.research.facts[0].statement = "Guaranteed savings of half your spend";
  expect(prepareRecyclerCandidate(other).emails).toEqual([]);
});
it("versions changed evidence and rechecks eligibility before every handoff", () => {
  const options = input(),
    before = prepareRecyclerCandidate(options);
  options.input.suppressions[0].unsubscribed = true;
  const after = prepareRecyclerCandidate(options);
  expect(after.version).not.toBe(before.version);
  expect(after.emails).toEqual([]);
  expect(before.humanReview).toBe("PENDING");
});
