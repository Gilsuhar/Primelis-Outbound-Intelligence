import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { isPreviewRestricted } from "@/lib/preview-policy.mjs";

// Dedicated Preview logout; never relax the blanket ban on business-action POSTs.
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  if (
    !isPreviewRestricted() ||
    url.protocol !== "https:" ||
    request.headers.get("origin") !== url.origin
  )
    return new NextResponse(null, { status: 403 });
  try {
    const client = await createSupabaseServerClient({ requireCookieWrites: true });
    if (!client) return new NextResponse(null, { status: 503 });
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return new NextResponse(null, { status: 503 });
    return NextResponse.redirect(new URL("/login", url), 303);
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
