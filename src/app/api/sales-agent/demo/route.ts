import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createDemoFixtures, DEMO_LABEL, DEMO_TIME } from "@/features/sales-agent/demo-fixtures";
import { reviewEvidenceSnapshot } from "@/server/services/sales-agent-collection-service";

export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ ok: false }, { status: 401 });
  const rows = createDemoFixtures().map(({ snapshot }) =>
    reviewEvidenceSnapshot(snapshot, new Date(DEMO_TIME)),
  );
  return NextResponse.json(
    {
      ok: true,
      data: {
        evaluatedAt: DEMO_TIME,
        rows,
        counts: {
          READY: rows.filter((row) => row.plan.decision.status === "READY").length,
          HOLD: rows.filter((row) => row.plan.decision.status === "HOLD").length,
          REJECTED: rows.filter((row) => row.plan.decision.status === "REJECTED").length,
        },
        warnings: [DEMO_LABEL, `Simulated clock: ${DEMO_TIME}. Nothing is collected or saved.`],
        providers: [],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
