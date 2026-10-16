import { useMemo, useRef, useState, type CSSProperties } from "react";
import { PRIORITY_LABELS, type Category } from "../db/tasks";
import { formatDue } from "../lib/dates";
import { parseQuickAdd, type ParsedQuickAdd } from "../parse/quickAdd";
import { describe, fromRRule } from "../recurrence/rules";

interface Props {
  categories: Category[];
  /** Where a task goes when no date is typed, e.g. "Today", "17 Oct", "No date". */
  target: string;
  onAdd: (parsed: ParsedQuickAdd) => void;
}

/**
 * Task input with an Add button (Enter works too). Shorthand like "fri 5pm #FYP !high" shows
 * as chips before adding; otherwise a chip says where the task will land.
 */
export function QuickAdd({ categories, target, onAdd }: Props) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (value.trim() ? parseQuickAdd(value) : null), [value]);
  const category = parsed?.category
    ? categories.find((c) => c.name.toLowerCase() === parsed.category!.toLowerCase())
    : undefined;
  const preset = parsed?.rrule ? fromRRule(parsed.rrule) : null;
  const canAdd = !!parsed?.title;

  function add() {
    if (!parsed?.title) return;
    onAdd(parsed);
    setValue("");
    input.current?.focus();
  }

  return (
    <div className="quick-add-wrap">
      <div className="quick-add-row">
        <input
          ref={input}
          id="quick-add"
          className="quick-add"
          placeholder="New task…  e.g. Submit logbook fri 5pm #FYP"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            else if (e.key === "Escape" && value) {
              e.preventDefault(); // first Esc clears the box; the next one may fold the notch
              setValue("");
            }
          }}
        />
        <button className="add-btn" onClick={add} disabled={!canAdd} title="Add task (Enter)">
          Add
        </button>
      </div>
      <div className="quick-add-preview" aria-live="polite">
        {parsed?.dueAt ? (
          <span className="due">{formatDue(parsed.dueAt, parsed.hasTime)}</span>
        ) : (
          <span className="target">→ {target}</span>
        )}
        {parsed?.rrule && <span className="repeat">↻ {preset ? describe(preset) : "repeats"}</span>}
        {parsed?.category && (
          <span className="chip" style={{ "--chip": category?.color ?? "var(--muted)" } as CSSProperties}>
            {category?.name ?? `${parsed.category} (new)`}
          </span>
        )}
        {parsed && parsed.priority !== null && <span>{PRIORITY_LABELS[parsed.priority]} priority</span>}
      </div>
    </div>
  );
}
