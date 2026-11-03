import type { DailyConfig, DailyState } from "@/features/agent-workforce/daily/contracts";
export function jerusalemParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
/** Calendar-day key prevents duplicate fall-back executions. Spring gaps fire at first later tick. */
export function scheduledKey(now: Date, config: DailyConfig, state: DailyState) {
  const local = jerusalemParts(now);
  if (!config.enabled) return null;
  let due = local.date;
  if (local.time < config.time) {
    if (!state.lastWorkerAt || jerusalemParts(new Date(state.lastWorkerAt)).date === local.date)
      return null;
    const previous = new Date(`${local.date}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    due = previous.toISOString().slice(0, 10);
  }
  const key = `daily-${due}`;
  return state.runs.some((r) => r.key === key) ? null : key;
}
/** Search real UTC instants rather than assume Israel's UTC offset or 24-hour local days. */
export function nextScheduledAt(now: Date, time: string, excludeDate?: string) {
  const minute = new Date(Math.floor(now.getTime() / 60000) * 60000 + 60000);
  let prior = jerusalemParts(now);
  for (let i = 0; i < 60 * 50; i++) {
    const local = jerusalemParts(minute);
    if (
      local.date !== excludeDate &&
      (local.date !== prior.date || prior.time < time) &&
      local.time >= time
    )
      return minute.toISOString();
    prior = local;
    minute.setUTCMinutes(minute.getUTCMinutes() + 1);
  }
  return null;
}
