import { ReviewQueueClient } from "@/features/review/review-queue-client";
import { retrieveReviewQueue } from "@/server/services/review-queue-service";

export default async function ReviewQueuePage() {
  const result = await retrieveReviewQueue();

  return result.ok ? (
    <ReviewQueueClient
      adapterMode={result.data.mode}
      initialSubmissions={result.data.submissions}
    />
  ) : (
    <ReviewQueueClient />
  );
}
