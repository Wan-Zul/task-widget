import { useState } from "react";
import { PRIORITY_LABELS, type Category, type Priority, type Task, type TaskInput } from "../db/tasks";
import { datePart, timePart } from "../lib/dates";

interface Props {
  task: Task;
  categories: Category[];
  onSave: (patch: Partial<TaskInput>) => void;
  onCancel: () => void;
  onDelete: () => void;
}

export function TaskEditor({ task, categories, onSave, onCancel, onDelete }: Props) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [date, setDate] = useState(task.dueAt ? datePart(task.dueAt) : "");
  const [time, setTime] = useState(task.dueAt && task.hasTime ? timePart(task.dueAt) : "");
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [categoryId, setCategoryId] = useState<number | null>(task.categoryId);

  function save() {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      notes: notes.trim() || null,
      dueAt: date ? `${date}T${time || "00:00"}` : null,
      hasTime: !!(date && time),
      priority,
      categoryId,
    });
  }

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" autoFocus />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} />
      <div className="editor-row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!date}
          aria-label="Due time"
        />
      </div>
      <div className="editor-row">
        <select
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value) as Priority)}
          aria-label="Priority"
        >
          {([0, 1, 2] as Priority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]} priority
            </option>
          ))}
        </select>
        <select
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          aria-label="Category"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="editor-actions">
        <button type="button" className="danger" onClick={onDelete}>
          Delete
        </button>
        <span className="spacer" />
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Save
        </button>
      </div>
    </form>
  );
}
