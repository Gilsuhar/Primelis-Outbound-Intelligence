// @vitest-environment node
import { expect, it } from "vitest";
import {
  buildCommercialBrief,
  commercialBriefInstruction,
  buildWritingBrief,
  writingBriefInstruction,
  signalSalesCopyInstruction,
} from "./commercial-brief";
import {
  conversationLearningExamples,
  winningMessages,
} from "@/features/playbook/playbook-content";
import {
  chooseSalesStrategy,
  generatePersonalSequence,
  reviewSequenceWithAi,
} from "./creative-agents";
import { initialRun } from "./store";
import {
  MockWorkforceModel,
  workforceIntake,
  testNow,
  testKnowledge,
} from "@/test/workforce-fixtures";
import type { WorkforceModel } from "./openai";

function sample() {
  const run = initialRun("fixture", "brief-fixture", workforceIntake, testNow);
  run.knowledge = structuredClone(testKnowledge);
  run.research.gaps = ["Fictional fixture: no verified competitor observations"];
  return run;
}
function capture() {
  const calls: { stage: string; instruction: string; context: unknown }[] = [];
  const model: WorkforceModel = {
    discover: async () => {
      throw new Error("DISCOVERY_FORBIDDEN");
    },
    structured: async (stage, _schema, instruction, context) => {
      calls.push({ stage, instruction, context });
      throw new Error("CAPTURE_ONLY");
    },
  };
  return { calls, model };
}
it("hands off style lessons and human feedback without historical copy, outcomes or proof", () => {
  const run = sample();
  const before = JSON.stringify(run);
  const brief = buildCommercialBrief(run);
  const learning = JSON.stringify(brief.historicalStyleLessons);
  expect(learning).not.toMatch(/Remofirst|ZoomInfo|40|20|50M|MEETING_BOOKED|subject|body|outcome/);
  expect(brief.guidance.feedback.join()).toContain("not at a fixed email number");
  expect(brief.exclusions.join()).toContain("cost-per-MQL as CPC");
  expect(brief.playbookStyle.join()).not.toContain("Use one clear problem:");
  expect(JSON.stringify(run)).toBe(before);
  expect(brief.recipientClearance.status).toBe("HOLD");
});
it("does not invent approved mechanisms, account observations, recipient clearance or evidence", () => {
  const run = sample();
  run.knowledge = [];
  const brief = buildCommercialBrief(run);
  expect(brief.approvedKnowledgeReferences).toEqual([]);
  expect(brief.observationLedger).toEqual([]);
  expect(brief.selectedStrategy).toBeNull();
  expect(brief.missingEvidence).toContain("Fictional fixture: no verified competitor observations");
  expect(commercialBriefInstruction).toContain("NO_PITCH");
  expect(commercialBriefInstruction).toContain("not a menu");
  expect(buildWritingBrief(run).knowledge).toEqual([]);
  expect(buildWritingBrief(run).styleExamples).toHaveLength(4);
});
it("preserves the existing baseline and revised strategy handoff", async () => {
  for (const invoke of [chooseSalesStrategy]) {
    const run = sample();
    const { calls, model } = capture();
    await expect(invoke(run, model, { commercialBrief: false })).rejects.toThrow("CAPTURE_ONLY");
    await expect(invoke(run, model)).rejects.toThrow("CAPTURE_ONLY");
    const { commercialBrief, ...revised } = calls[1].context as Record<string, unknown>;
    expect(revised).toEqual(calls[0].context);
    expect(commercialBrief).toEqual(buildCommercialBrief(run));
    expect(calls[1].instruction).toBe(commercialBriefInstruction + " " + calls[0].instruction);
    expect(run.approved).toBe(false);
    expect(run.eligibility.status).toBe("HOLD");
  }
});
it("passes one writer brief with bounded style examples and no repeated research, strategy or knowledge", async () => {
  const run = sample();
  run.strategy = await chooseSalesStrategy(run, new MockWorkforceModel());
  const before = JSON.stringify(run);
  const { calls, model } = capture();
  await expect(generatePersonalSequence(run, model)).rejects.toThrow("CAPTURE_ONLY");
  const context = calls[0].context as ReturnType<typeof buildWritingBrief>;
  expect(context).toEqual(buildWritingBrief(run));
  expect(context.research).toEqual(run.research);
  expect(context.strategy).toEqual(run.strategy);
  expect(context.knowledge).toEqual(run.knowledge);
  expect(context.recipientClearance).toEqual(run.eligibility);
  expect(context.writingPreferences.feedback).toContain(
    "Each follow-up must add value; vary the closing rather than mechanically reusing it.",
  );
  expect(context).not.toHaveProperty("commercialBrief");
  expect(context).not.toHaveProperty("historicalStyleLessons");
  expect(context).not.toHaveProperty("previousDraft");
  expect(calls[0].instruction).toContain(writingBriefInstruction);
  expect(calls[0].instruction).not.toContain(commercialBriefInstruction);
  expect(calls[0].instruction).toContain("does not establish incremental value");
  expect(calls[0].instruction).toContain("Preserve the selected strategy record");
  expect(calls[0].instruction).toContain(signalSalesCopyInstruction);
  expect(calls[0].instruction).toContain("do not claim that the hypothesis is proven");
  expect(calls[0].instruction).toContain("assertion.knowledgeIds");
  expect(calls[0].instruction).toContain("email's approvedKnowledgeIds");
  expect(JSON.stringify(run)).toBe(before);
});
it("uses exact local Gil examples as style only, never customer proof or factual authority", () => {
  const examples = buildWritingBrief(sample()).styleExamples;
  expect(examples).toHaveLength(4);
  for (const example of examples) {
    expect(example.status).toBe("STYLE_ONLY_NOT_PROOF");
    expect(winningMessages.some((message) => message.message === example.excerpt)).toBe(true);
    expect(example.boundary).toContain("not approved product evidence");
    expect(example.boundary).toContain("assertion citation");
  }
  expect(JSON.stringify(examples)).not.toMatch(
    /ZoomInfo|Remofirst|40%|50M|MEETING_BOOKED|cost-per-MQL/,
  );
  expect(signalSalesCopyInstruction).toContain("offers to send a document");
  expect(signalSalesCopyInstruction).toContain("one simple, answerable CTA");
  expect(signalSalesCopyInstruction).toContain("no fixed step themes");
  expect(commercialBriefInstruction).toContain(
    "If neither approach has a defensible fit, select NO_PITCH",
  );
});
it("provides accepted style learning without historical customer facts or the CPC/MQL error", () => {
  const brief = buildWritingBrief(sample());
  expect(brief.salesMessaging.acceptedLearning).toHaveLength(1);
  expect(brief.salesMessaging.acceptedLearning[0]).toMatchObject({
    status: "APPROVED_FOR_LEARNING_ONLY",
    closingExcerpt: "Curious if you've already explored this?",
  });
  const learning = JSON.stringify(brief.salesMessaging.acceptedLearning);
  expect(learning).not.toMatch(/ZoomInfo|40%|20%|50M|MEETING_BOOKED/);
  expect(brief.salesMessaging.customerProof.candidateKnowledgeIds).toEqual([]);
  expect(brief.salesMessaging.personalization).toContain("not employment verification");
});
it("references every already-cleared proof candidate without picking the first or rewriting metric wording", () => {
  const run = sample();
  const proof = (id: string, text: string) => ({
    id,
    text,
    kind: "CASE_STUDY" as const,
    title: "Fictional approved proof for offline testing",
    sourceIds: [`source:${id}`],
    sourceUrls: ["https://example.com/case-study"],
    restrictions: "Fictional test only; not real customer proof.",
  });
  run.knowledge.push(
    proof("fictional:a", "Fictional A: cost per MQL decreased 40% over three months."),
    proof("fictional:b", "Fictional B: average CPC decreased 12% at equal conversion volume."),
  );
  const before = JSON.stringify(run);
  const brief = buildWritingBrief(run);
  expect(brief.salesMessaging.customerProof.candidateKnowledgeIds).toEqual([
    "fictional:a",
    "fictional:b",
  ]);
  expect(brief.knowledge).toEqual(run.knowledge);
  expect(brief.salesMessaging.customerProof.selection).toContain("never pick the first record");
  expect(brief.salesMessaging.customerProof.selection).toContain(
    "CPC, cost per MQL, spend and conversions are not interchangeable",
  );
  expect(JSON.stringify(run)).toBe(before);
});
it("keeps the real reply observation separate from Gil's proposed follow-up and unknown outcome", () => {
  const learning = buildWritingBrief(sample()).salesMessaging.conversationLearning;
  expect(learning.examples).toHaveLength(2);
  expect(learning.examples[0]).toMatchObject({
    id: "loveholidays-cold-reply",
    stage: "COLD_OUTREACH",
    authorship: "GIL_AUTHORED",
    outcome: "REPLY_OBSERVED",
  });
  expect(learning.examples[1]).toMatchObject({
    stage: "ACTIVE_CONVERSATION",
    authorship: "GIL_PROPOSED",
    outcome: "OUTCOME_UNKNOWN",
    historicalReply: { status: "PROSPECT_REPORTED_NOT_INDEPENDENTLY_VERIFIED" },
  });
  expect(JSON.stringify(learning)).not.toContain("MEETING_BOOKED");
  expect(learning.examples[1].historicalReply?.summary).toContain("only his hypothesis");
  expect(learning.examples[1].historicalReply?.summary).toContain(
    "not evidence about the current recipient",
  );
  expect(conversationLearningExamples[1].prospectReport?.summary).toContain(
    "three tests over three months",
  );
});
it("uses bounded style excerpts without admitting the proposed proof, timing or performance claims", () => {
  const run = sample();
  const before = JSON.stringify(run);
  const brief = buildWritingBrief(run);
  const learning = brief.salesMessaging.conversationLearning;
  for (const example of learning.examples) {
    const original = conversationLearningExamples.find((entry) => entry.id === example.id)!;
    expect(original.originalMessage).toContain(example.excerpt);
    expect(example).not.toHaveProperty("originalMessage");
    expect(example).not.toHaveProperty("unapprovedClaims");
  }
  expect(conversationLearningExamples[1].originalMessage).toContain("40–60%");
  expect(JSON.stringify(learning)).not.toMatch(
    /Europcar|Accor|Samsung|Stripe|Navan|40[–-]60|24\/7|minute-level|lowest sustainable CPC|same share of clicks|most of our clients/,
  );
  expect(learning.boundary).toContain("Check every product claim against supplied knowledge");
  expect(brief.salesMessaging.customerProof.candidateKnowledgeIds).toEqual([]);
  expect(brief.knowledge).toEqual(run.knowledge);
  expect(brief.recipientClearance.status).toBe("HOLD");
  expect(JSON.stringify(run)).toBe(before);
});
it("does not treat a cold-sequence follow-up or learning example as a current prospect reply", () => {
  const learning = buildWritingBrief(sample()).salesMessaging.conversationLearning;
  expect(learning.stageSelection).toContain(
    "Default to COLD_OUTREACH unless actual recipient reply evidence",
  );
  expect(learning.stageSelection).toContain(
    "historical learning example does not establish ACTIVE_CONVERSATION",
  );
  expect(learning.stageSelection).toContain("do not invent prior exchanges");
  expect(learning.examples[1].lessons.join(" ")).toContain("not proof that CPC is optimal");
  expect(learning.examples[1].lessons.join(" ")).toContain("not a universal template");
});
it("keeps the independent reviewer blind to the experiment arm and requires factual safety", async () => {
  const { model, calls } = capture();
  await expect(reviewSequenceWithAi(sample(), model, testNow)).rejects.toThrow("CAPTURE_ONLY");
  expect(calls[0].instruction).toContain("Zero material factual violations");
  expect(calls[0].instruction).toContain("Signal mechanism clarity");
  expect(calls[0].instruction).toContain(signalSalesCopyInstruction);
  expect(calls[0].instruction).toContain("not new factual authority");
  expect(calls[0].instruction).toContain("Keep all factual and eligibility checks unchanged");
  expect(calls[0].context).not.toHaveProperty("commercialBrief");
  expect(calls[0].context).not.toHaveProperty("variant");
});
it("preserves the existing model contract and never substitutes templates", async () => {
  const run = sample();
  const model = new MockWorkforceModel();
  run.strategy = await chooseSalesStrategy(run, model);
  const sequence = await generatePersonalSequence(run, model);
  expect(sequence.messages).toHaveLength(4);
  expect(sequence.creativePlan.approaches.length).toBeGreaterThanOrEqual(2);
  expect(sequence.approved).toBe(false);
  expect(run.eligibility.status).toBe("HOLD");
});
