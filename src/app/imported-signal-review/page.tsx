import { ImportedSignalReviewClient } from "@/features/imported-signal-review/imported-signal-review-client";
import { retrieveImportedSignalReview } from "@/server/services/imported-signal-review-service";

export default async function ImportedSignalReviewPage() {
  const result = await retrieveImportedSignalReview();

  return result.ok ? (
    <ImportedSignalReviewClient
      initialIndustries={result.data.industries}
      initialProgress={result.data.progress}
      initialRecords={result.data.records}
      initialSources={result.data.sources}
    />
  ) : (
    <ImportedSignalReviewClient />
  );
}
