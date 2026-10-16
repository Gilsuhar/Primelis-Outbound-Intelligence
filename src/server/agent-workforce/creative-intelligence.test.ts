import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  creativeSequenceSchema,
  sequenceSchema,
} from "@/features/agent-workforce/gate-a-contracts";
import { initialRun } from "./store";
import { generatePersonalSequence, reviewSequenceWithAi } from "./creative-agents";
import { validateSequence } from "./evidence-validation";
import { WorkforceOrchestrator } from "./orchestrator";
import {
  MemoryWorkforceStore,
  MockWorkforceModel,
  testKnowledge,
  testNow,
  testReader,
  workforceIntake,
} from "@/test/workforce-fixtures";

async function completed() {
  const model = new MockWorkforceModel();
  const engine = new WorkforceOrchestrator({
    store: new MemoryWorkforceStore(),
    model,
    knowledge: async () => structuredClone(testKnowledge),
    reader: testReader(),
    eligibility: async () => ({ status: "READY", reasons: ["Verified isolated test evidence"], blockDrafting: false }),
    now: () => testNow,
  });
  let run = await engine.start("test", {
    idempotencyKey: "creative-test-request",
    intake: workforceIntake,
  });
  for (let i = 0; i < 12 && run.status === "RUNNING"; i++)
    run = await engine.advance("test", run.id);
  return { run, engine, model };
}
describe("creative freedom with factual boundaries", () => {
  it("persists independent approach exploration without fixing four angles or requiring claims in every step", async () => {
    const { run } = await completed();
    const sequence = structuredClone(run.sequence!);
    expect(creativeSequenceSchema.parse(sequence).creativePlan.approaches).toHaveLength(2);
    sequence.messages[0].body +=
      " " + "A more detailed explanation can be appropriate for a complex decision. ".repeat(15);
    sequence.messages[3] = {
      ...sequence.messages[3],
      body: "Happy to leave this here if the timing is wrong.",
      supportingFactIds: [],
      approvedKnowledgeIds: [],
      assertions: [],
      purpose: sequence.messages[0].purpose,
    };
    expect(sequenceSchema.safeParse(sequence).success).toBe(true);
    expect(validateSequence(run, sequence)).toEqual([]);
  });
  it("allows natural vocabulary and proposed meeting duration while still rejecting unsupported statistics and references", async () => {
    const { run } = await completed();
    const sequence = structuredClone(run.sequence!);
    sequence.messages[3] = {
      ...sequence.messages[3],
      body: "No guarantee is implied. I have 2 questions. Would a 10-minute conversation help?",
      supportingFactIds: [],
      approvedKnowledgeIds: [],
      assertions: [],
    };
    expect(validateSequence(run, sequence)).toEqual([]);
    sequence.messages[3].body = "Your CPC has fallen 42%.";
    expect(validateSequence(run, sequence)).toContain("Email 4 contains an unsupported number");
    sequence.creativePlan!.hypotheses = [
      {
        hypothesis: "Potential measurement opportunity",
        uncertainty: "Unknown current process",
        supportingFactIds: ["invented"],
      },
    ];
    expect(validateSequence(run, sequence)).toContain(
      "Strategic hypothesis cites unknown evidence",
    );
    sequence.creativePlan!.selectedApproachId = "missing";
    expect(validateSequence(run, sequence)).toContain("Creative approach selection is invalid");
  });
  it("automatically rethinks generic copy once, then permits review only after originality passes", async () => {
    const store = new MemoryWorkforceStore();
    const model = new MockWorkforceModel();
    const original = model.structured.bind(model);
    let critiques = 0;
    const instructions: string[] = [];
    model.structured = async (stage, schema, instruction, context, usage) => {
      instructions.push(instruction);
      const result = await original(stage, schema, instruction, context, usage);
      if (stage === "QUALITY_REVIEW" && critiques++ === 0)
        Object.assign(result as object, {
          verdict: "REVISE",
          checks: { ...(result as { checks: object }).checks, originality: false },
          concerns: ["Generic opening; rethink the narrative, not synonyms"],
        });
      if (stage === "SEQUENCE" && critiques) {
        const draft = result as unknown as z.infer<typeof sequenceSchema>;
        draft.creativePlan!.selectedApproachId = "decision";
        draft.creativePlan!.selectionRationale =
          "Shift from a generic measurement opener to a decision-rule discussion.";
        draft.messages[0].body += " Could a decision rule be more useful than another dashboard?";
        expect((context as { revisionConcerns: string[] }).revisionConcerns.join()).toMatch(
          /Generic opening/,
        );
      }
      return result;
    };
    const engine = new WorkforceOrchestrator({
      store,
      model,
      knowledge: async () => structuredClone(testKnowledge),
      reader: testReader(),
      eligibility: async () => ({ status: "READY", reasons: [], blockDrafting: false }),
      now: () => testNow,
    });
    let run = await engine.start("test", {
      idempotencyKey: "creative-revision-test",
      intake: workforceIntake,
    });
    for (let i = 0; i < 12 && run.status === "RUNNING"; i++)
      run = await engine.advance("test", run.id);
    expect(run.status).toBe("READY_FOR_REVIEW");
    expect(run.revisionAttempts).toBe(1);
    expect(run.sequence?.creativePlan?.selectedApproachId).toBe("decision");
    expect(run.sequence?.messages[0].body).toContain("decision rule");
    expect(run.approved).toBe(false);
    expect(instructions.join()).toContain("reconsider the approach rather than swapping synonyms");
  });
  it("requires a skeptical semantic review even when a fabricated nonnumeric claim escapes deterministic checks", async () => {
    const { run } = await completed();
    run.sequence!.messages[3].body = "We observed competitor ads for your brand.";
    let reviewed = false;
    const model = new MockWorkforceModel();
    const original = model.structured.bind(model);
    model.structured = async (stage, schema, instruction, context, usage) => {
      reviewed = true;
      expect(instruction).toContain("Read every word");
      expect(instruction).toContain("Reject fabricated observations even if omitted");
      const result = await original(stage, schema, instruction, context, usage);
      return Object.assign(result as object, {
        verdict: "HOLD",
        unsupportedAssertions: ["No SERP evidence supports the observation"],
        checks: { ...(result as { checks: object }).checks, factualAccuracy: false },
      }) as typeof result;
    };
    const review = await reviewSequenceWithAi(run, model);
    expect(reviewed).toBe(true);
    expect(review.verdict).toBe("HOLD");
    expect(review.checks.factualAccuracy).toBe(false);
  });
  it("passes ten individual briefs to the writer without injecting other contacts or prescribing style (mock contract, not live quality evaluation)", async () => {
    const { run: base } = await completed();
    const titles = [
      "Head of SEM",
      "Growth VP",
      "Performance Director",
      "Marketing CFO",
      "Search Lead",
      "CMO",
      "Acquisition Lead",
      "Digital Director",
      "Brand Director",
      "Ecommerce VP",
    ];
    const briefs: string[] = [];
    for (const [i, title] of titles.entries()) {
      const intake = {
        ...workforceIntake,
        prospectName: `Fictional Person ${i}`,
        prospectTitle: title,
      };
      const run = initialRun("test", `creative-person-${i}`, intake, testNow);
      const personalize = (text: string) =>
        text
          .replaceAll(workforceIntake.prospectName, intake.prospectName)
          .replaceAll(workforceIntake.prospectTitle, intake.prospectTitle);
      run.research = {
        ...structuredClone(base.research),
        prospectId: run.id,
        sources: base.research.sources.map((source) => ({
          ...source,
          excerpt: personalize(source.excerpt),
        })),
        facts: base.research.facts.map((fact) => ({
          ...fact,
          statement: personalize(fact.statement),
          quotes: fact.quotes.map((quote) => ({ ...quote, text: personalize(quote.text) })),
        })),
      };
      run.strategy = {
        ...base.strategy!,
        prospectId: run.id,
        prospectRationale: `Research-derived question for ${title}`,
      };
      run.knowledge = structuredClone(testKnowledge);
      const model = new MockWorkforceModel();
      const original = model.structured.bind(model);
      model.structured = async <T>(
        stage: string,
        schema: z.ZodType<T>,
        instruction: string,
        context: unknown,
        usage: typeof run.usage,
      ): Promise<T> => {
        const brief = context as { intake: typeof intake };
        expect(brief.intake).toEqual(intake);
        expect(JSON.stringify(context)).not.toContain(workforceIntake.prospectName);
        expect(instruction).toContain("Four is the delivery format, not four predefined angles");
        expect(instruction).not.toContain("under 150 words");
        briefs.push(JSON.stringify(brief.intake));
        return original(stage, schema, instruction, context, usage);
      };
      await generatePersonalSequence(run, model);
    }
    expect(new Set(briefs).size).toBe(10);
  });
});
