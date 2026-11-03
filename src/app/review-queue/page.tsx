import { ReviewQueueClient } from "@/features/review/review-queue-client";
import { requireRole } from "@/lib/auth/server";
import { retrieveReviewQueue } from "@/server/services/review-queue-service";

export default async function ReviewQueuePage() {
  await requireRole("KNOWLEDGE_ADMIN");
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
