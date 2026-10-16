import { db } from "./client";
import { nowLocal } from "../lib/dates";

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
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

export type TaskInput = Pick<Task, "title"> &
  Partial<Pick<Task, "notes" | "dueAt" | "hasTime" | "priority" | "categoryId">>;

export type View = "all" | "done";

interface TaskRow {
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
}

function fromRow(r: TaskRow): Task {
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
  };
}

const VIEW_SQL: Record<View, string> = {
  // Undated tasks go last; within a day, higher priority first.
  all: `SELECT * FROM tasks WHERE done = 0
        ORDER BY due_at IS NULL, due_at, priority DESC, sort, id`,
  done: `SELECT * FROM tasks WHERE done = 1 ORDER BY done_at DESC LIMIT 200`,
};

export async function listTasks(view: View): Promise<Task[]> {
  const rows = await (await db()).select<TaskRow[]>(VIEW_SQL[view]);
  return rows.map(fromRow);
}

export async function listCategories(): Promise<Category[]> {
  return (await db()).select<Category[]>("SELECT id, name, color FROM categories ORDER BY sort, name");
}

export async function createTask(t: TaskInput): Promise<number> {
  const res = await (await db()).execute(
    `INSERT INTO tasks (title, notes, due_at, has_time, priority, category_id, sort)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort), 0) + 1 FROM tasks))`,
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
