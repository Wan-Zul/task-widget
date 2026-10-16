// Recurring tasks. A series (recurrence_rules row) is the template; `tasks` holds its
// instances. An active series always has exactly ONE open instance, so missed occurrences
// show up as a single overdue task.
//
// tauri-plugin-sql runs each statement on a pooled connection, so multi-step changes
// aren't transactional. Writes are ordered so that an interruption leaves at worst a
// series with zero or two open instances, and repairSeries() fixes that on startup.

import { db } from "./client";
import { setDone, updateTask, type Task, type TaskInput } from "./tasks";
import { firstOnOrAfter, nextDue, occurrencesBetween } from "../recurrence/next";
import { nowLocal } from "../lib/dates";

interface SeriesRow {
  id: number;
  title: string;
  notes: string | null;
  priority: number;
  category_id: number | null;
  rrule: string;
  dtstart: string;
  has_time: number;
  active: number;
}

export type EditScope = "this" | "future";

const todayStart = () => `${nowLocal().slice(0, 10)}T00:00`;

async function getSeries(id: number): Promise<SeriesRow | undefined> {
  const rows = await (await db()).select<SeriesRow[]>("SELECT * FROM recurrence_rules WHERE id = $1", [id]);
  return rows[0];
}

async function insertInstance(s: SeriesRow, due: string): Promise<void> {
  await (await db()).execute(
    `INSERT INTO tasks (title, notes, due_at, has_time, priority, category_id, series_id, sort)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
    [s.title, s.notes, due, s.has_time, s.priority, s.category_id, s.id],
  );
}

async function deactivate(seriesId: number): Promise<void> {
  await (await db()).execute("UPDATE recurrence_rules SET active = 0 WHERE id = $1", [seriesId]);
}

/** Create the instance after `due`, or end the series if the rule has run out. */
async function spawnNext(s: SeriesRow, due: string): Promise<void> {
  const next = nextDue({ rrule: s.rrule, dtstart: s.dtstart, due, hasTime: !!s.has_time, now: nowLocal() });
  if (next) await insertInstance(s, next);
  else await deactivate(s.id);
}

/**
 * Save edits from the task editor.
 * `rrule` is the rule chosen in the editor (null = doesn't repeat). For a recurring task,
 * `scope` picks "this one only" (instance) vs "all future" (template + open instance).
 */
export async function saveTask(
  task: Task,
  patch: Partial<TaskInput>,
  rrule: string | null,
  scope: EditScope = "future",
): Promise<void> {
  const d = await db();
  const wasRecurring = task.seriesId != null && task.rrule != null;

  if (!rrule) {
    if (wasRecurring) {
      // Stop recurring: the current instance stays as a one-off.
      await deactivate(task.seriesId!);
      await d.execute("UPDATE tasks SET series_id = NULL WHERE id = $1", [task.id]);
    }
    return updateTask(task.id, patch);
  }

  if (wasRecurring && scope === "this" && rrule === task.rrule) {
    return updateTask(task.id, patch);
  }

  // New series, or "all future": (re)write the template. The rule anchors on the edited due
  // date, and the open instance moves to the first occurrence on or after it.
  const m = { ...task, ...patch };
  const hasTime = !!(m.dueAt && m.hasTime);
  const dtstart = m.dueAt ?? todayStart();
  const first = firstOnOrAfter(rrule, dtstart, dtstart);
  const values = [m.title, m.notes ?? null, m.priority, m.categoryId ?? null, rrule, dtstart, hasTime ? 1 : 0];

  let seriesId = task.seriesId;
  if (wasRecurring) {
    await d.execute(
      `UPDATE recurrence_rules SET title = $1, notes = $2, priority = $3, category_id = $4,
         rrule = $5, dtstart = $6, has_time = $7 WHERE id = $8`,
      [...values, seriesId],
    );
  } else {
    const res = await d.execute(
      `INSERT INTO recurrence_rules (title, notes, priority, category_id, rrule, dtstart, has_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      values,
    );
    seriesId = res.lastInsertId as number;
    await d.execute("UPDATE tasks SET series_id = $1 WHERE id = $2", [seriesId, task.id]);
  }
  await updateTask(task.id, { ...patch, dueAt: first ?? dtstart, hasTime });
}

/** Tick a task. For a recurring one, record it and create the next instance. */
export async function completeTask(task: Task): Promise<void> {
  const d = await db();
  const now = nowLocal(true);
  await d.execute("INSERT INTO completions (task_id, series_id, due_at, completed_at) VALUES ($1, $2, $3, $4)", [
    task.id,
    task.rrule ? task.seriesId : null,
    task.dueAt,
    now,
  ]);
  await setDone(task.id, true);
  if (task.seriesId != null && task.rrule) {
    const s = await getSeries(task.seriesId);
    if (s?.active) await spawnNext(s, task.dueAt ?? todayStart());
  }
}

/** Un-tick a task. For a recurring one, drop the instance that completing it created. */
export async function uncompleteTask(task: Task): Promise<void> {
  const d = await db();
  if (task.seriesId != null) {
    await d.execute("DELETE FROM tasks WHERE series_id = $1 AND done = 0 AND id != $2", [task.seriesId, task.id]);
  }
  await d.execute("DELETE FROM completions WHERE task_id = $1", [task.id]);
  await setDone(task.id, false);
}

/** Move a recurring instance to its next occurrence without recording a completion. */
export async function skipOccurrence(task: Task): Promise<void> {
  if (task.seriesId == null || !task.rrule || !task.dtstart) return;
  const next = nextDue({
    rrule: task.rrule,
    dtstart: task.dtstart,
    due: task.dueAt ?? todayStart(),
    hasTime: task.hasTime,
    now: nowLocal(),
  });
  if (next) {
    await updateTask(task.id, { dueAt: next });
  } else {
    await deactivate(task.seriesId);
    await (await db()).execute("UPDATE tasks SET series_id = NULL WHERE id = $1", [task.id]);
  }
}

/** Delete a task. For a recurring one, end the series too (completion history is kept). */
export async function removeTask(task: Task): Promise<void> {
  const d = await db();
  if (task.seriesId != null && task.rrule) await deactivate(task.seriesId);
  await d.execute("DELETE FROM tasks WHERE id = $1", [task.id]);
}

/** Restore the one-open-instance invariant after an interrupted write. */
export async function repairSeries(): Promise<void> {
  const d = await db();
  // Duplicates: keep the earliest open instance of each active series.
  await d.execute(
    `DELETE FROM tasks WHERE done = 0 AND series_id IN (SELECT id FROM recurrence_rules WHERE active = 1)
       AND id NOT IN (
         SELECT (SELECT t2.id FROM tasks t2 WHERE t2.series_id = t.series_id AND t2.done = 0
                 ORDER BY t2.due_at, t2.id LIMIT 1)
         FROM tasks t WHERE t.done = 0 AND t.series_id IS NOT NULL GROUP BY t.series_id)`,
  );
  // Orphans: active series with no open instance -> continue from the latest completed one.
  const orphans = await d.select<(SeriesRow & { last_due: string | null })[]>(
    `SELECT r.*, (SELECT MAX(t.due_at) FROM tasks t WHERE t.series_id = r.id) AS last_due
     FROM recurrence_rules r
     WHERE r.active = 1 AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.series_id = r.id AND t.done = 0)`,
  );
  for (const s of orphans) {
    if (s.last_due) await spawnNext(s, s.last_due);
    else await insertInstance(s, firstOnOrAfter(s.rrule, s.dtstart, s.dtstart) ?? s.dtstart);
  }
}

/** A future occurrence of a recurring task that doesn't exist as a task yet (calendar only). */
export interface ProjectedOccurrence {
  seriesId: number;
  title: string;
  dueAt: string;
  hasTime: boolean;
  categoryId: number | null;
}

/**
 * Future occurrences of active series in [from, to) ('YYYY-MM-DD'), for the calendar.
 * Only dates after the series' open instance (the real, editable task) that haven't passed
 * are included.
 */
export async function projectOccurrences(from: string, to: string): Promise<ProjectedOccurrence[]> {
  const series = await (await db()).select<(SeriesRow & { open_due: string | null })[]>(
    `SELECT r.*, (SELECT MIN(t.due_at) FROM tasks t WHERE t.series_id = r.id AND t.done = 0) AS open_due
     FROM recurrence_rules r WHERE r.active = 1`,
  );
  const out: ProjectedOccurrence[] = [];
  for (const s of series) {
    // Same cut-off as nextDue(): timed occurrences count from now, date-only ones from today.
    const cutoff = s.has_time ? nowLocal() : todayStart();
    for (const due of occurrencesBetween(s.rrule, s.dtstart, `${from}T00:00`, `${to}T00:00`)) {
      if ((s.open_due && due <= s.open_due) || due < cutoff) continue;
      out.push({ seriesId: s.id, title: s.title, dueAt: due, hasTime: !!s.has_time, categoryId: s.category_id });
    }
  }
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
