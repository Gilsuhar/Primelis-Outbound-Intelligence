import { assertPreviewOperation } from "@/lib/preview-policy.mjs";
import { jerusalemParts } from "../daily/schedule";
import { fixtureCompanies } from "./fixtures";
import type { CompanyQueue } from "./engine";
/** Date keys persist in the queue, including completed jobs. Repeated wakes never re-enqueue them. */
export async function scheduleFixtureCohort(queue: CompanyQueue, actor: string, now: Date) {
  assertPreviewOperation("worker");
  const local = jerusalemParts(now);
  if (local.time < "09:00") return;
  for (const { fixture, ...input } of fixtureCompanies) {
    await queue.enqueue(actor, input, `fixture-${local.date}-${fixture}`, fixture);
  }
}

/** New work is Signal-specific; historical company jobs retain their original executor. */
export async function scheduleSignalFixtureCohort(queue: CompanyQueue, actor: string, now: Date) {
  assertPreviewOperation("worker");
  const local = jerusalemParts(now);
  if (local.time < "09:00") return;
  for (const { fixture, ...input } of fixtureCompanies)
    await queue.enqueue(
      actor,
      input,
      `signal-${local.date}-${fixture}`,
      fixture,
      "SIGNAL_OPPORTUNITY_V1",
    );
}
