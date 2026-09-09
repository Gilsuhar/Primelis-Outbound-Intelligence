import { NextResponse } from "next/server";

import { generateBuildSequence } from "@/server/services/build-sequence-service";
import { getCurrentUser } from "@/lib/auth/server";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json(
        {
          ok: false,
          code: "UNAUTHENTICATED",
          message: "Please sign in again before generating a sequence.",
        },
        { status: 401 },
      );
    }

    const input = (await request.json()) as unknown;
    const result = await generateBuildSequence(
      typeof input === "object" && input !== null
        ? { ...input, creatorId: actor.id }
        : { creatorId: actor.id },
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "SERVER_ERROR",
        message: "Build Sequence generation failed. Please try again.",
      },
      { status: 500 },
    );
  }
}
