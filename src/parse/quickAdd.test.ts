import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickAdd";

// Friday 16 Oct 2026, 12:00 local.
const NOW = new Date(2026, 9, 16, 12, 0);
const p = (s: string, now = NOW) => parseQuickAdd(s, now);

describe("quick add shorthand", () => {
  it("parses the brief's example", () => {
    expect(p("Submit logbook fri 5pm #FYP !high")).toEqual({
      title: "Submit logbook",
      dueAt: "2026-10-16T17:00",
      hasTime: true,
      priority: 2,
      category: "FYP",
      rrule: null,
    });
  });

  it("leaves plain titles alone", () => {
    expect(p("Buy milk")).toEqual({
      title: "Buy milk",
      dueAt: null,
      hasTime: false,
      priority: null,
      category: null,
      rrule: null,
    });
    expect(p("Call 2 people about May").title).toBe("Call 2 people about May");
  });

  it("priorities", () => {
    expect(p("a !h").priority).toBe(2);
    expect(p("a !med").priority).toBe(1);
    expect(p("a !low").priority).toBe(0);
    expect(p("a !1").priority).toBe(0);
    expect(p("wow!high").priority).toBeNull(); // must be its own word
  });

  it("relative dates", () => {
    expect(p("x today").dueAt).toBe("2026-10-16T00:00");
    expect(p("x tomorrow").dueAt).toBe("2026-10-17T00:00");
    expect(p("x tmr").dueAt).toBe("2026-10-17T00:00");
    expect(p("x in 3 days").dueAt).toBe("2026-10-19T00:00");
    expect(p("x in 2 weeks").dueAt).toBe("2026-10-30T00:00");
  });

  it("weekday names: today counts, 'next' adds a week", () => {
    expect(p("x fri").dueAt).toBe("2026-10-16T00:00");
    expect(p("x monday").dueAt).toBe("2026-10-19T00:00");
    expect(p("x Wednesday").dueAt).toBe("2026-10-21T00:00");
    expect(p("x next fri").dueAt).toBe("2026-10-23T00:00");
    expect(p("x thur").dueAt).toBe("2026-10-22T00:00");
  });

  it("explicit dates (day first), rolling to next year when passed", () => {
    expect(p("x 2026-12-01").dueAt).toBe("2026-12-01T00:00");
    expect(p("x 25/12").dueAt).toBe("2026-12-25T00:00");
    expect(p("x 1/3").dueAt).toBe("2027-03-01T00:00");
    expect(p("x 1/3/28").dueAt).toBe("2028-03-01T00:00");
    expect(p("x 17 oct").dueAt).toBe("2026-10-17T00:00");
    expect(p("x oct 15th").dueAt).toBe("2027-10-15T00:00");
    expect(p("x 3rd November").dueAt).toBe("2026-11-03T00:00");
  });

  it("rejects impossible dates and keeps them in the title", () => {
    const r = p("x 31/02");
    expect(r.dueAt).toBeNull();
    expect(r.title).toBe("x 31/02");
  });

  it("times", () => {
    expect(p("x tomorrow at 9am")).toMatchObject({ title: "x", dueAt: "2026-10-17T09:00", hasTime: true });
    expect(p("x mon 5:30pm").dueAt).toBe("2026-10-19T17:30");
    expect(p("x 12am").dueAt).toBe("2026-10-17T00:00"); // midnight has passed today
    expect(p("x 17:45").dueAt).toBe("2026-10-16T17:45");
    expect(p("lunch noon").dueAt).toBe("2026-10-16T12:00");
    expect(p("x 13pm")).toMatchObject({ title: "x 13pm", dueAt: null });
  });

  it("a time that already passed today means tomorrow", () => {
    expect(p("x 9am").dueAt).toBe("2026-10-17T09:00");
    expect(p("x today 9am").dueAt).toBe("2026-10-16T09:00"); // explicit date wins
  });

  it("recurrence", () => {
    expect(p("Standup every weekday 9am")).toMatchObject({
      title: "Standup",
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      dueAt: "2026-10-17T09:00",
    });
    expect(p("Gym every mon and thu").rrule).toBe("FREQ=WEEKLY;BYDAY=MO,TH");
    expect(p("Gym every mon and thu").title).toBe("Gym");
    expect(p("Water plants every 3 days").rrule).toBe("FREQ=DAILY;INTERVAL=3");
    expect(p("Rent monthly").rrule).toBe("FREQ=MONTHLY");
    expect(p("Review daily #ARC")).toMatchObject({ title: "Review", rrule: "FREQ=DAILY", category: "ARC" });
  });

  it("categories with unicode and dashes", () => {
    expect(p("x #side-gig").category).toBe("side-gig");
    expect(p("x #Kerja").category).toBe("Kerja");
  });

  it("drops dangling prepositions", () => {
    expect(p("Submit report by fri").title).toBe("Submit report");
    expect(p("Meet Aina on tuesday").title).toBe("Meet Aina");
    expect(p("Meet Aina on tue at 5pm").title).toBe("Meet Aina");
    expect(p("Look at the data").title).toBe("Look at the data");
  });
});
