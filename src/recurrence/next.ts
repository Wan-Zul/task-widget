import { RRule } from "rrule";

// rrule.js works in UTC. Our dates are floating local wall-clock strings ('YYYY-MM-DDTHH:MM'),
// so we map them 1:1 onto UTC fields and back. "9:00 every Monday" stays 9:00 across DST
// changes, and there's no time zone math anywhere.

export function floatToUtc(s: string): Date {
  const [date, time = "00:00"] = s.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

const pad = (n: number) => String(n).padStart(2, "0");

export function utcToFloat(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const startOfDay = (s: string) => `${s.slice(0, 10)}T00:00`;

function build(rrule: string, dtstart: string): RRule {
  return new RRule({ ...RRule.parseString(rrule), dtstart: floatToUtc(dtstart) });
}

/** First occurrence at or after `from`. */
export function firstOnOrAfter(rrule: string, dtstart: string, from: string): string | null {
  const d = build(rrule, dtstart).after(floatToUtc(from), true);
  return d ? utcToFloat(d) : null;
}

export interface SeriesPoint {
  rrule: string;
  dtstart: string;
  /** Due time of the instance being completed or skipped. */
  due: string;
  hasTime: boolean;
  /** Current floating local time. */
  now: string;
}

/**
 * Due time for the instance that follows `due`.
 *
 * It's the next occurrence after `due`, unless that has already passed. Then we jump to the
 * first occurrence still ahead, so missed occurrences collapse instead of piling up.
 * Date-only tasks count today as still ahead; timed tasks count from now.
 */
export function nextDue({ rrule, dtstart, due, hasTime, now }: SeriesPoint): string | null {
  const rule = build(rrule, dtstart);
  const next = rule.after(floatToUtc(due), false);
  if (!next) return null;
  const cutoff = floatToUtc(hasTime ? now : startOfDay(now));
  if (next >= cutoff) return utcToFloat(next);
  const caughtUp = rule.after(cutoff, !hasTime);
  return caughtUp ? utcToFloat(caughtUp) : null;
}

/** Occurrences after `due` that have already passed (shown as "missed N"). Capped for speed. */
export function missedCount({ rrule, dtstart, due, hasTime, now }: SeriesPoint, cap = 99): number {
  const rule = build(rrule, dtstart);
  const cutoff = floatToUtc(hasTime ? now : startOfDay(now));
  const start = floatToUtc(due);
  if (start >= cutoff) return 0;
  let n = 0;
  rule.between(start, cutoff, false, () => ++n < cap);
  return n;
}
