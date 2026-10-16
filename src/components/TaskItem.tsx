import type { CSSProperties } from "react";
import type { Category, Task, TaskInput } from "../db/tasks";
import { formatDue, isOverdue } from "../lib/dates";
import { TaskEditor } from "./TaskEditor";

interface Props {
  task: Task;
  category: Category | undefined;
  categories: Category[];
  editing: boolean;
  onToggleEdit: () => void;
  onToggleDone: () => void;
  onSave: (patch: Partial<TaskInput>) => void;
  onDelete: () => void;
}

export function TaskItem(p: Props) {
  const { task, category } = p;
  const overdue = !task.done && isOverdue(task.dueAt, task.hasTime);
  const cls = ["task", `prio-${task.priority}`, overdue && "overdue", task.done && "done"]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={cls}>
      <div className="task-row">
        <input
          type="checkbox"
          className="check"
          checked={task.done}
          onChange={p.onToggleDone}
          aria-label={task.done ? "Mark not done" : "Mark done"}
        />
        <button className="task-main" onClick={p.onToggleEdit}>
          <span className="task-title">{task.title}</span>
          {(task.dueAt || category) && (
            <span className="task-meta">
              {task.dueAt && <span className="due">{formatDue(task.dueAt, task.hasTime)}</span>}
              {category && (
                <span className="chip" style={{ "--chip": category.color } as CSSProperties}>
                  {category.name}
                </span>
              )}
            </span>
          )}
        </button>
      </div>
      {p.editing && (
        <TaskEditor
          task={task}
          categories={p.categories}
          onSave={p.onSave}
          onCancel={p.onToggleEdit}
          onDelete={p.onDelete}
        />
      )}
    </li>
  );
}
