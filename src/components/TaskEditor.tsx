import { useState } from "react";
import { PRIORITY_LABELS, type Category, type Priority, type Task, type TaskInput } from "../db/tasks";
import type { EditScope } from "../db/series";
import { datePart, nowLocal, timePart } from "../lib/dates";
import { fromRRule, toRRule } from "../recurrence/rules";
import { RecurrencePicker, type RecurrenceValue } from "./RecurrencePicker";

interface Props {
  task: Task;
  categories: Category[];
  onSave: (patch: Partial<TaskInput>, rrule: string | null, scope: EditScope) => void;
  onSkip: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

export function TaskEditor({ task, categories, onSave, onSkip, onCancel, onDelete }: Props) {
  const recurring = task.seriesId != null && task.rrule != null;
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [date, setDate] = useState(task.dueAt ? datePart(task.dueAt) : "");
  const [time, setTime] = useState(task.dueAt && task.hasTime ? timePart(task.dueAt) : "");
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [categoryId, setCategoryId] = useState<number | null>(task.categoryId);
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(
    recurring ? (fromRRule(task.rrule!) ?? "custom") : null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rrule = recurrence === "custom" ? task.rrule : recurrence ? toRRule(recurrence) : null;
  const ruleChanged = recurring && rrule !== task.rrule;

  function save(scope: EditScope) {
    if (!title.trim()) return;
    onSave(
      {
        title: title.trim(),
        notes: notes.trim() || null,
        dueAt: date ? `${date}T${time || "00:00"}` : null,
        hasTime: !!(date && time),
        priority,
        categoryId,
      },
      rrule,
      scope,
    );
  }

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        save("future");
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
      {!task.done && (
        <RecurrencePicker value={recurrence} anchorDate={date || nowLocal().slice(0, 10)} onChange={setRecurrence} />
      )}
      <div className="editor-actions">
        <button
          type="button"
          className="danger"
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? "Sure?" : recurring ? "Delete series" : "Delete"}
        </button>
        {recurring && !task.done && (
          <button type="button" onClick={onSkip} title="Move to the next occurrence without completing">
            Skip
          </button>
        )}
        <span className="spacer" />
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {recurring && rrule && !ruleChanged ? (
          <>
            <button type="button" onClick={() => save("this")} title="Only change this occurrence">
              This one
            </button>
            <button type="submit" className="primary" title="Change this and all future occurrences">
              All future
            </button>
          </>
        ) : (
          <button type="submit" className="primary">
            Save
          </button>
        )}
      </div>
    </form>
  );
}
