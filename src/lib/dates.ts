// All stored dates are "floating" local times: 'YYYY-MM-DDTHH:MM' with no zone.
// They mean "wall-clock time on this laptop", which is what a to-do list wants.

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocal(d: Date, withSeconds = false): string {
  const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${s}:${pad(d.getSeconds())}` : s;
}

export function nowLocal(withSeconds = false): string {
  return toLocal(new Date(), withSeconds);
}

/** Parse 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM[:SS]' as local time. */
export function parseLocal(s: string): Date {
  const [date, time = "00:00"] = s.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss = 0] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

export const datePart = (s: string) => s.slice(0, 10);
export const timePart = (s: string) => s.slice(11, 16);

function dayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da.getTime() - db.getTime()) / 86_400_000);
}

/** Short human label: "Today 5:00 PM", "Tomorrow", "Fri", "17 Oct", "17 Oct 2027". */
export function formatDue(dueAt: string, hasTime: boolean, now = new Date()): string {
  const d = parseLocal(dueAt);
  const diff = dayDiff(d, now);
  let day: string;
  if (diff === 0) day = "Today";
  else if (diff === 1) day = "Tomorrow";
  else if (diff === -1) day = "Yesterday";
  else if (diff > 1 && diff < 7) day = d.toLocaleDateString(undefined, { weekday: "short" });
  else
    day = d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
  if (!hasTime) return day;
  return `${day} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** Overdue = date-only task before today, or timed task before now. */
export function isOverdue(dueAt: string | null, hasTime: boolean, now = new Date()): boolean {
  if (!dueAt) return false;
  const d = parseLocal(dueAt);
  return hasTime ? d < now : dayDiff(d, now) < 0;
}

/** "17:30" -> "5:30 PM" (locale format). */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
