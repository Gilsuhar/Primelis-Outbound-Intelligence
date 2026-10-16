import { after } from "next/server";
import { z } from "zod";
import { workforceActor, workforceBody, workforceResponse } from "@/server/agent-workforce/http";
import { providerSchema } from "@/server/integrations/contracts";
import { IntegrationSync } from "@/server/integrations/sync";
import { PrismaIntegrationStore } from "@/server/integrations/store";
import { drainSync } from "@/server/integrations/worker";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET() {
  const auth = await workforceActor();
  if (auth.response) return auth.response;
  try {
    const store = new PrismaIntegrationStore();
    const states = await Promise.all(
      ["HUBSPOT", "OUTREACH"].map(
        async (provider) => (await store.get(auth.actor.id, providerSchema.parse(provider))).state,
      ),
    );
    return workforceResponse({ ok: true, data: states });
  } catch {
    return workforceResponse(
      {
        ok: false,
        message:
          "Integration storage unavailable. Check Preview database migration and server configuration.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  const auth = await workforceActor(request);
  if (auth.response) return auth.response;
  try {
    const body = z
      .object({
        provider: providerSchema,
        action: z.enum(["CHECK", "INITIAL", "INCREMENTAL", "RESUME"]),
        requestKey: z
          .string()
          .regex(/^[A-Za-z0-9_-]{8,100}$/)
          .optional(),
      })
      .strict()
      .parse(await workforceBody(request));
    const sync = new IntegrationSync(auth.actor.id);
    if (body.action === "CHECK")
      return workforceResponse({ ok: true, data: await sync.check(body.provider) });
    if (body.action === "RESUME") await sync.resume(body.provider);
    else {
      if (!body.requestKey)
        return workforceResponse({ ok: false, message: "An idempotency key is required" }, 400);
      await sync.start(body.provider, body.action, body.requestKey);
    }
    after(async () => {
      try {
        await drainSync(auth.actor.id, body.provider);
      } catch {
        console.error("[integration-worker] unavailable; durable checkpoint retained", {
          provider: body.provider,
        });
      }
    });
    return workforceResponse(
      { ok: true, data: (await sync.store.get(auth.actor.id, body.provider)).state },
      202,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT")
      return workforceResponse(
        {
          ok: false,
          message:
            "This request key belongs to an earlier sync job; use a new key for a new window.",
        },
        409,
      );
    return workforceResponse(
      {
        ok: false,
        message:
          error instanceof z.ZodError
            ? "Invalid integration action"
            : "Read-only integration action failed. Refresh diagnostics for safe status and required configuration. No provider records were modified.",
      },
      error instanceof z.ZodError ? 400 : 503,
    );
  }
}
