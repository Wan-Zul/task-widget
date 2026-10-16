// Quick-add shorthand: "Submit logbook fri 5pm #FYP !high every week".
// Recognised tokens are removed from the title; everything else stays as typed.
//
//   #Name                category (created if new)
//   !high !med !low      priority (also !h !m !l, !3 !2 !1)
//   today tomorrow tmr   date; also mon..sun, "next fri", "in 3 days", "in 2 weeks",
//                        17/10, 17/10/2027 (day first), 17 oct, oct 17, 2026-10-17
//   5pm 5:30pm 17:00     time ("at" optional), noon
//   daily weekdays weekly monthly, every day/weekday/week/month,
//   every 2 weeks, every mon, every mon and thu   recurrence

import type { Priority } from "../db/tasks";
import { toLocal } from "../lib/dates";
import { DAYS, toRRule, type Day } from "../recurrence/rules";

export interface ParsedQuickAdd {
  title: string;
  /** Floating local 'YYYY-MM-DDTHH:MM', or null when no date/time was given. */
  dueAt: string | null;
  hasTime: boolean;
  priority: Priority | null;
  category: string | null;
  rrule: string | null;
}

const DAY_RE = "(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?";
const DAY_INDEX: Record<string, number> = { mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, sun: 0 };
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const PRIORITY: Record<string, Priority> = { high: 2, hi: 2, h: 2, "3": 2, med: 1, medium: 1, m: 1, "2": 1, low: 0, lo: 0, l: 0, "1": 0 };

const toDay = (s: string): Day => DAYS[(DAY_INDEX[s.toLowerCase()] + 6) % 7];
const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Next date (today included) that falls on the given JS weekday. */
function onOrAfter(today: Date, jsDay: number): Date {
  return addDays(today, (jsDay - today.getDay() + 7) % 7);
}

/** Build a valid date, or null for things like 31/02. */
function makeDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m, d);
  return date.getMonth() === m && date.getDate() === d ? date : null;
}

/** Day + month without a year: this year, or next year if that date has passed. */
function nextDayMonth(today: Date, m: number, d: number): Date | null {
  const date = makeDate(today.getFullYear(), m, d);
  if (date && date < today) return makeDate(today.getFullYear() + 1, m, d);
  return date;
}

export function parseQuickAdd(input: string, now = new Date()): ParsedQuickAdd {
  const today = atMidnight(now);
  let text = ` ${input} `;
  let category: string | null = null;
  let priority: Priority | null = null;
  let rrule: string | null = null;
  let date: Date | null = null;
  let time: [number, number] | null = null;

  // Remove a match and remember what it meant. Patterns are matched on word boundaries.
  const take = (re: RegExp, fn: (...m: string[]) => boolean | void) => {
    text = text.replace(re, (...args) => {
      const groups = args.slice(0, -2) as string[];
      return fn(...groups) === false ? groups[0] : " ";
    });
  };

  take(/(?<=\s)#([\p{L}\p{N}_-]+)(?=\s)/gu, (_, name) => {
    category = name;
  });
  take(/(?<=\s)!(high|hi|h|3|medium|med|m|2|low|lo|l|1)(?=\s)/gi, (_, p) => {
    priority = PRIORITY[p.toLowerCase()];
  });

  // Recurrence (before plain day names so "every mon" isn't read as a date).
  take(/\bevery\s+(\d+)\s+(day|week|month)s?\b/i, (_, n, unit) => {
    const freq = { day: "DAILY", week: "WEEKLY", month: "MONTHLY" }[unit.toLowerCase()];
    rrule = Number(n) > 1 ? `FREQ=${freq};INTERVAL=${Number(n)}` : `FREQ=${freq}`;
  });
  take(new RegExp(`\\bevery\\s+(${DAY_RE}(?:\\s*(?:,|and|&)\\s*${DAY_RE})*)\\b`, "i"), (_, list) => {
    const days = [...list.matchAll(new RegExp(DAY_RE, "gi"))].map((m) => toDay(m[1]));
    rrule = toRRule({ kind: "weekly", interval: 1, days });
  });
  take(/\b(?:every\s+(day|weekday|week|month)|(daily|weekdays|weekly|monthly))\b/i, (_, a, b) => {
    const k = (a ?? b).toLowerCase();
    rrule = {
      day: "FREQ=DAILY",
      daily: "FREQ=DAILY",
      weekday: toRRule({ kind: "weekdays" }),
      weekdays: toRRule({ kind: "weekdays" }),
      week: "FREQ=WEEKLY",
      weekly: "FREQ=WEEKLY",
      month: "FREQ=MONTHLY",
      monthly: "FREQ=MONTHLY",
    }[k]!;
  });

  // Dates.
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/, (_, y, m, d) => {
    date = makeDate(+y, +m - 1, +d);
    if (!date) return false;
  });
  take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/, (_, d, m, y) => {
    date = y ? makeDate(y.length === 2 ? 2000 + +y : +y, +m - 1, +d) : nextDayMonth(today, +m - 1, +d);
    if (!date) return false;
  });
  take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\b`, "i"), (_, d, mon) => {
    date = nextDayMonth(today, MONTHS.indexOf(mon.toLowerCase().slice(0, 3)), +d);
    if (!date) return false;
  });
  take(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"), (_, mon, d) => {
    date = nextDayMonth(today, MONTHS.indexOf(mon.toLowerCase().slice(0, 3)), +d);
    if (!date) return false;
  });
  take(/\bin\s+(\d+)\s+(day|week)s?\b/i, (_, n, unit) => {
    date = addDays(today, +n * (unit.toLowerCase() === "week" ? 7 : 1));
  });
  take(/\b(today|tonight|tod)\b/i, () => {
    date = today;
  });
  take(/\b(tomorrow|tmrw|tmr)\b/i, () => {
    date = addDays(today, 1);
  });
  take(new RegExp(`\\b(next\\s+)?${DAY_RE}\\b`, "i"), (_, next, day) => {
    date = addDays(onOrAfter(today, DAY_INDEX[day.toLowerCase()]), next ? 7 : 0);
  });

  // Times.
  take(/\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i, (_, h, m, ap) => {
    const hour = +h;
    if (hour < 1 || hour > 12) return false;
    time = [(hour % 12) + (ap.toLowerCase() === "pm" ? 12 : 0), m ? +m : 0];
  });
  take(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/, (_, h, m) => {
    time = [+h, +m];
  });
  take(/\b(?:at\s+)?noon\b/i, () => {
    time = [12, 0];
  });

  // Trailing "at"/"on"/"by" left over from "on fri", "by 5pm".
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(/\s(?:at|on|by)\s*$/i, " ");
  }

  const t = time as [number, number] | null;
  const withTime = (d: Date) => (t ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), t[0], t[1]) : d);
  let due: Date | null = date;
  if (t) {
    due = withTime(date ?? today);
    // "5pm" typed at 6pm means tomorrow.
    if (!date && due < now) due = withTime(addDays(today, 1));
  }

  return {
    title: text.replace(/\s+/g, " ").trim(),
    dueAt: due ? toLocal(due) : null,
    hasTime: !!t,
    priority,
    category,
    rrule,
  };
}
