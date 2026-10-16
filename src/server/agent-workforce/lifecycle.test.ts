import { describe, expect, it } from "vitest";
import { z } from "zod";
import { IntegrationSync } from "@/server/integrations/sync";
import { AuditIntegrationStore } from "@/test/audit-integration-store";
import {
  MemoryEvidenceStore,
  collectedContact,
  verifiedObservations,
} from "@/test/sales-agent-collection-fixtures";
import {
  MemoryWorkforceStore,
  MockWorkforceModel,
  testNow,
  testKnowledge,
  testReader,
  workforceIntake,
} from "@/test/workforce-fixtures";
import { retryVerification } from "@/server/verification/service";
import type { VerificationAdapter } from "@/server/verification/providers";
import { verificationIdentity } from "@/features/sales-agent/verification/contracts";
import {
  snapshotSchema,
  reviewEvidenceSnapshot,
} from "@/server/services/sales-agent-collection-service";
import { checkWorkforceEligibility } from "./safety";
import { ProspectResearchEngine } from "./prospect-research/engine";
import { DraftStudioEngine } from "./draft-studio/engine";
import type { WorkforceRun, WorkforceIntake } from "@/features/agent-workforce/gate-a-contracts";
class AuditModel extends MockWorkforceModel {
  override async structured<T>(
    stage: string,
    schema: z.ZodType<T>,
    instruction: string,
    context: unknown,
    usage: WorkforceRun["usage"],
  ): Promise<T> {
    if (stage === "OPPORTUNITY_ASSESSMENT")
      return schema.parse({
        hypothesis: "A review of branded coverage may be relevant to the verified retail business.",
        supportingFactIds: ["account:business"],
        supportingObservationIds: [],
        confidence: "LOW",
        limitations: ["No first-party ads measurements"],
        missingInformation: ["Similarweb unavailable"],
        recommendedAngle: "OTHER_EVIDENCE_LED",
        followUp: ["Consider verified branded search monitoring"],
      });
    if (stage === "OPPORTUNITY_REVIEW") return schema.parse({ grounded: true, concerns: [] });
    return super.structured(stage, schema, instruction, context, usage);
  }
}
async function lifecycle(
  kind: "ELIGIBLE" | "REJECTED" | "HOLD" = "ELIGIBLE",
  requireVerifiedMatch = false,
) {
  const actor = "fictional-audit-operator",
    integrations = new AuditIntegrationStore(),
    evidence = new MemoryEvidenceStore(),
    store = new MemoryWorkforceStore(),
    model = new AuditModel();
  const contact = {
    ...structuredClone(collectedContact),
    fullName: workforceIntake.prospectName,
    companyName: workforceIntake.companyName,
    observedAt: testNow.toISOString(),
    emailSource: "HUBSPOT",
    observations: structuredClone(
      verifiedObservations.filter((o) =>
        ["employeeCount", "annualRevenueUsd", "role", "conflictingActiveOpportunity"].includes(
          o.field,
        ),
      ),
    ),
  };
  for (const o of contact.observations) {
    o.observedAt = testNow.toISOString();
    if (kind === "REJECTED" && o.field === "employeeCount") o.value = 12;
  }
  const history = structuredClone(
    verifiedObservations.filter((o) =>
      [
        "unsubscribed",
        "hardBounced",
        "complained",
        "activeSequence",
        "outreachHistoryComplete",
        "lastOutboundAt",
      ].includes(o.field),
    ),
  );
  for (const o of history) {
    o.observedAt = testNow.toISOString();
  }
  if (kind === "HOLD")
    history.splice(
      history.findIndex((o) => o.field === "complained"),
      1,
    );
  // These readers explicitly model a hypothetical authoritative organization-wide source.
  // The real Outreach adapter deliberately cannot establish this negative coverage.
  const hooks: { beforeHistory?: () => Promise<void> } = {};
  const sync = new IntegrationSync(actor, {
    store: integrations,
    evidence,
    now: () => testNow,
    intakeSince: collectedContact.intakeSince,
    hubspot: {
      check: async () => {},
      discover: async () => ({ ids: ["42", "42"] }),
      contact: async () => structuredClone(contact),
    },
    outreach: {
      check: async () => {},
      collect: async () => {
        await hooks.beforeHistory?.();
        return requireVerifiedMatch &&
          !snapshotSchema.parse(evidence.actors.get(actor)!.get("42")).verification?.EMAIL?.result
          ? {
              observations: [],
              blockers: ["Outreach identity UNKNOWN: independent business email required"],
            }
          : { observations: history, blockers: [] };
      },
    },
  });
  await sync.start("HUBSPOT", "INITIAL", "audit-hubspot-fixture");
  for (let i = 0; i < 8 && (await sync.step("HUBSPOT")); i++) {}
  await sync.start("OUTREACH", "INITIAL", "audit-outreach-fixture");
  for (let i = 0; i < 8 && (await sync.step("OUTREACH")); i++) {}
  const saved = () => snapshotSchema.parse(evidence.actors.get(actor)!.get("42"));
  const input = { ...workforceIntake, hubspotRecordId: "42" };
  const eligibility = (a: string, i: WorkforceIntake, n: Date) =>
    checkWorkforceEligibility(a, i, n, { evidence, integrations });
  const initial = await eligibility(actor, input, testNow);
  const adapter: VerificationAdapter = {
    id: "AUDIT_FICTIONAL_INDEPENDENT",
    verify: async (k, c) =>
      ({
        kind: k,
        identity: verificationIdentity(c),
        proof: {
          providerId: "AUDIT_FICTIONAL_INDEPENDENT",
          sourceRecordId: `fixture-${k}`,
          sourceUrl: "https://example.com/fictional-proof",
          checkedAt: testNow.toISOString(),
          independent: true,
          evidence: ["Isolated fictional corroboration; not a real verification result"],
        },
        ...(k === "EMAIL"
          ? { status: "VERIFIED" as const, businessEmail: true }
          : {
              status: "VERIFIED" as const,
              employerDomain: c.companyDomain!,
              current: true,
              role: workforceIntake.prospectTitle,
              seniority: "HEAD" as const,
              searchResponsibility: "PROVEN" as const,
              responsibilityScope: "PAID_SEARCH" as const,
              responsibilityEvidence: [
                "Fictional independent statement explicitly assigning paid Search responsibility",
              ],
            }),
      }) as never,
  };
  for (const type of ["EMAIL", "EMPLOYMENT"] as const)
    await retryVerification(actor, "42", type, `audit-verification-${type}`, {
      store: evidence,
      adapter,
      now: () => testNow,
    });
  if (requireVerifiedMatch) await sync.refreshAfterVerification("42");
  const afterVerification = await eligibility(actor, input, testNow);
  const research = new ProspectResearchEngine({
    evidence,
    store,
    model: () => model,
    reader: testReader(),
    knowledge: async () => testKnowledge,
    serp: async () => [],
    now: () => testNow,
  });
  const drafts = new DraftStudioEngine({
    store,
    evidence,
    eligibility,
    model: () => model,
    knowledge: async () => testKnowledge,
    now: () => testNow,
  });
  return {
    actor,
    sync,
    hooks,
    integrations,
    evidence,
    store,
    model,
    initial,
    afterVerification,
    research,
    drafts,
    saved,
    input,
    eligibility,
  };
}
describe("complete lifecycle — actual engines, fictional provider responses only", () => {
  it("requires verification, then researches, drafts, quality-reviews and records human review without sending", async () => {
    const ctx = await lifecycle();
    expect(ctx.initial.status).toBe("HOLD");
    expect(ctx.afterVerification.status).toBe("READY");
    const id = (await ctx.research.enqueue(ctx.actor, { contactId: "42" })).records[0].runId!;
    let source = (await ctx.store.get(ctx.actor, id))!;
    for (let n = 0; n < 8 && source.prospectResearch!.status === "RUNNING"; n++)
      source = await ctx.research.advance(ctx.actor, id);
    expect(source.prospectResearch!.stages.REVIEW.status).toBe("COMPLETE");
    let draft = await ctx.drafts.prepare(ctx.actor, id);
    for (let n = 0; n < 7 && draft.status === "RUNNING"; n++)
      draft = await ctx.drafts.advance(ctx.actor, draft.id);
    expect(draft.status).toBe("READY_FOR_REVIEW");
    expect(draft.sequence!.messages).toHaveLength(4);
    expect(draft.draftStudio!.qualityDecision).toBe("PASS");
    draft = await ctx.drafts.mutate(ctx.actor, draft.id, {
      action: "APPROVE",
      expectedVersion: draft.version,
      requestKey: "human-review-fixture",
    });
    expect(draft.draftStudio!.reviewStatus).toBe("CONTENT_APPROVED");
    expect(draft).toMatchObject({ approved: false, canSend: false, canEnroll: false });
    // A company suppression added after approval must invalidate that approval immediately on read.
    ctx.evidence.suppressionRecords = async () => [
      {
        id: "audit-company-suppression",
        companyName: workforceIntake.companyName,
        domain: workforceIntake.companyDomain,
        status: "DO_NOT_CONTACT",
        reason: "Fictional newly added company suppression",
      },
    ];
    expect((await ctx.eligibility(ctx.actor, ctx.input, testNow)).status).toBe("REJECTED");
    const blocked = await ctx.drafts.read(ctx.actor, draft.id);
    expect(blocked.draftStudio!.reviewStatus).toBe("INVALIDATED");
    expect(blocked.sequence).toBeNull();
    expect(blocked.draftStudio!.approval).toBeNull();
  });
  it("rejects an out-of-ICP prospect and refuses research and drafting", async () => {
    const ctx = await lifecycle("REJECTED");
    expect(ctx.afterVerification.status).toBe("REJECTED");
    const intake = await ctx.research.enqueue(ctx.actor, { contactId: "42" });
    expect(intake.records[0].runId).toBeUndefined();
    expect(ctx.model.calls).toEqual([]);
  });
  it("keeps missing complaint authority on HOLD despite completed research and refuses drafting", async () => {
    const ctx = await lifecycle("HOLD");
    expect(ctx.afterVerification.status).toBe("HOLD");
    const id = (await ctx.research.enqueue(ctx.actor, { contactId: "42" })).records[0].runId!;
    for (let i = 0; i < 7; i++) await ctx.research.advance(ctx.actor, id);
    expect((await ctx.store.get(ctx.actor, id))!.prospectResearch!.stages.REVIEW.status).toBe(
      "COMPLETE",
    );
    await expect(ctx.drafts.prepare(ctx.actor, id)).rejects.toThrow("DRAFT_ELIGIBILITY_HOLD");
    expect(ctx.model.calls).not.toContain("SEQUENCE");
  });
  it("isolates evidence and generated research between users", async () => {
    const ctx = await lifecycle();
    const id = (await ctx.research.enqueue(ctx.actor, { contactId: "42" })).records[0].runId!;
    expect(await ctx.store.get("different-operator", id)).toBeNull();
    expect(await ctx.evidence.list("different-operator")).toEqual([]);
    expect(reviewEvidenceSnapshot(ctx.saved(), testNow).plan.decision.status).toBe("READY");
  });
});
it("rechecks Outreach identity and history after independent email verification resolves matching", async () => {
  const ctx = await lifecycle("ELIGIBLE", true);
  expect(ctx.initial.status).toBe("HOLD");
  expect(ctx.afterVerification.status).toBe("READY");
  expect(ctx.saved().blockers).not.toContain(
    "Outreach identity UNKNOWN: independent business email required",
  );
});
it.each(["fullName", "emailSource", "ownerId"] as const)(
  "rejects Outreach history if %s changes during the request",
  async (field) => {
    const ctx = await lifecycle();
    ctx.hooks.beforeHistory = async () => {
      await ctx.evidence.edit(ctx.actor, "42", (raw) => {
        const saved = snapshotSchema.parse(raw);
        return {
          ...saved,
          provenanceAtCollection: [],
          contact: {
            ...saved.contact,
            [field]: field === "ownerId" ? "other-owner" : "Changed during history request",
          },
        };
      });
    };
    await expect(ctx.sync.refreshAfterVerification("42")).rejects.toThrow("INVALID_RESPONSE");
    expect((await ctx.integrations.get(ctx.actor, "OUTREACH")).state.status).toBe("ERROR");
    expect(ctx.saved().integrationReceipts!.OUTREACH!.jobId).not.toContain("verified-history");
  },
);
