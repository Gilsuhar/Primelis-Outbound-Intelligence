import {
  qualifyProspect,
  type ProspectQualificationInput,
  type QualificationDecision,
} from "./qualification";

/**
 * Pure agent workflow planner: no provider calls, side effects, or outbound sending.
 * The caller persists state and dispatches tasks through authorized integrations.
 */
export type AgentStage =
  | "INTAKE"
  | "QUALIFICATION"
  | "ACCOUNT_RESEARCH"
  | "SERP_EVIDENCE"
  | "SEQUENCE_DRAFT"
  | "HUMAN_REVIEW"
  | "OUTREACH_ENROLLMENT"
  | "OUTCOME_LEARNING";

export type AgentTask = {
  stage: AgentStage;
  action: string;
  requiresHumanApproval: boolean;
};

export type AgentPlan = {
  prospectId?: string;
  decision: QualificationDecision;
  tasks: AgentTask[];
  canSend: false;
};

export function planProspectWorkflow(
  input: ProspectQualificationInput,
  now: Date = new Date(),
): AgentPlan {
  const decision = qualifyProspect(input, now);
  if (decision.status === "REJECTED") {
    return { prospectId: input.hubspotRecordId, decision, tasks: [], canSend: false };
  }
  if (decision.status === "HOLD") {
    return {
      prospectId: input.hubspotRecordId,
      decision,
      tasks: decision.nextActions.map((action) => ({
        stage: "QUALIFICATION" as const,
        action,
        requiresHumanApproval: false,
      })),
      canSend: false,
    };
  }
  return {
    prospectId: input.hubspotRecordId,
    decision,
    tasks: [
      { stage: "ACCOUNT_RESEARCH", action: "Gather source-backed company and person intelligence", requiresHumanApproval: false },
      { stage: "SERP_EVIDENCE", action: "Request manual verified SERP screenshot with provenance", requiresHumanApproval: true },
      { stage: "SEQUENCE_DRAFT", action: "Prepare four distinct same-thread email drafts using approved proof", requiresHumanApproval: false },
      { stage: "HUMAN_REVIEW", action: "Review facts, claims, and each email before approval", requiresHumanApproval: true },
    ],
    canSend: false,
  };
}
