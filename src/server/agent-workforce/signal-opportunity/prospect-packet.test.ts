// @vitest-environment node
// End-to-end OFFLINE simulation: real gates and queue, fictional provider receipts and memory stores.
import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { setupSignalContactFixture } from "@/test/signal-contact-fixtures";
import { collectionNow, fixtureProviders } from "@/test/sales-agent-collection-fixtures";
import { collectSalesAgentEvidence } from "@/server/services/sales-agent-collection-service";
import { retryVerification } from "@/server/verification/service";
import { signalContactDecision } from "./contact";
import { signalFixtureAdapters } from "./fixtures";
import { SignalStages } from "./pipeline";
import { assessSignalPacket } from "./packet-evals";
import { CompanyQueue } from "../company-queue/engine";
import { fixtureCompanies, fixtureExecutor } from "../company-queue/fixtures";
import { MemoryQueueStore } from "../company-queue/test-support";
import { reviewSignalSemantics, signalPacketHash } from "./semantic-review";
import { signalFixtureKnowledge } from "./fixtures";

function fictionalSemanticDecision(packetHash: string) {
  return {
    packetHash,
    verdict: "PASS",
    checks: {
      factualSupport: true,
      sourceScope: true,
      signalRelevance: true,
      recipientSuitability: true,
      tone: true,
      distinctiveness: true,
      progression: true,
    },
    emails: [1, 2, 3, 4].map((step) => ({
      step,
      decision: "PASS",
      reason: "Fictional semantic acceptance for contract testing; not an AI quality measurement.",
    })),
    concerns: [] as string[],
  };
}

const scenarios = [
  "eligible-search",
  "eligible-cmo",
  "growth-no-search",
  "paid-social-only",
  "history-unknown",
  "email-catch-all",
  "employment-stale",
  "unsubscribed",
  "hard-bounce",
  "complaint",
  "active-sequence",
  "conflicting-opportunity",
  "under-employees",
  "under-revenue",
  "wrong-owner",
  "search-unavailable",
  "grounding-rejected",
] as const;
type Scenario = (typeof scenarios)[number];
async function demonstrate(scenario: Scenario) {
  const deps = await setupSignalContactFixture();
  const { fixture, ...company } = fixtureCompanies[0];
  const contact = { ...deps.snapshot.contact, ...company, email: "fictional@acme.example" };
  const observations = deps.snapshot.observations.filter(
    (o) =>
      ![
        "role",
        "paidSearchResponsibility",
        "currentEmploymentVerified",
        "emailVerification",
      ].includes(o.field),
  );
  for (const observation of observations) {
    observation.subjectCompanyDomain = company.companyDomain;
    observation.subjectEmail = contact.email;
  }
  const set = (field: string, value: unknown) => {
    observations.find((o) => o.field === field)!.value = value;
  };
  for (const [name, field] of [
    ["unsubscribed", "unsubscribed"],
    ["hard-bounce", "hardBounced"],
    ["complaint", "complained"],
    ["active-sequence", "activeSequence"],
    ["conflicting-opportunity", "conflictingActiveOpportunity"],
  ])
    if (scenario === name) set(field, true);
  if (scenario === "history-unknown") set("outreachHistoryComplete", false);
  if (scenario === "under-employees") set("employeeCount", 79);
  if (scenario === "under-revenue") set("annualRevenueUsd", 29999999);
  if (scenario === "wrong-owner") contact.ownerId = "not-gil";
  const intake = await collectSalesAgentEvidence("owner", undefined, {
    intake: {
      listOwnedContacts: async () => ({
        contacts: [
          contact,
          structuredClone(contact),
          { ...contact, hubspotRecordId: "foreign", ownerId: "not-gil" },
        ],
        complete: true,
        warnings: [],
      }),
    },
    providers: fixtureProviders(observations),
    store: deps.evidence,
    now: () => collectionNow,
  });
  expect(intake.ok).toBe(true);
  if (!intake.ok) throw new Error("OFFLINE_INTAKE_FAILED");
  expect(intake.data.collected).toBe(scenario === "wrong-owner" ? 0 : 1);
  if (scenario === "wrong-owner")
    return {
      scenario,
      intakeCount: 0,
      eligible: false,
      drafts: 0,
      reason: "UNAUTHORIZED_OWNER_EXCLUDED",
      job: null,
      evaluation: null,
    };

  const results = [
    deps.snapshot.verification!.EMAIL!.result!,
    deps.snapshot.verification!.EMPLOYMENT!.result!,
  ];
  let title = "Head of Paid Search";
  for (const result of results) {
    result.identity = {
      hubspotRecordId: contact.hubspotRecordId,
      fullName: contact.fullName,
      email: contact.email,
      companyDomain: contact.companyDomain,
      emailModifiedAt: contact.emailModifiedAt,
    };
    if (result.kind === "EMAIL" && scenario === "email-catch-all") result.status = "CATCH_ALL";
    if (result.kind === "EMPLOYMENT") {
      result.employerDomain = company.companyDomain;
      if (scenario === "eligible-cmo") {
        title = "Chief Marketing Officer";
        Object.assign(result, {
          role: title,
          seniority: "C_LEVEL",
          searchResponsibility: "UNKNOWN",
          responsibilityScope: "UNKNOWN",
          responsibilityEvidence: [],
        });
      }
      if (scenario === "growth-no-search") {
        title = "VP Growth";
        Object.assign(result, {
          role: title,
          seniority: "VP",
          searchResponsibility: "UNKNOWN",
          responsibilityScope: "UNKNOWN",
          responsibilityEvidence: [],
        });
      }
      if (scenario === "paid-social-only") {
        title = "Head of Paid Social";
        Object.assign(result, {
          role: title,
          searchResponsibility: "ABSENT",
          responsibilityScope: "PAID_SOCIAL_ONLY",
        });
      }
      if (scenario === "employment-stale") result.proof.checkedAt = "2025-01-01T00:00:00Z";
    }
  }
  let verificationCalls = 0;
  for (const result of results) {
    const adapter = {
      id: result.proof.providerId,
      verify: async () => {
        verificationCalls++;
        return result;
      },
    };
    const options = { store: deps.evidence, adapter, now: () => collectionNow };
    await retryVerification(
      "owner",
      "42",
      result.kind,
      `fictional-${scenario}-${result.kind}`,
      options,
    );
    // Replaying the same request never invokes even the fictional provider a second time.
    await retryVerification(
      "owner",
      "42",
      result.kind,
      `fictional-${scenario}-${result.kind}`,
      options,
    );
  }
  expect(verificationCalls).toBe(2);
  const input = {
    ...company,
    hubspotRecordId: "42",
    prospectName: contact.fullName,
    prospectTitle: title,
  };
  const adapters = signalFixtureAdapters();
  adapters.contact = async (_job, now) => signalContactDecision("owner", input, now, deps);
  if (scenario === "search-unavailable") {
    const collect = adapters.collect;
    adapters.collect = async (job, now) => {
      const evidence = await collect(job, now);
      delete evidence.search;
      return evidence;
    };
  }
  if (scenario === "grounding-rejected") {
    const runtime = adapters.runtime;
    adapters.runtime = (job) => {
      const result = runtime(job);
      result.model.structured = async (_stage, schema, _instruction, raw) => {
        const research = (raw as { research: typeof job.run.research }).research;
        return schema.parse({
          identityMatches: true,
          supportedFactIds: research.facts.slice(1).map((f) => f.id),
          rejectedFactIds: [research.facts[0].id],
          concerns: [
            {
              severity: "BLOCKING",
              scope: "FACT",
              code: "NUMERIC_OR_PERIOD_CONTEXT",
              reason: "Fictional reviewer rejects the estimate context.",
              factIds: [research.facts[0].id],
              sourceIds: research.facts[0].sourceIds,
            },
          ],
        });
      };
      return result;
    };
  }
  const store = new MemoryQueueStore();
  let semanticCalls = 0;
  const previousRuntime = adapters.runtime;
  adapters.semanticReview = true;
  adapters.runtime = (job) => {
    const runtime = previousRuntime(job),
      structured = runtime.model.structured;
    runtime.model.structured = async (stage, schema, instruction, raw, usage) => {
      if (stage !== "QUALITY_REVIEW") return structured(stage, schema, instruction, raw, usage);
      semanticCalls++;
      return schema.parse(fictionalSemanticDecision((raw as { packetHash: string }).packetHash));
    };
    return runtime;
  };
  let queue = new CompanyQueue(
    store,
    new SignalStages(adapters, fixtureExecutor()),
    () => collectionNow,
  );
  const queued = await queue.enqueue(
    "owner",
    company,
    `packet-${scenario}`,
    fixture,
    "SIGNAL_OPPORTUNITY_V1",
  );
  expect(
    (await queue.enqueue("owner", company, `packet-${scenario}`, fixture, "SIGNAL_OPPORTUNITY_V1"))
      .id,
  ).toBe(queued.id);
  for (let i = 0; i < 6; i++) {
    await queue.tick("owner");
    queue = new CompanyQueue(
      store,
      new SignalStages(adapters, fixtureExecutor()),
      () => collectionNow,
    );
  }
  const job = (await store.read("owner")).jobs[0];
  expect(job.status).toBe("COMPLETE");
  expect(job.run.usage).toEqual([]);
  expect(job.signalReport).toMatchObject({ approved: false, canSend: false, canEnroll: false });
  expect(semanticCalls).toBe(["eligible-search", "eligible-cmo"].includes(scenario) ? 1 : 0);
  return {
    scenario,
    intakeCount: 1,
    eligible: job.signalReport!.eligibility === "Eligible",
    drafts: job.signalReport!.emails.length,
    reason: job.signalReport!.blockers.join("; "),
    job,
    evaluation: assessSignalPacket(job.run, job.signalReport!, collectionNow),
  };
}

it("runs the actual intake, independent-verification gates, Signal queue and drafts across eligible and blocked fixtures", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("OFFLINE_NETWORK_FORBIDDEN"));
  try {
    const results: Awaited<ReturnType<typeof demonstrate>>[] = [];
    for (const scenario of scenarios) {
      const result = await demonstrate(scenario);
      const expected = ["eligible-search", "eligible-cmo"].includes(scenario);
      expect(result.eligible, scenario + ": " + result.reason).toBe(expected);
      expect(result.drafts, scenario).toBe(expected ? 4 : 0);
      if (expected) {
        expect(result.evaluation?.status).toBe("DETERMINISTIC_CHECKS_PASS");
        expect(result.evaluation?.semanticReview).toBe("PASS");
        expect(result.evaluation).toMatchObject({ simulatedReviewReady: true });
        expect(result.evaluation?.readyForApproval).toBe(false);
      }
      results.push(result);
    }
    expect(network).not.toHaveBeenCalled();
    if (process.env.WRITE_OUTBOUND_EXAMPLE === "true") {
      const positive = results[0].job!.signalReport!;
      writeFileSync(
        "docs/reports/OUTBOUND_FICTIONAL_PACKET.md",
        "# Fictional prospect-to-four-draft demonstration\n\nOFFLINE SIMULATION ONLY. No real contacts, provider responses, licensed data, product approvals, independent AI review or cloud persistence. A fictional semantic reviewer exercises the contract; this is a simulated review-ready packet, not approval-ready live outreach. Nike was not touched.\n\n" +
          "## Proven execution path\n\nThree input rows (one identical duplicate and one foreign owner) → one admitted Gil-owned contact → existing independent verification service with fictional responses → real qualification/suppression/history gates → Signal queue → exact source/quote validation → simulated independent grounding decision → deterministic Judgement → four draft candidates → separately recorded fictional semantic review. Replayed verification and enqueue requests did not duplicate work. The worker object was recreated between stages; storage here is memory, not PostgreSQL.\n\n" +
          `## Recipient and hypothesis\n\n${positive.contact!.name}, ${positive.contact!.title}, Simulated Acme (acme.example). ${positive.contact!.reason}\n\nFictional company inputs: 100 employees and USD 50M annual revenue; verified fixture email/current employment; complete fixture history and suppression clearance. None establishes a real person's eligibility.\n\n${positive.hypothesis}\n\n` +
          positive.insights
            .map(
              (f) =>
                `### ${f.factId}\n\n${f.statement}\n\n${f.quotes.map((q) => `> ${q.text}\n\nFictional source: ${results[0].job!.run.research.sources.find((s) => s.id === q.sourceId)!.url}`).join("\n\n")}`,
            )
            .join("\n\n") +
          "\n\n## Draft candidates\n\n" +
          positive.emails
            .map(
              (m, i) =>
                `### ${i + 1}. ${m.subject}\n\n${m.body}\n\nSupport: ${m.factIds.join(", ") || "No factual assertion"}; product context: ${m.knowledgeIds.join(", ") || "None used"}.`,
            )
            .join("\n\n") +
          "\n\n## Judgement\n\nExact provenance and deterministic editorial checks pass. Purposes: compare estimated mix; examine a dated observation; consider a guarded test; respectful close. The Signal semantic adapter reuses the existing model interface and commercial/editorial rubrics. Its response here is explicitly fictional: PASS proves parsing, binding and queue persistence only. Real semantic usefulness/naturalness/implication quality has NOT been measured. No quality score changes eligibility or factual acceptance.\n\nSending/enrollment disabled; mandatory human approval remains separate.\n",
      );
      writeFileSync(
        "docs/reports/OUTBOUND_EVALS_SCORECARD.md",
        "# Outbound evaluation and autonomy baseline\n\nOFFLINE FICTIONAL BENCHMARK; fixed clock 2026-10-15T12:00:00Z. No real opportunity or human time-saving claim.\n\n| Case | Expected | Actual | Drafts | Result |\n|---|---|---|---:|---|\n" +
          results
            .map(
              (r) =>
                `| ${r.scenario} | ${["eligible-search", "eligible-cmo"].includes(r.scenario) ? "Eligible" : "Blocked"} | ${r.eligible ? "Eligible" : "Blocked"} | ${r.drafts} | PASS |`,
            )
            .join("\n") +
          "\n\n## Measured results\n\n- 17/17 expected dispositions; 2/2 eligible fixtures produced four candidates each; 15/15 unsafe or incomplete fixtures produced zero drafts. These metrics do not reward universally HOLD results.\n- Duplicate intake reduced three supplied rows to one authorized identity in each admitted case. Each verification type was invoked once despite request replay; queue enqueue replay preserved the same job.\n- Zero real provider/network calls; zero outbound actions; zero per-case operator interventions after fixture provisioning. The benchmark cannot count fixture authoring or engineering work as automated contact acquisition.\n- 2/2 eligible packets have a separately bound fictional semantic PASS; 0/2 have real independent AI quality clearance. Deterministic factual coverage and editorial-rule passes are separate from commercial usefulness. No claim of independent AI evaluation or 85% operational autonomy.\n- Eight fictional draft candidates generated; no fabricated savings, actual spend, competitor status or ownership. Missing search data stays missing and blocks the packet.\n- Human baseline minutes, correction time, exception-resolution time and real qualified yield: NOT MEASURED. Manual minutes eliminated: UNVERIFIED.\n\n## Measurement for the first approved real cohort\n\nFor the same eligible tasks, record timed manual preparation baseline B; observed operator preparation/corrections/exception handling H; elapsed unattended processing and provider cost separately. Time reduction = (B-H)/B only when B>0 and independent semantic quality plus human review meet the agreed standard. Report useful approved packets / genuinely eligible contacts, safe-block recall, unsupported-claim rate and exception rate alongside time reduction. Mandatory send/enroll authorization is excluded from preparation time; quality review and revisions are included. A HOLD-only cohort cannot meet the target.\n\n## Unverified and blocked\n\nLicensed cross-application Similarweb rights, live search/verification/history coverage, approved product knowledge, live semantic critic quality/calibration for Signal reports, fresh-run PostgreSQL persistence and Windows-off cloud execution remain unverified or approval-blocked. Existing related services and offline fixtures are not substitutes for those proofs.\n",
      );
    }
  } finally {
    network.mockRestore();
  }
});

it.each([
  "rejected",
  "malformed",
  "unavailable",
  "mismatched",
  "contradictory",
  "duplicate-step",
  "private-reason",
])(
  "semantic review fails closed for %s without changing eligibility or accepted facts",
  async (kind) => {
    const result = await demonstrate("eligible-search"),
      job = result.job!,
      report = job.signalReport!;
    const before = JSON.stringify({
      facts: job.run.research.facts,
      eligibility: report.eligibility,
    });
    const response = fictionalSemanticDecision(signalPacketHash(job.run, report));
    if (kind === "rejected") {
      response.verdict = "HOLD";
      response.concerns = ["Fixture: unsupported implied savings must remain blocked."];
    }
    if (kind === "mismatched") response.packetHash = "a".repeat(64);
    if (kind === "contradictory") response.checks.factualSupport = false;
    if (kind === "duplicate-step") response.emails[3].step = 1;
    if (kind === "private-reason") response.emails[0].reason = "password=fictional-never-retain";
    const runtime = signalFixtureAdapters().runtime(job);
    runtime.model.structured = async (_stage, schema) => {
      if (kind === "unavailable") throw new Error("private arbitrary provider message");
      return schema.parse(kind === "malformed" ? {} : response);
    };
    const review = await reviewSignalSemantics(
      job.run,
      report,
      signalFixtureKnowledge,
      runtime,
      collectionNow,
    );
    expect(review.status).not.toBe("PASS");
    expect(JSON.stringify(review)).not.toMatch(/password=|private arbitrary/);
    const checked = assessSignalPacket(
      job.run,
      { ...report, semanticReview: review },
      collectionNow,
    );
    expect(checked).toMatchObject({ simulatedReviewReady: false, readyForApproval: false });
    expect(JSON.stringify({ facts: job.run.research.facts, eligibility: report.eligibility })).toBe(
      before,
    );
  },
);

it("semantic clearance expires and is invalidated by any changed draft", async () => {
  const result = await demonstrate("eligible-search"),
    job = result.job!,
    report = job.signalReport!;
  const changed = structuredClone(report);
  changed.emails[3].body += " A new question.";
  expect(assessSignalPacket(job.run, changed, collectionNow)).toMatchObject({
    semanticReview: "STALE_OR_MISMATCHED",
    simulatedReviewReady: false,
  });
  expect(assessSignalPacket(job.run, report, new Date(+collectionNow + 86400001))).toMatchObject({
    semanticReview: "STALE_OR_MISMATCHED",
    simulatedReviewReady: false,
  });
});

it("quality diagnostics cannot promote changed quotations, stale evidence, unknown citations or repetitive copy", async () => {
  const result = await demonstrate("eligible-search"),
    job = result.job!;
  const report = job.signalReport!;
  for (const kind of ["quote", "citation", "duplicate", "salesy"] as const) {
    const edited = structuredClone(report);
    if (kind === "quote") edited.insights[0].quotes[0].text += " invented";
    if (kind === "citation") edited.emails[0].factIds = ["unknown-fact"];
    if (kind === "duplicate") edited.emails[1].body = edited.emails[0].body;
    if (kind === "salesy") edited.emails[0].body += " Unlock unprecedented savings.";
    expect(assessSignalPacket(job.run, edited, collectionNow).status, kind).toBe("REVISE_OR_BLOCK");
  }
  const stale = assessSignalPacket(job.run, report, new Date("2027-01-01T00:00:00Z"));
  expect(stale.status).toBe("REVISE_OR_BLOCK");
  const sent = { ...report, canSend: true } as unknown as typeof report;
  expect(assessSignalPacket(job.run, sent, collectionNow).status).toBe("INVALID_PACKET");
});
