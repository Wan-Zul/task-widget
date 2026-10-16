import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Category, Task, TaskInput } from "../db/tasks";
import type { EditScope } from "../db/series";
import { formatDue, isOverdue, nowLocal } from "../lib/dates";
import { missedCount } from "../recurrence/next";
import { describe, fromRRule } from "../recurrence/rules";
import { TaskEditor } from "./TaskEditor";

interface Props {
  task: Task;
  /** Draggable to reorder (not in Done, and not while its editor is open). */
  sortable: boolean;
  category: Category | undefined;
  categories: Category[];
  editing: boolean;
  onToggleEdit: () => void;
  onToggleDone: () => void;
  onSave: (patch: Partial<TaskInput>, rrule: string | null, scope: EditScope) => void;
  onSkip: () => void;
  onDelete: () => void;
}

export function TaskItem(p: Props) {
  const { task, category } = p;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task }, // read by DragArea when dropped on a calendar day
    disabled: !p.sortable || p.editing,
  });
  const overdue = !task.done && isOverdue(task.dueAt, task.hasTime);
  const preset = task.rrule ? fromRRule(task.rrule) : null;
  const missed =
    overdue && task.rrule && task.dtstart && task.dueAt
      ? missedCount({ rrule: task.rrule, dtstart: task.dtstart, due: task.dueAt, hasTime: task.hasTime, now: nowLocal() })
      : 0;
  const cls = ["task", `prio-${task.priority}`, overdue && "overdue", task.done && "done", isDragging && "dragging"]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      ref={setNodeRef}
      className={cls}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {/* Drag from anywhere on the row; tabIndex is dropped so the row isn't an extra tab stop. */}
      <div className="task-row" {...attributes} {...listeners} tabIndex={undefined} role={undefined}>
        <input
          type="checkbox"
          className="check"
          checked={task.done}
          onChange={p.onToggleDone}
          aria-label={task.done ? "Mark not done" : "Mark done"}
        />
        <button className="task-main" onClick={p.onToggleEdit}>
          <span className="task-title">{task.title}</span>
          {(task.dueAt || category || task.rrule) && (
            <span className="task-meta">
              {task.dueAt && <span className="due">{formatDue(task.dueAt, task.hasTime)}</span>}
              {task.rrule && (
                <span className="repeat" title={preset ? describe(preset) : task.rrule}>
                  ↻{missed > 0 && ` missed ${missed}${missed >= 99 ? "+" : ""}`}
                </span>
              )}
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
          onSkip={p.onSkip}
          onCancel={p.onToggleEdit}
          onDelete={p.onDelete}
        />
      )}
    </li>
  );
}
