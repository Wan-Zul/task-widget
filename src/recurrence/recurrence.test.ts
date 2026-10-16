import { describe as group, expect, it } from "vitest";
import { defaultRecurrence, describe, fromRRule, toRRule, type Recurrence } from "./rules";
import { firstOnOrAfter, floatToUtc, missedCount, nextDue, occurrencesBetween, utcToFloat } from "./next";

// Reference dates: 2026-10-16 is a Friday; 2026-10-05 is the first Monday of October.

/** Successive occurrences: complete each one exactly at its due time. */
function sequence(r: Recurrence, dtstart: string, count: number, hasTime = true): string[] {
  const rrule = toRRule(r);
  const out: string[] = [];
  let due = firstOnOrAfter(rrule, dtstart, dtstart)!;
  for (let i = 0; i < count; i++) {
    out.push(due);
    due = nextDue({ rrule, dtstart, due, hasTime, now: due })!;
  }
  return out;
}

group("rules: RRULE round trip", () => {
  const cases: [Recurrence, string][] = [
    [{ kind: "daily", interval: 1 }, "FREQ=DAILY"],
    [{ kind: "daily", interval: 3 }, "FREQ=DAILY;INTERVAL=3"],
    [{ kind: "weekdays" }, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
    [{ kind: "weekly", interval: 1, days: ["MO", "WE", "FR"] }, "FREQ=WEEKLY;BYDAY=MO,WE,FR"],
    [{ kind: "weekly", interval: 2, days: ["TU"] }, "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"],
    [{ kind: "monthlyDate", interval: 1, day: 15 }, "FREQ=MONTHLY;BYMONTHDAY=15"],
    [{ kind: "monthlyDate", interval: 1, day: 31 }, "FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1"],
    [{ kind: "monthlyDate", interval: 1, day: 29 }, "FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1"],
    [{ kind: "monthlyNth", interval: 1, nth: 1, day: "MO" }, "FREQ=MONTHLY;BYDAY=1MO"],
    [{ kind: "monthlyNth", interval: 3, nth: -1, day: "FR" }, "FREQ=MONTHLY;INTERVAL=3;BYDAY=-1FR"],
  ];
  it.each(cases)("%j <-> %s", (r, s) => {
    expect(toRRule(r)).toBe(s);
    expect(fromRRule(s)).toEqual(r);
  });

  it("sorts and dedupes weekly days", () => {
    expect(toRRule({ kind: "weekly", interval: 1, days: ["FR", "MO", "FR"] })).toBe("FREQ=WEEKLY;BYDAY=MO,FR");
  });

  it("returns null for rules it can't represent", () => {
    expect(fromRRule("FREQ=YEARLY")).toBeNull();
    expect(fromRRule("FREQ=DAILY;COUNT=5")).toBeNull();
    expect(fromRRule("FREQ=MONTHLY;BYMONTHDAY=1,15")).toBeNull();
  });

  it("describes presets", () => {
    expect(describe({ kind: "weekly", interval: 2, days: ["MO", "TH"] })).toBe("Every 2 weeks on Mon, Thu");
    expect(describe({ kind: "monthlyDate", interval: 1, day: 31 })).toBe("Monthly on the 31st");
    expect(describe({ kind: "monthlyNth", interval: 1, nth: 1, day: "MO" })).toBe("Monthly on the first Mon");
  });

  it("derives defaults from the due date", () => {
    expect(defaultRecurrence("weekly", "2026-10-16")).toEqual({ kind: "weekly", interval: 1, days: ["FR"] });
    expect(defaultRecurrence("monthlyNth", "2026-10-05")).toEqual({ kind: "monthlyNth", interval: 1, nth: 1, day: "MO" });
    // Oct 30 2026 is the last Friday (no Friday a week later in October).
    expect(defaultRecurrence("monthlyNth", "2026-10-30")).toEqual({ kind: "monthlyNth", interval: 1, nth: -1, day: "FR" });
  });
});

group("next occurrence", () => {
  it("daily and every N days", () => {
    expect(sequence({ kind: "daily", interval: 1 }, "2026-10-16T09:00", 3)).toEqual([
      "2026-10-16T09:00",
      "2026-10-17T09:00",
      "2026-10-18T09:00",
    ]);
    expect(sequence({ kind: "daily", interval: 3 }, "2026-10-16T09:00", 3)).toEqual([
      "2026-10-16T09:00",
      "2026-10-19T09:00",
      "2026-10-22T09:00",
    ]);
  });

  it("weekdays skip the weekend", () => {
    expect(sequence({ kind: "weekdays" }, "2026-10-16T08:00", 2)).toEqual(["2026-10-16T08:00", "2026-10-19T08:00"]);
  });

  it("weekly on chosen days and every 2 weeks", () => {
    expect(sequence({ kind: "weekly", interval: 1, days: ["MO", "WE", "FR"] }, "2026-10-16T10:00", 4)).toEqual([
      "2026-10-16T10:00",
      "2026-10-19T10:00",
      "2026-10-21T10:00",
      "2026-10-23T10:00",
    ]);
    expect(sequence({ kind: "weekly", interval: 2, days: ["TU"] }, "2026-10-13T10:00", 3)).toEqual([
      "2026-10-13T10:00",
      "2026-10-27T10:00",
      "2026-11-10T10:00",
    ]);
  });

  it("first occurrence snaps forward from dtstart", () => {
    // Weekly on Monday, created on a Friday.
    expect(firstOnOrAfter("FREQ=WEEKLY;BYDAY=MO", "2026-10-16T00:00", "2026-10-16T00:00")).toBe("2026-10-19T00:00");
  });

  it("monthly on a date", () => {
    expect(sequence({ kind: "monthlyDate", interval: 1, day: 15 }, "2026-10-15T00:00", 3, false)).toEqual([
      "2026-10-15T00:00",
      "2026-11-15T00:00",
      "2026-12-15T00:00",
    ]);
  });

  it("monthly on the 31st falls back to the last day of short months", () => {
    expect(sequence({ kind: "monthlyDate", interval: 1, day: 31 }, "2027-01-31T00:00", 4, false)).toEqual([
      "2027-01-31T00:00",
      "2027-02-28T00:00",
      "2027-03-31T00:00",
      "2027-04-30T00:00",
    ]);
  });

  it("monthly on the 30th and 29th, including leap years", () => {
    expect(sequence({ kind: "monthlyDate", interval: 1, day: 30 }, "2028-01-30T00:00", 3, false)).toEqual([
      "2028-01-30T00:00",
      "2028-02-29T00:00",
      "2028-03-30T00:00",
    ]);
    expect(sequence({ kind: "monthlyDate", interval: 1, day: 29 }, "2027-01-29T00:00", 3, false)).toEqual([
      "2027-01-29T00:00",
      "2027-02-28T00:00",
      "2027-03-29T00:00",
    ]);
  });

  it("first Monday and last Friday of the month", () => {
    expect(sequence({ kind: "monthlyNth", interval: 1, nth: 1, day: "MO" }, "2026-10-01T09:00", 3)).toEqual([
      "2026-10-05T09:00",
      "2026-11-02T09:00",
      "2026-12-07T09:00",
    ]);
    expect(sequence({ kind: "monthlyNth", interval: 1, nth: -1, day: "FR" }, "2026-10-01T09:00", 3)).toEqual([
      "2026-10-30T09:00",
      "2026-11-27T09:00",
      "2026-12-25T09:00",
    ]);
  });

  it("returns null when a bounded rule runs out", () => {
    const p = { rrule: "FREQ=DAILY;COUNT=2", dtstart: "2026-10-16T09:00", hasTime: true };
    expect(nextDue({ ...p, due: "2026-10-16T09:00", now: "2026-10-16T09:00" })).toBe("2026-10-17T09:00");
    expect(nextDue({ ...p, due: "2026-10-17T09:00", now: "2026-10-17T09:00" })).toBeNull();
  });
});

group("missed occurrences collapse to one", () => {
  const daily = { rrule: "FREQ=DAILY", dtstart: "2026-10-01T09:00" };

  it("timed: jumps past every missed occurrence", () => {
    // Laptop off from Oct 1; completed Oct 16 at 10:00, after today's 9:00 slot.
    expect(nextDue({ ...daily, due: "2026-10-01T09:00", hasTime: true, now: "2026-10-16T10:00" })).toBe(
      "2026-10-17T09:00",
    );
  });

  it("timed: today's slot still ahead is kept", () => {
    expect(nextDue({ ...daily, due: "2026-10-01T09:00", hasTime: true, now: "2026-10-16T08:00" })).toBe(
      "2026-10-16T09:00",
    );
  });

  it("date-only: today counts as still ahead", () => {
    const p = { rrule: "FREQ=DAILY", dtstart: "2026-10-01T00:00", hasTime: false };
    expect(nextDue({ ...p, due: "2026-10-01T00:00", now: "2026-10-16T15:00" })).toBe("2026-10-16T00:00");
    // Completing today's instance moves to tomorrow.
    expect(nextDue({ ...p, due: "2026-10-16T00:00", now: "2026-10-16T15:00" })).toBe("2026-10-17T00:00");
  });

  it("weekly: missing two weeks gives one next instance", () => {
    const p = { rrule: "FREQ=WEEKLY;BYDAY=MO", dtstart: "2026-09-28T00:00", hasTime: false };
    // Due Mon Sep 28, completed Fri Oct 16 (missed Oct 5 and 12).
    expect(nextDue({ ...p, due: "2026-09-28T00:00", now: "2026-10-16T12:00" })).toBe("2026-10-19T00:00");
    expect(missedCount({ ...p, due: "2026-09-28T00:00", now: "2026-10-16T12:00" })).toBe(2);
  });

  it("completing early doesn't repeat the same slot", () => {
    // Weekly Friday 17:00 task, ticked on Wednesday.
    const p = { rrule: "FREQ=WEEKLY;BYDAY=FR", dtstart: "2026-10-16T17:00", hasTime: true };
    expect(nextDue({ ...p, due: "2026-10-23T17:00", now: "2026-10-21T12:00" })).toBe("2026-10-30T17:00");
  });

  it("counts missed occurrences, capped", () => {
    expect(missedCount({ ...daily, due: "2026-10-01T09:00", hasTime: true, now: "2026-10-16T10:00" })).toBe(15);
    expect(missedCount({ ...daily, due: "2026-10-01T09:00", hasTime: true, now: "2026-10-16T10:00" }, 5)).toBe(5);
    expect(missedCount({ ...daily, due: "2026-10-16T09:00", hasTime: true, now: "2026-10-16T08:00" })).toBe(0);
  });
});

group("floating time and DST", () => {
  it("keeps wall-clock time across the UK clock change (TZ=Europe/London)", () => {
    // UK clocks go back on Sun 25 Oct 2026.
    expect(sequence({ kind: "weekly", interval: 1, days: ["MO"] }, "2026-10-19T09:00", 2)).toEqual([
      "2026-10-19T09:00",
      "2026-10-26T09:00",
    ]);
    // And forward on Sun 28 Mar 2027.
    expect(sequence({ kind: "daily", interval: 1 }, "2027-03-27T09:00", 3)).toEqual([
      "2027-03-27T09:00",
      "2027-03-28T09:00",
      "2027-03-29T09:00",
    ]);
  });

  it("round-trips local times that don't exist in the local zone", () => {
    // 01:30 on 28 Mar 2027 is skipped in London; floating time doesn't care.
    expect(utcToFloat(floatToUtc("2027-03-28T01:30"))).toBe("2027-03-28T01:30");
  });
});

group("occurrences in a range (calendar)", () => {
  it("monthly on the 31st shows on Feb 28 and Apr 30", () => {
    const r = toRRule({ kind: "monthlyDate", interval: 1, day: 31 });
    expect(occurrencesBetween(r, "2027-01-31T00:00", "2027-02-01T00:00", "2027-05-01T00:00")).toEqual([
      "2027-02-28T00:00",
      "2027-03-31T00:00",
      "2027-04-30T00:00",
    ]);
  });

  it("weekly on two days across a month, end exclusive", () => {
    const got = occurrencesBetween("FREQ=WEEKLY;BYDAY=MO,TH", "2026-10-01T09:00", "2026-10-01T00:00", "2026-11-01T00:00");
    expect(got).toHaveLength(9); // Oct 2026: 4 Mondays + 5 Thursdays
    expect(got[0]).toBe("2026-10-01T09:00");
    expect(occurrencesBetween("FREQ=DAILY", "2026-10-01T00:00", "2026-10-01T00:00", "2026-10-03T00:00")).toEqual([
      "2026-10-01T00:00",
      "2026-10-02T00:00",
    ]);
  });
});
