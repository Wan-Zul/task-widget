import { useCallback, useEffect, useState } from "react";
import {
  createTask,
  findOrCreateCategory,
  listCategories,
  listTasks,
  reorderTasks,
  type Category,
  type Task,
  type TaskInput,
  type View,
} from "../db/tasks";
import {
  completeTask,
  removeTask,
  repairSeries,
  saveTask,
  skipOccurrence,
  uncompleteTask,
  type EditScope,
} from "../db/series";
import type { ParsedQuickAdd } from "../parse/quickAdd";
import { nowLocal, toLocal } from "../lib/dates";

// Module-level so React StrictMode's double effect run doesn't repair twice.
const seriesReady = repairSeries();

/** Quick add gives the task a due date matching the view, so it doesn't vanish from it. */
export function quickAddDue(view: View, day?: string): string | null {
  const now = new Date();
  if (view === "day" && day) return `${day}T00:00`;
  if (view === "today") return `${nowLocal().slice(0, 10)}T00:00`;
  if (view === "upcoming") return `${toLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)).slice(0, 10)}T00:00`;
  return null;
}

/** Task list state and every mutation, shared by the widget and notch layouts. */
export function useTasks(onError: (e: unknown) => void) {
  const [view, setViewState] = useState<View>("today");
  /** Selected calendar date for the "day" view, YYYY-MM-DD. */
  const [day, setDay] = useState(() => nowLocal().slice(0, 10));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  /** Bumped after every change, so other views of the data (e.g. the notch pill) can refresh. */
  const [version, setVersion] = useState(0);

  const reload = useCallback(async () => {
    try {
      await seriesReady.catch(() => {}); // a failed repair shouldn't hide the list
      setTasks(await listTasks(view, new Date(), day));
    } catch (e) {
      onError(e);
    }
  }, [view, day]);

  const reloadCategories = useCallback(() => listCategories().then(setCategories, onError), []);

  useEffect(() => {
    reload();
    // Overdue/Today depend on the clock (and the laptop may have slept), so refresh each minute.
    const timer = window.setInterval(reload, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    reloadCategories();
    seriesReady.catch(onError);
  }, []);

  // Run a mutation, surface DB errors, then refresh.
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      onError(e);
    }
    setVersion((v) => v + 1);
    await reload();
  }

  const closeEditorAnd = (fn: () => Promise<unknown>) => {
    setEditingId(null);
    return run(fn);
  };

  /** Create a task from quick add; shorthand may add a category and a recurrence. */
  async function addParsed(q: ParsedQuickAdd, fallbackDue: string | null) {
    const categoryId = q.category ? await findOrCreateCategory(q.category) : null;
    if (q.category) await reloadCategories();
    const dueAt = q.dueAt ?? (q.rrule ? (fallbackDue ?? quickAddDue("today")) : fallbackDue);
    const id = await createTask({ title: q.title, dueAt, hasTime: q.hasTime, priority: q.priority ?? 1, categoryId });
    if (q.rrule) {
      const [task] = (await listTasks("all")).filter((t) => t.id === id);
      if (task) await saveTask(task, {}, q.rrule, "future");
    }
  }

  return {
    view,
    setView: (v: View) => {
      setEditingId(null);
      setViewState(v);
    },
    day,
    /** Show one calendar date in the "day" view. */
    selectDay: (d: string) => {
      setEditingId(null);
      setDay(d);
      setViewState("day");
    },
    tasks,
    categories,
    editingId,
    setEditingId,
    version,
    reload,
    reloadCategories,
    /** `fallbackDue` overrides the view's default date (e.g. the selected calendar day). */
    add: (q: ParsedQuickAdd, fallbackDue: string | null = quickAddDue(view, day)) => run(() => addParsed(q, fallbackDue)),
    toggleDone: (t: Task) => run(() => (t.done ? uncompleteTask(t) : completeTask(t))),
    save: (t: Task, patch: Partial<TaskInput>, rrule: string | null, scope: EditScope) =>
      closeEditorAnd(() => saveTask(t, patch, rrule, scope)),
    skip: (t: Task) => closeEditorAnd(() => skipOccurrence(t)),
    remove: (t: Task) => closeEditorAnd(() => removeTask(t)),
    reorder: (next: Task[], ids: number[]) => {
      setTasks(next); // instant, then persist
      return run(() => reorderTasks(ids));
    },
    /** Run any data change through the same error/refresh path. */
    run,
  };
}

export type TasksApi = ReturnType<typeof useTasks>;
