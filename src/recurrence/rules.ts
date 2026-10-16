// UI presets <-> RFC 5545 RRULE strings. Only the RRULE string is stored in the DB;
// presets are just a friendlier way to build and show it.

export const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Day = (typeof DAYS)[number];
export const DAY_LABELS: Record<Day, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

export type Nth = 1 | 2 | 3 | 4 | -1;
export const NTH_LABELS: Record<Nth, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" };

export type Recurrence =
  | { kind: "daily"; interval: number }
  | { kind: "weekdays" }
  | { kind: "weekly"; interval: number; days: Day[] }
  | { kind: "monthlyDate"; interval: number; day: number }
  | { kind: "monthlyNth"; interval: number; nth: Nth; day: Day };

export type RecurrenceKind = Recurrence["kind"];

const WEEKDAYS: Day[] = ["MO", "TU", "WE", "TH", "FR"];

const sortDays = (days: Day[]) => [...new Set(days)].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
const intervalPart = (n: number) => (n > 1 ? `;INTERVAL=${Math.floor(n)}` : "");

export function toRRule(r: Recurrence): string {
  switch (r.kind) {
    case "daily":
      return `FREQ=DAILY${intervalPart(r.interval)}`;
    case "weekdays":
      return `FREQ=WEEKLY;BYDAY=${WEEKDAYS.join(",")}`;
    case "weekly":
      return `FREQ=WEEKLY${intervalPart(r.interval)};BYDAY=${sortDays(r.days).join(",")}`;
    case "monthlyDate": {
      // Days 29-31 fall back to the month's last day in short months, e.g. "31st" -> Apr 30, Feb 28/29:
      // take the last existing day out of 28..N.
      if (r.day >= 29) {
        const days = Array.from({ length: r.day - 27 }, (_, i) => 28 + i);
        return `FREQ=MONTHLY${intervalPart(r.interval)};BYMONTHDAY=${days.join(",")};BYSETPOS=-1`;
      }
      return `FREQ=MONTHLY${intervalPart(r.interval)};BYMONTHDAY=${r.day}`;
    }
    case "monthlyNth":
      return `FREQ=MONTHLY${intervalPart(r.interval)};BYDAY=${r.nth}${r.day}`;
  }
}

/** Parse an RRULE we produced back into a preset. Returns null for anything else ("custom"). */
export function fromRRule(rrule: string): Recurrence | null {
  const parts: Record<string, string> = {};
  for (const kv of rrule.replace(/^RRULE:/i, "").split(";")) {
    const [k, v] = kv.split("=");
    if (k && v !== undefined) parts[k.toUpperCase()] = v.toUpperCase();
  }
  const known = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "BYSETPOS"]);
  if (Object.keys(parts).some((k) => !known.has(k))) return null;

  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1) return null;

  switch (parts.FREQ) {
    case "DAILY":
      return parts.BYDAY || parts.BYMONTHDAY || parts.BYSETPOS ? null : { kind: "daily", interval };
    case "WEEKLY": {
      if (!parts.BYDAY || parts.BYMONTHDAY || parts.BYSETPOS) return null;
      const days = parts.BYDAY.split(",");
      if (!days.every((d): d is Day => (DAYS as readonly string[]).includes(d))) return null;
      if (interval === 1 && sortDays(days).join() === WEEKDAYS.join()) return { kind: "weekdays" };
      return { kind: "weekly", interval, days: sortDays(days) };
    }
    case "MONTHLY": {
      if (parts.BYMONTHDAY && !parts.BYDAY) {
        const nums = parts.BYMONTHDAY.split(",").map(Number);
        if (nums.length === 1 && !parts.BYSETPOS && nums[0] >= 1 && nums[0] <= 28)
          return { kind: "monthlyDate", interval, day: nums[0] };
        const isFallback =
          parts.BYSETPOS === "-1" && nums[0] === 28 && nums.length >= 2 && nums.every((n, i) => n === 28 + i) && nums.length <= 4;
        return isFallback ? { kind: "monthlyDate", interval, day: nums[nums.length - 1] } : null;
      }
      const m = parts.BYDAY?.match(/^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/);
      if (m && !parts.BYMONTHDAY && !parts.BYSETPOS)
        return { kind: "monthlyNth", interval, nth: Number(m[1]) as Nth, day: m[2] as Day };
      return null;
    }
    default:
      return null;
  }
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
};
const every = (n: number, unit: string) => (n > 1 ? `Every ${n} ${unit}s` : `Every ${unit}`);

export function describe(r: Recurrence): string {
  switch (r.kind) {
    case "daily":
      return r.interval > 1 ? every(r.interval, "day") : "Daily";
    case "weekdays":
      return "Weekdays";
    case "weekly":
      return `${r.interval > 1 ? every(r.interval, "week") : "Weekly"} on ${r.days.map((d) => DAY_LABELS[d]).join(", ")}`;
    case "monthlyDate":
      return `${r.interval > 1 ? every(r.interval, "month") : "Monthly"} on the ${ordinal(r.day)}`;
    case "monthlyNth":
      return `${r.interval > 1 ? every(r.interval, "month") : "Monthly"} on the ${NTH_LABELS[r.nth]} ${DAY_LABELS[r.day]}`;
  }
}

/** Sensible preset for a kind, based on the task's due date ('YYYY-MM-DD...') or today. */
export function defaultRecurrence(kind: RecurrenceKind, date: string): Recurrence {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const day = DAYS[(jsDay + 6) % 7];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  switch (kind) {
    case "daily":
      return { kind, interval: 1 };
    case "weekdays":
      return { kind };
    case "weekly":
      return { kind, interval: 1, days: [day] };
    case "monthlyDate":
      return { kind, interval: 1, day: d };
    case "monthlyNth": {
      const nth = d + 7 > daysInMonth ? -1 : (Math.ceil(d / 7) as Nth);
      return { kind, interval: 1, nth, day };
    }
  }
}
