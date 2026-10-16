import type { Category, Task, TaskInput } from "../db/tasks";
import type { EditScope } from "../db/series";
import { datePart, formatDue } from "../lib/dates";
import { TaskItem } from "./TaskItem";

interface Props {
  tasks: Task[];
  categories: Category[];
  editingId: number | null;
  emptyText: string;
  /** Insert a heading whenever the due day changes (Upcoming view). */
  groupByDay?: boolean;
  onEdit: (id: number | null) => void;
  onToggleDone: (t: Task) => void;
  onSave: (t: Task, patch: Partial<TaskInput>, rrule: string | null, scope: EditScope) => void;
  onSkip: (t: Task) => void;
  onDelete: (t: Task) => void;
}

export function TaskList(p: Props) {
  if (!p.tasks.length) return <p className="empty">{p.emptyText}</p>;
  const byId = new Map(p.categories.map((c) => [c.id, c]));

  const items: React.ReactNode[] = [];
  let lastDay: string | null = null;
  for (const t of p.tasks) {
    const day = t.dueAt ? datePart(t.dueAt) : null;
    if (p.groupByDay && day && day !== lastDay) {
      items.push(
        <li key={`day-${day}`} className="day-heading">
          {formatDue(day, false)}
        </li>,
      );
      lastDay = day;
    }
    items.push(
      <TaskItem
        key={t.id}
        task={t}
        category={t.categoryId != null ? byId.get(t.categoryId) : undefined}
        categories={p.categories}
        editing={p.editingId === t.id}
        onToggleEdit={() => p.onEdit(p.editingId === t.id ? null : t.id)}
        onToggleDone={() => p.onToggleDone(t)}
        onSave={(patch, rrule, scope) => p.onSave(t, patch, rrule, scope)}
        onSkip={() => p.onSkip(t)}
        onDelete={() => p.onDelete(t)}
      />,
    );
  }

  return <ul className="task-list">{items}</ul>;
}
