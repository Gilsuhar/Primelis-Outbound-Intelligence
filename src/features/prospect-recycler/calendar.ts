/** Calendar arithmetic for the Recycler only. No dependency on Sales Agent policy. */
export const RECYCLER_TIMEZONE = "Asia/Jerusalem";
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: RECYCLER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Reject timezone-free, normalized impossible dates and future checks at the call site. */
export function timestamp(value: string): number | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return null;
  const [, y, m, d, h, min, sec, , , oh, om] = match;
  const year = Number(y),
    month = Number(m),
    day = Number(d);
  if (
    year < 1900 ||
    year > 9998 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    Number(h) > 23 ||
    Number(min) > 59 ||
    Number(sec) > 59 ||
    Number(oh ?? 0) > 23 ||
    Number(om ?? 0) > 59
  )
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function wallClock(at: number): number {
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    new Date(at).getUTCMilliseconds(),
  );
}

export function jerusalemDate(at: string): string {
  const parsed = timestamp(at);
  if (parsed === null) throw new RangeError("Invalid timestamp");
  return new Date(wallClock(parsed)).toISOString().slice(0, 10);
}

/**
 * Preserve Jerusalem wall-clock time, clamp month end, and include the exact anniversary.
 * An ambiguous fall-back anniversary uses the later instant; a spring gap shifts forward.
 * Negative offsets use the earlier instant, conservatively widening history coverage.
 */
export function addRecyclerCalendarMonths(at: string, months: number): string {
  const parsed = timestamp(at);
  if (parsed === null || !Number.isInteger(months) || Math.abs(months) > 120)
    throw new RangeError("Invalid calendar input");
  const original = new Date(wallClock(parsed));
  const target = new Date(original);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  target.setUTCDate(
    Math.min(
      original.getUTCDate(),
      new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate(),
    ),
  );
  const local = target.getTime();
  const offsets = new Set(
    [-36, -12, 0, 12, 36].map((hours) => {
      const probe = local + hours * 3_600_000;
      return wallClock(probe) - probe;
    }),
  );
  const candidates = [...offsets].map((offset) => local - offset);
  const exact = candidates.filter((candidate) => wallClock(candidate) === local);
  const choices = exact.length ? exact : candidates;
  return new Date(months < 0 ? Math.min(...choices) : Math.max(...choices)).toISOString();
}
