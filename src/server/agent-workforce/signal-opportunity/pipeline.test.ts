// @vitest-environment node
import { expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { CompanyQueue } from "../company-queue/engine";
import { MemoryQueueStore } from "../company-queue/test-support";
import { parseQueue } from "../company-queue/contracts";
import { fixtureCompanies, fixtureExecutor } from "../company-queue/fixtures";
import { scheduleSignalFixtureCohort } from "../company-queue/schedule";
import { signalFixtureAdapters, signalFixtureExecutor, signalFixtureKnowledge } from "./fixtures";
import { SignalStages } from "./pipeline";
import { projectSignalEvidence } from "./evidence";
import { evaluateSignal } from "./evaluation";
import type { SignalEvidence } from "@/features/agent-workforce/signal-opportunity";
import {
  signalEvidenceSchema,
  signalReportSchema,
} from "@/features/agent-workforce/signal-opportunity";
const now = new Date("2026-10-19T12:00:00.000Z");

it("rejects private or credential-bearing evidence before a durable checkpoint, and inconsistent draft approval", async () => {
  const { jobs } = await cohort();
  const evidence = structuredClone(jobs[0].signalEvidence!);
  evidence.serp!.ads[0].url += "?access_token=fictional-test-value";
  expect(signalEvidenceSchema.safeParse(evidence).success).toBe(false);
  const privateText = structuredClone(jobs[0].signalEvidence!);
  privateText.search!.excerpt += "\nprivate-person@example.com";
  expect(signalEvidenceSchema.safeParse(privateText).success).toBe(false);
  const report = structuredClone(jobs[0].signalReport!);
  report.emails[0].body += "\npassword=fictional-test-value";
  expect(signalReportSchema.safeParse(report).success).toBe(false);
  report.emails[0].body = "A harmless question";
  report.eligibility = "HOLD";
  expect(signalReportSchema.safeParse(report).success).toBe(false);
});
async function cohort() {
  const store = new MemoryQueueStore();
  let queue = new CompanyQueue(store, signalFixtureExecutor(), () => now);
  await scheduleSignalFixtureCohort(queue, "fixture", now);
  await scheduleSignalFixtureCohort(queue, "fixture", now);
  for (let i = 0; i < 15; i++) {
    await queue.tick("fixture");
    // Recreate the worker and validate serialized durable state at every checkpoint.
    const reopened = parseQueue(JSON.parse(JSON.stringify(await store.read("fixture"))));
    await store.change("fixture", (state) => Object.assign(state, reopened));
    queue = new CompanyQueue(store, signalFixtureExecutor(), () => now);
  }
  return { store, jobs: (await store.read("fixture")).jobs };
}
it("completes three unattended Signal jobs, preserves checkpoints, prevents duplicates and generates only gated drafts", async () => {
  const { jobs } = await cohort();
  expect(jobs).toHaveLength(3);
  expect(jobs.map((j) => j.status)).toEqual(["COMPLETE", "COMPLETE", "COMPLETE"]);
  expect(
    jobs.map((j) => j.signalReport?.eligibility),
    JSON.stringify({ report: jobs[0].signalReport, judgement: JSON.parse(jobs[0].judgement!) }),
  ).toEqual(["Eligible", "HOLD", "HOLD"]);
  expect(jobs.map((j) => j.signalReport?.emails.length)).toEqual([4, 0, 0]);
  expect(jobs[0].signalReport?.insights).toHaveLength(3);
  expect(jobs[0].signalReport?.judgement).toMatchObject({
    factualCoverage: 100,
    opportunityCoverage: 80,
  });
  expect(jobs[1].run.groundingAudit?.status).toBe("REJECTED");
  expect(jobs[1].signalReport?.insights).toEqual([]);
  expect(jobs[2].signalReport?.blockers.join(" ")).toMatch(/SIMILARWEB.*SERP/);
  for (const j of jobs) {
    expect(j.run.usage).toEqual([]);
    expect(j.signalReport).toMatchObject({
      mode: "SIMULATED",
      approved: false,
      canSend: false,
      canEnroll: false,
      provenSavings: null,
    });
  }
  if (process.env.WRITE_SIGNAL_EXAMPLE === "true") {
    const examples = jobs.map((j) => ({
      company: j.run.input.companyName,
      report: j.signalReport!,
      sources: j.run.research.sources,
      audit: j.run.groundingAudit ?? null,
    }));
    writeFileSync(
      "src/data/fixtures/signal-opportunity-example.json",
      JSON.stringify(examples, null, 2) + "\n",
    );
    writeFileSync(
      "docs/reports/SIGNAL_OPPORTUNITY_EXAMPLE.md",
      "# Signal Opportunity Research — offline example\n\nEntirely SIMULATED: fictional companies, metrics, ads, contact and approval receipts. No real integration, employment, product approval or opportunity is asserted. Nike is unchanged.\n\n" +
        examples
          .map(
            ({ company, report: r, sources }) =>
              `## ${company}: ${r.eligibility}\n\nFactual coverage ${r.judgement.factualCoverage}/100; opportunity coverage ${r.judgement.opportunityCoverage}/100 (rubric, not savings or buying likelihood).\n\n${r.insights.map((f) => `${f.statement}\n\n${f.quotes.map((q) => `> ${q.text}\n\nSource: ${sources.find((s) => s.id === q.sourceId)?.url}`).join("\n\n")}`).join("\n\n")}\n\nHypothesis: ${r.hypothesis ?? "Not established"}\n\nProven savings: none.\n\nPerson: ${r.contact ? `${r.contact.name}, ${r.contact.title}. ${r.contact.reason}` : "HOLD — no verified person"}\n\n${r.blockers.map((b) => `- ${b}`).join("\n")}\n\n${r.emails.map((m, i) => `### Review-only email ${i + 1}: ${m.subject}\n\n${m.body}\n\nEvidence: ${m.factIds.join(", ")}; approved fixture knowledge: ${m.knowledgeIds.join(", ")}`).join("\n\n")}\n\n### Judgement and next evidence\n\n${[...r.judgement.reasons, ...r.judgement.missingDataActions].map((s) => `- ${s}`).join("\n")}\n\nHuman approval remains mandatory; sending and enrollment disabled.\n`,
          )
          .join("\n"),
    );
  }
});
it.each([
  [
    "altered numeric value",
    (e: SignalEvidence) => {
      e.search!.paidSearchVisits++;
    },
  ],
  [
    "wrong country",
    (e: SignalEvidence) => {
      e.search!.country = "GB";
    },
  ],
  [
    "wrong domain",
    (e: SignalEvidence) => {
      e.search!.companyDomain = "other.example";
    },
  ],
  [
    "stale metric",
    (e: SignalEvidence) => {
      e.search!.retrievedAt = "2025-01-01T00:00:00.000Z";
    },
  ],
  [
    "missing denominator",
    (e: SignalEvidence) => {
      e.search!.excerpt = e.search!.excerpt.replace(e.search!.shareDefinition, "");
    },
  ],
  [
    "wrong SERP location",
    (e: SignalEvidence) => {
      e.serp!.location = "London";
    },
  ],
  [
    "stale SERP",
    (e: SignalEvidence) => {
      e.serp!.observedAt = "2026-10-17T00:00:00.000Z";
    },
  ],
  [
    "invented advertiser",
    (e: SignalEvidence) => {
      e.serp!.otherAdvertiserDomains = ["invented.example"];
    },
  ],
  [
    "unsafe ad",
    (e: SignalEvidence) => {
      e.serp!.ads[0].url = "https://127.0.0.1/";
    },
  ],
  [
    "credential-bearing source",
    (e: SignalEvidence) => {
      e.search!.sourceUrl += "?token=fictional";
    },
  ],
] as const)("fails closed on %s", async (_label, mutate) => {
  const { jobs } = await cohort();
  const job = jobs[0],
    evidence = structuredClone(job.signalEvidence!);
  mutate(evidence);
  let blocked = false;
  try {
    blocked = projectSignalEvidence(job.run, evidence, now).blockers.length > 0;
  } catch {
    blocked = true;
  }
  expect(blocked).toBe(true);
});
it("does not let a high factual score override a missing gate or revoked approved knowledge", async () => {
  const { jobs } = await cohort(),
    j = jobs[0];
  const held = evaluateSignal(
    j.run,
    j.signalEvidence!,
    { ready: false, blockers: ["COMPLETE_HISTORY_REQUIRED"], contact: null },
    [],
    now,
    "SIMULATED",
  );
  expect(held.judgement.factualCoverage).toBe(100);
  expect(held.eligibility).toBe("HOLD");
  expect(held.emails).toEqual([]);
  expect(held.hypothesis).toBeNull();
  const stale = evaluateSignal(
    j.run,
    j.signalEvidence!,
    await signalFixtureAdapters().contact(j, now),
    signalFixtureKnowledge,
    new Date(+now + 2 * 86400000),
    "SIMULATED",
  );
  expect(stale.eligibility).toBe("HOLD");
  expect(stale.emails).toEqual([]);
});
it.each(["MALFORMED", "UNAVAILABLE"])("retains a failed reviewer audit for %s", async (failure) => {
  const adapters = signalFixtureAdapters(),
    runtime = adapters.runtime;
  adapters.runtime = (j) => {
    const r = runtime(j);
    r.model.structured = async (_stage, schema) => {
      if (failure === "UNAVAILABLE") throw new Error("offline fixture failure");
      return schema.parse({});
    };
    return r;
  };
  const store = new MemoryQueueStore(),
    queue = new CompanyQueue(store, new SignalStages(adapters, fixtureExecutor()), () => now);
  const { fixture, ...input } = fixtureCompanies[0];
  await queue.enqueue("fixture", input, "bad-review-fixture", fixture, "SIGNAL_OPPORTUNITY_V1");
  for (let i = 0; i < 5; i++) await queue.tick("fixture");
  const job = (await store.read("fixture")).jobs[0];
  expect(job.signalReport?.eligibility).toBe("HOLD");
  expect(job.run.groundingAudit?.status).not.toBe("ACCEPTED");
});
it("never calls discovery or public retrieval during vertical fixture execution", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
  try {
    await cohort();
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});

it.each(["zero-paid", "zero-branded", "no-brand-ad"])(
  "does not manufacture an opportunity from %s",
  async (scenario) => {
    const { jobs } = await cohort(),
      j = jobs[0],
      evidence = structuredClone(j.signalEvidence!);
    if (scenario === "zero-paid") evidence.search!.paidSearchVisits = 0;
    if (scenario === "zero-branded") evidence.search!.brandedPaidSharePercent = 0;
    if (scenario === "no-brand-ad") evidence.serp!.brandAdvertising = "NOT_OBSERVED";
    const result = evaluateSignal(
      j.run,
      evidence,
      await signalFixtureAdapters().contact(j, now),
      signalFixtureKnowledge,
      now,
      "SIMULATED",
    );
    expect(result.eligibility).toBe("HOLD");
    expect(result.emails).toEqual([]);
    expect(result.blockers).toContain(
      scenario === "no-brand-ad"
        ? "CURRENT_BRAND_AD_PRESENCE_NOT_ESTABLISHED"
        : "POSITIVE_BRANDED_PAID_SEARCH_EXPOSURE_NOT_ESTABLISHED",
    );
  },
);
