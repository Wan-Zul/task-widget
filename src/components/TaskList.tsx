import type { ReactNode } from "react";
import { useDndMonitor, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { groupKey, type Category, type Task, type TaskInput, type View } from "../db/tasks";
import type { EditScope } from "../db/series";
import { formatDue } from "../lib/dates";
import { TaskItem } from "./TaskItem";

interface Props {
  tasks: Task[];
  view: View;
  categories: Category[];
  editingId: number | null;
  emptyText: string;
  onEdit: (id: number | null) => void;
  onToggleDone: (t: Task) => void;
  onSave: (t: Task, patch: Partial<TaskInput>, rrule: string | null, scope: EditScope) => void;
  onSkip: (t: Task) => void;
  onDelete: (t: Task) => void;
  /** New full list order (for an instant update) and the reordered group's ids. */
  onReorder: (tasks: Task[], groupIds: number[]) => void;
}

/** Grouped, sortable task list. Must sit inside a DragArea (the drag-and-drop context). */
export function TaskList(p: Props) {
  useDndMonitor({ onDragEnd });

  const byId = new Map(p.categories.map((c) => [c.id, c]));
  const sortable = p.view !== "done";
  const now = new Date();

  // Consecutive runs of the same group key (the SQL orders by group first).
  const groups: { key: string; tasks: Task[] }[] = [];
  for (const t of p.tasks) {
    const key = sortable ? groupKey(t, p.view, now) : "all";
    const last = groups[groups.length - 1];
    if (last?.key === key) last.tasks.push(t);
    else groups.push({ key, tasks: [t] });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    // Drops on calendar days (string ids) are handled by DragArea.
    if (!over || active.id === over.id || typeof over.id !== "number") return;
    const group = groups.find((g) => g.tasks.some((t) => t.id === active.id));
    // Only reorder within a day; dropping into another day would just snap back.
    if (!group || !group.tasks.some((t) => t.id === over.id)) return;
    const ids = group.tasks.map((t) => t.id);
    const reordered = arrayMove(ids, ids.indexOf(active.id as number), ids.indexOf(over.id as number));
    const pos = new Map(reordered.map((id, i) => [id, i]));
    const groupSet = new Set(ids);
    const sortedGroup = [...group.tasks].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
    let i = 0;
    p.onReorder(
      p.tasks.map((t) => (groupSet.has(t.id) ? sortedGroup[i++] : t)),
      reordered,
    );
  }

  const heading = (key: string): ReactNode => {
    if (p.view === "upcoming") return formatDue(key, false);
    if (p.view === "today" && key === "overdue") return "Overdue";
    if (p.view === "today" && groups.length > 1) return "Today";
    if (p.view === "day" && key === "done") return "Done";
    return null;
  };

  if (!p.tasks.length) return <p className="empty">{p.emptyText}</p>;
  return (
    <ul className="task-list">
      {groups.map((g) => {
        const h = sortable ? heading(g.key) : null;
        return (
          <SortableContext key={g.key} items={g.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {h && <li className="day-heading">{h}</li>}
            {g.tasks.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                sortable={sortable && !t.done}
                category={t.categoryId != null ? byId.get(t.categoryId) : undefined}
                categories={p.categories}
                editing={p.editingId === t.id}
                onToggleEdit={() => p.onEdit(p.editingId === t.id ? null : t.id)}
                onToggleDone={() => p.onToggleDone(t)}
                onSave={(patch, rrule, scope) => p.onSave(t, patch, rrule, scope)}
                onSkip={() => p.onSkip(t)}
                onDelete={() => p.onDelete(t)}
              />
            ))}
          </SortableContext>
        );
      })}
    </ul>
  );
}
