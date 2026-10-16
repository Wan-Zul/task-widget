// JSON backup. Format is versioned so future schema changes can still read old backups.
// Window/hotkey settings aren't included: they belong to this machine, not to the data.

import { db } from "./client";
import { nowLocal } from "../lib/dates";

export const BACKUP_FORMAT = "task-widget-backup";
export const BACKUP_VERSION = 1;

type Row = Record<string, unknown>;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  categories: Row[];
  recurrence_rules: Row[];
  tasks: Row[];
  completions: Row[];
}

// Columns copied per table (ids are remapped on import).
const COLUMNS = {
  categories: ["name", "color", "sort"],
  recurrence_rules: ["title", "notes", "priority", "category_id", "rrule", "dtstart", "has_time", "active", "created_at"],
  tasks: [
    "title",
    "notes",
    "due_at",
    "has_time",
    "priority",
    "category_id",
    "done",
    "done_at",
    "series_id",
    "sort",
    "created_at",
    "updated_at",
    "notified_at",
  ],
  completions: ["task_id", "series_id", "due_at", "completed_at"],
} as const;

type Table = keyof typeof COLUMNS;

export async function exportBackup(): Promise<Backup> {
  const d = await db();
  const all = (t: Table) => d.select<Row[]>(`SELECT id, ${COLUMNS[t].join(", ")} FROM ${t} ORDER BY id`);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowLocal(true),
    categories: await all("categories"),
    recurrence_rules: await all("recurrence_rules"),
    tasks: await all("tasks"),
    completions: await all("completions"),
  };
}

/** Throws a readable error if `data` isn't a backup this version can read. */
export function validateBackup(data: unknown): Backup {
  const b = data as Partial<Backup> | null;
  if (!b || typeof b !== "object" || b.format !== BACKUP_FORMAT) throw new Error("That file isn't a Task Widget backup.");
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION)
    throw new Error(`This backup is from a newer version (format ${b.version}). Update the app first.`);
  for (const t of Object.keys(COLUMNS) as Table[]) {
    if (!Array.isArray(b[t])) throw new Error(`Backup is missing "${t}".`);
    if (!b[t]!.every((r) => r && typeof r === "object")) throw new Error(`Backup has a bad row in "${t}".`);
  }
  for (const t of b.tasks!) if (typeof t.title !== "string") throw new Error("Backup has a task without a title.");
  return b as Backup;
}

export interface ImportResult {
  tasks: number;
  categories: number;
}

/**
 * Load a backup. "merge" adds everything alongside existing data (categories with the same
 * name are reused); "replace" deletes all tasks, series, history and categories first.
 */
export async function importBackup(b: Backup, mode: "merge" | "replace"): Promise<ImportResult> {
  const d = await db();
  if (mode === "replace") {
    for (const t of ["completions", "tasks", "recurrence_rules", "categories"]) await d.execute(`DELETE FROM ${t}`);
  }

  const insert = async (table: Table, row: Row, remap: Partial<Record<string, Map<unknown, number>>>) => {
    const cols = COLUMNS[table].filter((c) => row[c] !== undefined);
    const values = cols.map((c) => (remap[c] ? (remap[c]!.get(row[c]) ?? null) : row[c]));
    const res = await d.execute(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
      values,
    );
    return res.lastInsertId as number;
  };

  const categoryIds = new Map<unknown, number>();
  let newCategories = 0;
  for (const c of b.categories) {
    const existing = await d.select<{ id: number }[]>("SELECT id FROM categories WHERE name = $1", [c.name]);
    if (existing.length) categoryIds.set(c.id, existing[0].id);
    else {
      categoryIds.set(c.id, await insert("categories", c, {}));
      newCategories++;
    }
  }

  const seriesIds = new Map<unknown, number>();
  for (const r of b.recurrence_rules) seriesIds.set(r.id, await insert("recurrence_rules", r, { category_id: categoryIds }));

  const taskIds = new Map<unknown, number>();
  for (const t of b.tasks) {
    taskIds.set(t.id, await insert("tasks", t, { category_id: categoryIds, series_id: seriesIds }));
  }

  for (const c of b.completions) await insert("completions", c, { task_id: taskIds, series_id: seriesIds });

  return { tasks: b.tasks.length, categories: newCategories };
}
