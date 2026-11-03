import { requireCurrentUser } from "@/lib/auth/server";
import { localDevelopmentConfig } from "@/lib/auth/local-development";
import { RecyclerReview } from "@/features/prospect-recycler/review-client";
import { recyclerReviewDemo } from "@/server/prospect-recycler/review-demo";

export default async function RecyclerPage() {
  const actor = await requireCurrentUser();
  return (
    <RecyclerReview
      initial={await recyclerReviewDemo()}
      liveAvailable={
        !!localDevelopmentConfig() && actor.id === process.env.INTEGRATION_OPERATOR_USER_ID
      }
    />
  );
}
