// Runs the real data layer against an in-memory SQLite (node:sqlite) with the real migrations,
// standing in for tauri-plugin-sql.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sqlite: DatabaseSync;

// sqlx binds `$N` to the Nth argument; node:sqlite needs them as named parameters.
const named = (params: unknown[]) => Object.fromEntries(params.map((v, i) => [`$${i + 1}`, v])) as never;

vi.mock("./client", () => ({
  db: async () => ({
    select: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(named(params)),
    execute: async (sql: string, params: unknown[] = []) => {
      const r = sqlite.prepare(sql).run(named(params));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
  }),
}));

const { createTask, listTasks, updateTask } = await import("./tasks");
const { completeTask, projectOccurrences, removeTask, repairSeries, saveTask, skipOccurrence, uncompleteTask } =
  await import("./series");
const { exportBackup, importBackup, validateBackup } = await import("./backup");

const migrationsDir = new URL("../../src-tauri/migrations/", import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, migrationsDir), "utf8"));

function at(local: string) {
  vi.setSystemTime(new Date(local)); // parsed as local time
}

const open = async () => listTasks("all");
const one = async () => {
  const tasks = await open();
  expect(tasks).toHaveLength(1);
  return tasks[0];
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const m of migrations) sqlite.exec(m);
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

async function dailyTask(title = "Logbook") {
  at("2026-10-16T09:00:00");
  const id = await createTask({ title, dueAt: "2026-10-16T00:00" });
  const [t] = (await open()).filter((x) => x.id === id);
  await saveTask(t, {}, "FREQ=DAILY", "future");
  return one();
}

describe("series lifecycle", () => {
  it("making a task recurring links it to a new series", async () => {
    const t = await dailyTask();
    expect(t.rrule).toBe("FREQ=DAILY");
    expect(t.dueAt).toBe("2026-10-16T00:00");
    expect(t.hasTime).toBe(false);
  });

  it("completing creates exactly one next instance and records history", async () => {
    await completeTask(await dailyTask());
    const t = await one();
    expect(t.dueAt).toBe("2026-10-17T00:00");
    expect(t.title).toBe("Logbook");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM completions").get()).toEqual({ n: 1 });
    expect(await listTasks("done")).toHaveLength(1);
  });

  it("missed days show one overdue instance; completing it catches up to today", async () => {
    await dailyTask();
    at("2026-10-26T15:00:00"); // 10 days later
    const today = await listTasks("today");
    expect(today).toHaveLength(1);
    expect(today[0].dueAt).toBe("2026-10-16T00:00");
    await completeTask(today[0]);
    expect((await one()).dueAt).toBe("2026-10-26T00:00");
  });

  it("un-ticking removes the instance that completing created", async () => {
    await completeTask(await dailyTask());
    const [done] = await listTasks("done");
    await uncompleteTask(done);
    const t = await one();
    expect(t.id).toBe(done.id);
    expect(t.done).toBe(false);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM completions").get()).toEqual({ n: 0 });
  });

  it('"this one only" edits the instance, not the template', async () => {
    const t = await dailyTask();
    await saveTask(t, { title: "Logbook (late)" }, "FREQ=DAILY", "this");
    expect((await one()).title).toBe("Logbook (late)");
    await completeTask(await one());
    expect((await one()).title).toBe("Logbook");
  });

  it('"all future" edits the template and re-anchors the rule', async () => {
    const t = await dailyTask();
    await saveTask(t, { title: "Weekly review", dueAt: "2026-10-16T00:00" }, "FREQ=WEEKLY;BYDAY=MO", "future");
    const t2 = await one();
    expect(t2.dueAt).toBe("2026-10-19T00:00"); // next Monday
    await completeTask(t2);
    expect(await one()).toMatchObject({ title: "Weekly review", dueAt: "2026-10-26T00:00" });
  });

  it("stopping recurrence keeps the current task as a one-off", async () => {
    const t = await dailyTask();
    await saveTask(t, {}, null);
    const t2 = await one();
    expect(t2.rrule).toBeNull();
    await completeTask(t2);
    expect(await open()).toHaveLength(0);
  });

  it("skip moves to the next occurrence without history", async () => {
    await skipOccurrence(await dailyTask());
    expect((await one()).dueAt).toBe("2026-10-17T00:00");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM completions").get()).toEqual({ n: 0 });
  });

  it("deleting a recurring task ends the series", async () => {
    await removeTask(await dailyTask());
    await repairSeries();
    expect(await open()).toHaveLength(0);
  });
});

describe("repairSeries", () => {
  it("removes duplicate open instances, keeping the earliest", async () => {
    const t = await dailyTask();
    sqlite.exec(`INSERT INTO tasks (title, due_at, series_id) VALUES ('dup', '2026-10-18T00:00', ${t.seriesId})`);
    await repairSeries();
    expect((await one()).id).toBe(t.id);
  });

  it("recreates a missing open instance after the last completed one", async () => {
    const t = await dailyTask();
    sqlite.exec(`UPDATE tasks SET done = 1 WHERE id = ${t.id}`); // completed, but next never created
    await repairSeries();
    expect((await one()).dueAt).toBe("2026-10-17T00:00");
  });
});

describe("notifications", () => {
  it("changing the due time clears notified_at; other edits keep it", async () => {
    at("2026-10-16T09:00:00");
    const id = await createTask({ title: "Call", dueAt: "2026-10-16T10:00", hasTime: true });
    const notified = () => (sqlite.prepare("SELECT notified_at FROM tasks WHERE id = ?").get(id) as { notified_at: string | null }).notified_at;
    sqlite.exec(`UPDATE tasks SET notified_at = '2026-10-16T10:00:05' WHERE id = ${id}`);
    await updateTask(id, { title: "Call back", dueAt: "2026-10-16T10:00" });
    expect(notified()).toBe("2026-10-16T10:00:05");
    await updateTask(id, { dueAt: "2026-10-16T11:00" });
    expect(notified()).toBeNull();
  });
});

describe("views", () => {
  it("Today pins overdue first; Upcoming starts tomorrow", async () => {
    at("2026-10-16T12:00:00");
    await createTask({ title: "later today", dueAt: "2026-10-16T18:00", hasTime: true });
    await createTask({ title: "date-only today", dueAt: "2026-10-16T00:00" });
    await createTask({ title: "this morning", dueAt: "2026-10-16T08:00", hasTime: true });
    await createTask({ title: "yesterday", dueAt: "2026-10-15T00:00" });
    await createTask({ title: "tomorrow", dueAt: "2026-10-17T00:00" });
    await createTask({ title: "undated" });

    expect((await listTasks("today")).map((t) => t.title)).toEqual([
      "yesterday",
      "this morning",
      "date-only today",
      "later today",
    ]);
    expect((await listTasks("upcoming")).map((t) => t.title)).toEqual(["tomorrow"]);
    expect((await listTasks("all")).slice(-1)[0]?.title).toBe("undated");
  });
});

describe("backup", () => {
  async function seed() {
    await completeTask(await dailyTask()); // series + done instance + open instance + completion
    const fyp = (sqlite.prepare("SELECT id FROM categories WHERE name = 'FYP'").get() as { id: number }).id;
    await createTask({ title: "Write chapter 2", categoryId: fyp, priority: 2 });
  }
  const count = (t: string) => (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

  it("round-trips through JSON with replace", async () => {
    await seed();
    const json = JSON.stringify(await exportBackup());
    const before = (await open()).map((t) => [t.title, t.dueAt, t.rrule, t.categoryId !== null]);
    sqlite.exec("DELETE FROM tasks; DELETE FROM recurrence_rules;");

    await importBackup(validateBackup(JSON.parse(json)), "replace");
    expect((await open()).map((t) => [t.title, t.dueAt, t.rrule, t.categoryId !== null])).toEqual(before);
    expect(await listTasks("done")).toHaveLength(1);
    expect(count("completions")).toBe(1);
    expect(count("categories")).toBe(4);

    // Series links survive: completing the imported instance spawns the next one.
    await completeTask((await open()).find((t) => t.rrule)!);
    expect((await open()).find((t) => t.rrule)!.dueAt).toBe("2026-10-18T00:00");
  });

  it("merge adds alongside existing data and reuses categories by name", async () => {
    await seed();
    const b = await exportBackup();
    await importBackup(b, "merge");
    expect(await open()).toHaveLength(4);
    expect(count("categories")).toBe(4);
    const chapters = (await open()).filter((t) => t.title === "Write chapter 2");
    expect(new Set(chapters.map((t) => t.categoryId)).size).toBe(1);
  });

  it("rejects files that aren't backups", () => {
    expect(() => validateBackup({ hello: 1 })).toThrow(/isn't a Task Widget backup/);
    expect(() => validateBackup({ format: "task-widget-backup", version: 99 })).toThrow(/newer version/);
    expect(() =>
      validateBackup({ format: "task-widget-backup", version: 1, categories: [], recurrence_rules: [], tasks: [{}], completions: [] }),
    ).toThrow(/without a title/);
  });
});

describe("manual order", () => {
  it("drag order wins within a day; unsorted tasks fall back to time", async () => {
    const { reorderTasks } = await import("./tasks");
    at("2026-10-16T08:00:00");
    const a = await createTask({ title: "a 9am", dueAt: "2026-10-16T09:00", hasTime: true });
    const b = await createTask({ title: "b 10am", dueAt: "2026-10-16T10:00", hasTime: true });
    const c = await createTask({ title: "c 11am", dueAt: "2026-10-16T11:00", hasTime: true });
    await createTask({ title: "tomorrow", dueAt: "2026-10-17T00:00" });
    expect((await listTasks("all")).map((t) => t.title)).toEqual(["a 9am", "b 10am", "c 11am", "tomorrow"]);
    await reorderTasks([c, a, b]);
    expect((await listTasks("all")).map((t) => t.title)).toEqual(["c 11am", "a 9am", "b 10am", "tomorrow"]);
    expect((await listTasks("today")).map((t) => t.title)).toEqual(["c 11am", "a 9am", "b 10am"]);
  });
});

describe("calendar", () => {
  it("projects future occurrences after the open instance only", async () => {
    await dailyTask(); // open instance due 2026-10-16 (today in dailyTask)
    const p = await projectOccurrences("2026-10-14", "2026-10-20");
    expect(p.map((o) => o.dueAt)).toEqual(["2026-10-17T00:00", "2026-10-18T00:00", "2026-10-19T00:00"]);
    expect(p[0]).toMatchObject({ title: "Logbook", hasTime: false });
  });

  it("an overdue date-only instance still projects today onwards", async () => {
    await dailyTask();
    at("2026-10-20T15:00:00"); // instance (Oct 16) is now overdue
    expect((await projectOccurrences("2026-10-19", "2026-10-22")).map((o) => o.dueAt)).toEqual([
      "2026-10-20T00:00",
      "2026-10-21T00:00",
    ]);
  });

  it("timed occurrences that already passed today are not projected", async () => {
    at("2026-10-16T09:00:00");
    const id = await createTask({ title: "Standup", dueAt: "2026-10-15T08:30", hasTime: true });
    const [t] = (await open()).filter((x) => x.id === id);
    await saveTask(t, {}, "FREQ=DAILY", "future"); // instance stays Oct 15 08:30 (overdue)
    expect((await projectOccurrences("2026-10-16", "2026-10-18")).map((o) => o.dueAt)).toEqual(["2026-10-17T08:30"]);
  });

  it("stopped series are not projected", async () => {
    const t = await dailyTask();
    await saveTask(t, {}, null);
    expect(await projectOccurrences("2026-10-01", "2026-11-01")).toEqual([]);
  });

  it("lists a range and a single day (open first, then done)", async () => {
    const { listTasksBetween } = await import("./tasks");
    at("2026-10-16T09:00:00");
    await createTask({ title: "a", dueAt: "2026-10-16T10:00", hasTime: true });
    const b = await createTask({ title: "b", dueAt: "2026-10-16T00:00" });
    await createTask({ title: "c", dueAt: "2026-10-31T00:00" });
    await createTask({ title: "next month", dueAt: "2026-11-01T00:00" });
    await completeTask((await open()).find((t) => t.id === b)!);
    expect((await listTasksBetween("2026-10-01", "2026-11-01")).map((t) => t.title)).toEqual(["b", "a", "c"]);
    expect((await listTasks("day", new Date(), "2026-10-16")).map((t) => [t.title, t.done])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("moveToDate keeps the time and re-arms the notification", async () => {
    const { moveToDate } = await import("./tasks");
    at("2026-10-16T09:00:00");
    const id = await createTask({ title: "Call", dueAt: "2026-10-16T14:30", hasTime: true });
    sqlite.exec(`UPDATE tasks SET notified_at = '2026-10-16T14:30:05' WHERE id = ${id}`);
    await moveToDate((await open())[0], "2026-10-22");
    expect(await one()).toMatchObject({ dueAt: "2026-10-22T14:30", hasTime: true });
    expect(sqlite.prepare("SELECT notified_at FROM tasks").get()).toEqual({ notified_at: null });
    const id2 = await createTask({ title: "Undated" });
    await moveToDate((await open()).find((t) => t.id === id2)!, "2026-10-23");
    expect((await open()).find((t) => t.id === id2)).toMatchObject({ dueAt: "2026-10-23T00:00", hasTime: false });
  });
});

describe("no date", () => {
  it("lists only open, undated tasks", async () => {
    at("2026-10-16T09:00:00");
    await createTask({ title: "someday" });
    await createTask({ title: "dated", dueAt: "2026-10-20T00:00" });
    const done = await createTask({ title: "finished" });
    await completeTask((await open()).find((t) => t.id === done)!);
    expect((await listTasks("nodate")).map((t) => t.title)).toEqual(["someday"]);
  });
});
