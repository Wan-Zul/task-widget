import type { Category, Task, TaskInput } from "../db/tasks";
import { TaskItem } from "./TaskItem";

interface Props {
  tasks: Task[];
  categories: Category[];
  editingId: number | null;
  emptyText: string;
  onEdit: (id: number | null) => void;
  onToggleDone: (t: Task) => void;
  onSave: (id: number, patch: Partial<TaskInput>) => void;
  onDelete: (id: number) => void;
}

export function TaskList(p: Props) {
  if (!p.tasks.length) return <p className="empty">{p.emptyText}</p>;
  const byId = new Map(p.categories.map((c) => [c.id, c]));

  return (
    <ul className="task-list">
      {p.tasks.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          category={t.categoryId != null ? byId.get(t.categoryId) : undefined}
          categories={p.categories}
          editing={p.editingId === t.id}
          onToggleEdit={() => p.onEdit(p.editingId === t.id ? null : t.id)}
          onToggleDone={() => p.onToggleDone(t)}
          onSave={(patch) => p.onSave(t.id, patch)}
          onDelete={() => p.onDelete(t.id)}
        />
      ))}
    </ul>
  );
}
