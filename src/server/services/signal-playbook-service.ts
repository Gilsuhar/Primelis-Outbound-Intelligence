import type { ImportedSignalRecord } from "@/features/imported-signal-review/types";
import { industries, personas, practiceScenarios } from "@/features/playbook/playbook-content";
import type { PlaybookData } from "@/features/playbook/types";

import { retrieveImportedSignalReview } from "./imported-signal-review-service";

function byStatusAndCategory(records: ImportedSignalRecord[], status: string, category: string) {
  return records.filter((record) => record.status === status && record.category === category);
}

export async function getSignalPlaybookData(): Promise<PlaybookData> {
  try {
    const result = await retrieveImportedSignalReview();
    if (!result.ok) {
      throw new Error(result.message);
    }
    const records = result.data.records;

    return {
      approvedProductTruth: byStatusAndCategory(records, "APPROVED", "PRODUCT_TRUTH"),
      approvedMessagingRules: byStatusAndCategory(records, "APPROVED", "MESSAGE_RULE"),
      objections: byStatusAndCategory(records, "NEEDS_REVIEW", "OBJECTION").concat(
        byStatusAndCategory(records, "RESTRICTED", "OBJECTION"),
      ),
      caseStudies: records.filter((record) => record.category === "CASE_STUDY"),
      industries,
      personas,
      practiceScenarios,
    };
  } catch {
    return {
      approvedProductTruth: [],
      approvedMessagingRules: [],
      objections: [],
      caseStudies: [],
      industries,
      personas,
      practiceScenarios,
    };
  }
}
