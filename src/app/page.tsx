import { HomeClient } from "@/features/home/home-client";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function HomePage() {
  const viewer = await requireCurrentUser();
  const showAdmin = viewer.role === "KNOWLEDGE_ADMIN";

  return <HomeClient showAdmin={showAdmin} />;
}
