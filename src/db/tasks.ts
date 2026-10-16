import { db } from "./client";
import { isOverdue, nowLocal, toLocal } from "../lib/dates";

export type Priority = 0 | 1 | 2;
export const PRIORITY_LABELS: Record<Priority, string> = { 0: "Low", 1: "Med", 2: "High" };

export interface Task {
  id: number;
  title: string;
  notes: string | null;
  dueAt: string | null; // floating local 'YYYY-MM-DDTHH:MM'
  hasTime: boolean;
  priority: Priority;
  categoryId: number | null;
  done: boolean;
  doneAt: string | null;
  seriesId: number | null;
  sort: number;
  /** Rule of the task's series, if it belongs to an active one. */
  rrule: string | null;
  dtstart: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

export type TaskInput = Pick<Task, "title"> &
  Partial<Pick<Task, "notes" | "dueAt" | "hasTime" | "priority" | "categoryId">>;

/** "day" lists one calendar date (open tasks, then done ones). */
export type View = "day" | "today" | "upcoming" | "all" | "done";

export interface TaskRow {
  id: number;
  title: string;
  notes: string | null;
  due_at: string | null;
  has_time: number;
  priority: number;
  category_id: number | null;
  done: number;
  done_at: string | null;
  series_id: number | null;
  sort: number;
  rrule: string | null;
  dtstart: string | null;
}

export function fromRow(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    dueAt: r.due_at,
    hasTime: !!r.has_time,
    priority: r.priority as Priority,
    categoryId: r.category_id,
    done: !!r.done,
    doneAt: r.done_at,
    seriesId: r.series_id,
    sort: r.sort,
    rrule: r.rrule,
    dtstart: r.dtstart,
  };
}

const JOIN_SERIES = `FROM tasks t LEFT JOIN recurrence_rules r ON r.id = t.series_id AND r.active = 1`;
export const TASK_SELECT = `SELECT t.*, r.rrule, r.dtstart ${JOIN_SERIES}`;

// Lists are grouped by day (Today: overdue, then today). Within a group, the manual order set
// by drag and drop comes first; unsorted tasks (sort = 0) fall back to time, then priority.
// groupKey() below must match these ORDER BY clauses.
const WITHIN_GROUP = "t.sort, t.due_at, t.priority DESC, t.id";

/** Drag-and-drop group a task belongs to in a view. */
export function groupKey(t: Task, view: View, now = new Date()): string {
  if (view === "today" && isOverdue(t.dueAt, t.hasTime, now)) return "overdue";
  if (view === "day" && t.done) return "done";
  return t.dueAt ? t.dueAt.slice(0, 10) : "none";
}

/** Query and parameters per view; times are floating local strings. */
function viewQuery(view: View, now: Date, day: string): [string, unknown[]] {
  const today = `${toLocal(now).slice(0, 10)}T00:00`;
  const tomorrow = `${toLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)).slice(0, 10)}T00:00`;
  switch (view) {
    case "today":
      // Overdue (timed before now, or date-only before today) pinned on top, then by time.
      return [
        `SELECT t.*, r.rrule, r.dtstart,
           ((t.has_time = 1 AND t.due_at < $1) OR (t.has_time = 0 AND t.due_at < $2)) AS overdue
         ${JOIN_SERIES}
         WHERE t.done = 0 AND t.due_at < $3
         ORDER BY overdue DESC, CASE WHEN overdue THEN NULL ELSE substr(t.due_at, 1, 10) END, ${WITHIN_GROUP}`,
        [toLocal(now), today, tomorrow],
      ];
    case "upcoming":
      return [
        `${TASK_SELECT} WHERE t.done = 0 AND t.due_at >= $1 ORDER BY substr(t.due_at, 1, 10), ${WITHIN_GROUP}`,
        [tomorrow],
      ];
    case "all":
      // Undated tasks go last.
      return [
        `${TASK_SELECT} WHERE t.done = 0 ORDER BY t.due_at IS NULL, substr(t.due_at, 1, 10), ${WITHIN_GROUP}`,
        [],
      ];
    case "done":
      return [`${TASK_SELECT} WHERE t.done = 1 ORDER BY t.done_at DESC LIMIT 200`, []];
    case "day":
      return [
        `${TASK_SELECT} WHERE t.due_at >= $1 AND t.due_at < $2 ORDER BY t.done, ${WITHIN_GROUP}`,
        [`${day}T00:00`, `${addDay(day, 1)}T00:00`],
      ];
  }
}

/** `day` (YYYY-MM-DD) is only used by the "day" view. */
export async function listTasks(view: View, now = new Date(), day = toLocal(now).slice(0, 10)): Promise<Task[]> {
  const [sql, params] = viewQuery(view, now, day);
  const rows = await (await db()).select<TaskRow[]>(sql, params);
  return rows.map(fromRow);
}

/** YYYY-MM-DD plus n days (calendar arithmetic in local time). */
export function addDay(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return toLocal(new Date(y, m - 1, d + n)).slice(0, 10);
}

/** Tasks (open and done) due in [from, to), as YYYY-MM-DD dates; for the calendar. */
export async function listTasksBetween(from: string, to: string): Promise<Task[]> {
  const rows = await (await db()).select<TaskRow[]>(
    `${TASK_SELECT} WHERE t.due_at >= $1 AND t.due_at < $2 ORDER BY t.due_at, t.priority DESC`,
    [`${from}T00:00`, `${to}T00:00`],
  );
  return rows.map(fromRow);
}

/** Reschedule to another day, keeping the time (drag onto the calendar). Only this instance moves. */
export async function moveToDate(task: Task, date: string): Promise<void> {
  const time = task.dueAt && task.hasTime ? task.dueAt.slice(11, 16) : "00:00";
  await updateTask(task.id, { dueAt: `${date}T${time}`, hasTime: task.hasTime && !!task.dueAt });
}

/** Save a drag-and-drop order: ids of one group, top to bottom. */
export async function reorderTasks(ids: number[]): Promise<void> {
  const d = await db();
  for (const [i, id] of ids.entries()) {
    await d.execute("UPDATE tasks SET sort = $1 WHERE id = $2", [i + 1, id]);
  }
}

export const CATEGORY_COLORS = ["#4f7cff", "#20a67a", "#d9822b", "#a35bd6", "#d64571", "#2b9fd9", "#8a8f98", "#b8a12b"];

export async function listCategories(): Promise<Category[]> {
  return (await db()).select<Category[]>("SELECT id, name, color FROM categories ORDER BY sort, name");
}

export async function createCategory(name: string, color?: string): Promise<number> {
  const d = await db();
  const [{ n }] = await d.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM categories");
  const res = await d.execute(
    "INSERT INTO categories (name, color, sort) VALUES ($1, $2, (SELECT COALESCE(MAX(sort), -1) + 1 FROM categories))",
    [name.trim(), color ?? CATEGORY_COLORS[n % CATEGORY_COLORS.length]],
  );
  return res.lastInsertId as number;
}

/** Category id by name (case-insensitive), creating it if needed. */
export async function findOrCreateCategory(name: string): Promise<number> {
  const rows = await (await db()).select<{ id: number }[]>("SELECT id FROM categories WHERE name = $1", [name.trim()]);
  return rows.length ? rows[0].id : createCategory(name);
}

export async function updateCategory(id: number, patch: { name?: string; color?: string }): Promise<void> {
  const d = await db();
  if (patch.name !== undefined) await d.execute("UPDATE categories SET name = $1 WHERE id = $2", [patch.name.trim(), id]);
  if (patch.color !== undefined) await d.execute("UPDATE categories SET color = $1 WHERE id = $2", [patch.color, id]);
}

/** Tasks in the category keep existing, without a category (FK: ON DELETE SET NULL). */
export async function deleteCategory(id: number): Promise<void> {
  await (await db()).execute("DELETE FROM categories WHERE id = $1", [id]);
}

export async function createTask(t: TaskInput): Promise<number> {
  const res = await (await db()).execute(
    `INSERT INTO tasks (title, notes, due_at, has_time, priority, category_id, sort)
     VALUES ($1, $2, $3, $4, $5, $6, 0)`,
    [
      t.title.trim(),
      t.notes ?? null,
      t.dueAt ?? null,
      t.hasTime ? 1 : 0,
      t.priority ?? 1,
      t.categoryId ?? null,
    ],
  );
  return res.lastInsertId as number;
}

const PATCH_COLUMNS = {
  title: "title",
  notes: "notes",
  dueAt: "due_at",
  hasTime: "has_time",
  priority: "priority",
  categoryId: "category_id",
} as const;

export async function updateTask(id: number, patch: Partial<TaskInput>): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(PATCH_COLUMNS)) {
    if (!(key in patch)) continue;
    let v = patch[key as keyof TaskInput] as unknown;
    if (typeof v === "boolean") v = v ? 1 : 0;
    values.push(v ?? null);
    sets.push(`${col} = $${values.length}`);
  }
  if (!sets.length) return;
  if ("dueAt" in patch) {
    // A new due time deserves a new notification. SET expressions see the old row values.
    values.push(patch.dueAt ?? null);
    sets.push(`notified_at = CASE WHEN due_at IS $${values.length} THEN notified_at ELSE NULL END`);
  }
  values.push(nowLocal(true), id);
  await (await db()).execute(
    `UPDATE tasks SET ${sets.join(", ")}, updated_at = $${values.length - 1} WHERE id = $${values.length}`,
    values,
  );
}

export async function setDone(id: number, done: boolean): Promise<void> {
  const now = nowLocal(true);
  await (await db()).execute(
    "UPDATE tasks SET done = $1, done_at = $2, updated_at = $3 WHERE id = $4",
    [done ? 1 : 0, done ? now : null, now, id],
  );
}

export async function deleteTask(id: number): Promise<void> {
  await (await db()).execute("DELETE FROM tasks WHERE id = $1", [id]);
}
