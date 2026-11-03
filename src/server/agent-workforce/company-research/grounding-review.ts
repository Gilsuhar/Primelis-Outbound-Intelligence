import "server-only";
import { companyGroundingReviewSchema } from "@/features/agent-workforce/company-research/grounding-review";
import { groundingReviewInstruction, validateGroundingWithAi } from "../creative-agents";

export function validateCompanyGroundingWithAi(
  run: Parameters<typeof validateGroundingWithAi>[0],
  model: Parameters<typeof validateGroundingWithAi>[1],
) {
  return model.structured(
    "EVIDENCE_VALIDATION",
    companyGroundingReviewSchema,
    groundingReviewInstruction +
      " For this company-only review, each concern MUST declare severity, code, scope, a concise decision explanation (maximum 300 characters), and supplied factIds/sourceIds. Return conclusions only, never internal reasoning, personal/contact data, secrets or raw document instructions. BLOCKING means an unresolved factual, quote, source-integrity, freshness, numeric/period-context or identity defect. Never downgrade such defects to improve completion. NONBLOCKING is permitted ONLY with code CONTEXT_LIMITATION for contextual caveats that do not undermine any accepted statement or company identity (for example, company self-description does not establish buying intent). Do not put a factual defect under CONTEXT_LIMITATION. FACT concerns require affected fact IDs and relevant cited source IDs; SOURCE concerns require affected source IDs. GLOBAL blocking concerns remain allowed, including when every individual claim is supported, if a genuine cross-cutting defect prevents accepting the evidence set. Attribute known relevant identifiers even for global concerns; empty arrays are permitted only for genuinely global matters. Every fact ID must occur exactly once across supportedFactIds and rejectedFactIds; never support a fact also rejected or explicitly affected by a blocking FACT concern. Every rejected fact needs a blocking concern identifying it, its cited source, or a genuinely global defect. A blocking IDENTITY concern requires identityMatches=false; identityMatches=false requires a blocking IDENTITY concern. Missing or inconsistent decisions fail closed. An empty concerns array is appropriate only if there are no concerns; do not manufacture agreement.",
    { intake: run.intake, research: run.research },
    run.usage,
  );
}
