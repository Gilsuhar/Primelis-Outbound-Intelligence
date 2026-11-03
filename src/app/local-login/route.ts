import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  localDevelopmentConfig,
  localDevelopmentHost,
  localDevelopmentCookie,
  localDevelopmentUser,
  localDevelopmentOrigin,
} from "@/lib/auth/local-development";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function allowed(request: Request) {
  const config = localDevelopmentConfig();
  return config && localDevelopmentHost(request.headers.get("host")) ? config : null;
}
export function GET(request: Request) {
  if (!allowed(request)) return new Response(null, { status: 404 });
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local development login</title></head><body><h1>Agent Workforce — local development</h1><p>Only localhost:5432/agent_workforce_test is permitted. This creates a labeled local SALES_USER profile; it does not configure Supabase, import prospects or enable integrations.</p><form method="post" action="/local-login"><button type="submit">Enter local workspace</button></form></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
        "X-Frame-Options": "DENY",
      },
    },
  );
}
export async function POST(request: Request) {
  const config = allowed(request);
  if (!config) return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== localDevelopmentOrigin(request.headers.get("host")))
    return new Response(null, { status: 403 });
  // One test identity only, never grant admin or overwrite an existing profile.
  const u = localDevelopmentUser;
  try {
    await prisma.$executeRaw`INSERT INTO "User" (id,email,name,role,"updatedAt") VALUES (${u.id},${u.email},${u.name},'SALES_USER',NOW()) ON CONFLICT (id) DO NOTHING`;
    const profile = await prisma.user.findFirst({
      where: { id: u.id, email: u.email, role: u.role },
    });
    if (!profile)
      return new Response("Local development profile conflicts with existing data.", {
        status: 409,
      });
    const response = NextResponse.redirect(
      new URL("/sales-agent", localDevelopmentOrigin(request.headers.get("host"))!),
      303,
    );
    response.cookies.set(localDevelopmentCookie, config.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.LOCAL_DEV_HTTPS === "true",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch {
    return new Response(
      "Local database unavailable or schema/profile prerequisite missing. No fallback identity was used.",
      { status: 503 },
    );
  }
}
