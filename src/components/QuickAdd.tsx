import { useMemo, useState, type CSSProperties } from "react";
import { PRIORITY_LABELS, type Category } from "../db/tasks";
import { formatDue } from "../lib/dates";
import { parseQuickAdd, type ParsedQuickAdd } from "../parse/quickAdd";
import { describe, fromRRule } from "../recurrence/rules";

interface Props {
  categories: Category[];
  onAdd: (parsed: ParsedQuickAdd) => void;
}

/** Single input; shorthand like "fri 5pm #FYP !high" is shown as chips before you press Enter. */
export function QuickAdd({ categories, onAdd }: Props) {
  const [value, setValue] = useState("");
  const parsed = useMemo(() => (value.trim() ? parseQuickAdd(value) : null), [value]);
  const category = parsed?.category
    ? categories.find((c) => c.name.toLowerCase() === parsed.category!.toLowerCase())
    : undefined;
  const preset = parsed?.rrule ? fromRRule(parsed.rrule) : null;
  const hasChips = parsed && (parsed.dueAt || parsed.category || parsed.priority !== null || parsed.rrule);

  return (
    <div className="quick-add-wrap">
      <input
        id="quick-add"
        className="quick-add"
        placeholder="Add a task…  e.g. Report fri 5pm #FYP !high"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && parsed?.title) {
            onAdd(parsed);
            setValue("");
          } else if (e.key === "Escape" && value) {
            e.preventDefault(); // first Esc clears the box; the next one may fold the notch
            setValue("");
          }
        }}
      />
      {hasChips && (
        <div className="quick-add-preview" aria-live="polite">
          {parsed.dueAt && <span className="due">{formatDue(parsed.dueAt, parsed.hasTime)}</span>}
          {parsed.rrule && <span className="repeat">↻ {preset ? describe(preset) : "repeats"}</span>}
          {parsed.category && (
            <span className="chip" style={{ "--chip": category?.color ?? "var(--muted)" } as CSSProperties}>
              {category?.name ?? `${parsed.category} (new)`}
            </span>
          )}
          {parsed.priority !== null && <span>{PRIORITY_LABELS[parsed.priority]} priority</span>}
        </div>
      )}
    </div>
  );
}
