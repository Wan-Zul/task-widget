import type { CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import { addDay, type Category, type Task } from "../../db/tasks";
import type { ProjectedOccurrence } from "../../db/series";
import { nowLocal } from "../../lib/dates";
import { DAY_DROP } from "../DragArea";

const MAX_DOTS = 3;

interface Props {
  /** First day of the shown month, 'YYYY-MM-01'. */
  month: string;
  selected: string;
  weekStart: "mon" | "sun";
  tasks: Task[];
  projected: ProjectedOccurrence[];
  categories: Category[];
  onSelect: (date: string) => void;
  /** Double-click: select and jump to quick add for that day. */
  onAddOn: (date: string) => void;
  onMonth: (month: string) => void;
}

/** The 42 days (6 weeks) shown for a month, starting on the configured weekday. */
export function gridDays(month: string, weekStart: "mon" | "sun"): string[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay(); // 0 = Sunday
  const back = weekStart === "mon" ? (first + 6) % 7 : first;
  const start = addDay(month, -back);
  return Array.from({ length: 42 }, (_, i) => addDay(start, i));
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

interface Dot {
  key: string;
  color: string;
  kind: "open" | "done" | "repeat";
}

export function Calendar(p: Props) {
  const today = nowLocal().slice(0, 10);
  const days = gridDays(p.month, p.weekStart);
  const colorOf = new Map(p.categories.map((c) => [c.id, c.color]));
  const color = (id: number | null) => (id != null ? colorOf.get(id) : undefined) ?? "var(--accent)";

  const dots = new Map<string, Dot[]>();
  const overdue = new Set<string>();
  const push = (date: string, d: Dot) => dots.set(date, [...(dots.get(date) ?? []), d]);
  for (const t of p.tasks) {
    if (!t.dueAt) continue;
    const date = t.dueAt.slice(0, 10);
    push(date, { key: `t${t.id}`, color: color(t.categoryId), kind: t.done ? "done" : "open" });
    if (!t.done && date < today) overdue.add(date);
  }
  for (const o of p.projected) push(o.dueAt.slice(0, 10), { key: `r${o.seriesId}${o.dueAt}`, color: color(o.categoryId), kind: "repeat" });

  const [y, m] = p.month.split("-").map(Number);
  const title = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, (p.weekStart === "mon" ? 1 : 7) + i).toLocaleDateString(undefined, { weekday: "narrow" }),
  );

  return (
    <div className="calendar">
      <div className="cal-head">
        <span className="cal-title">{title}</span>
        <button className="icon-btn" title="Previous month" onClick={() => p.onMonth(shiftMonth(p.month, -1))}>
          ‹
        </button>
        <button
          className="cal-today"
          onClick={() => {
            p.onMonth(`${today.slice(0, 7)}-01`);
            p.onSelect(today);
          }}
        >
          Today
        </button>
        <button className="icon-btn" title="Next month" onClick={() => p.onMonth(shiftMonth(p.month, 1))}>
          ›
        </button>
      </div>
      <div className="cal-grid" role="grid">
        {weekdays.map((w, i) => (
          <span key={i} className="cal-weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {days.map((date) => (
          <DayCell
            key={date}
            date={date}
            inMonth={date.slice(0, 7) === p.month.slice(0, 7)}
            isToday={date === today}
            isSelected={date === p.selected}
            overdue={overdue.has(date)}
            dots={dots.get(date) ?? []}
            onSelect={p.onSelect}
            onAddOn={p.onAddOn}
          />
        ))}
      </div>
    </div>
  );
}

interface CellProps {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  overdue: boolean;
  dots: Dot[];
  onSelect: (date: string) => void;
  onAddOn: (date: string) => void;
}

function DayCell(c: CellProps) {
  // Tasks dragged from the list can be dropped here to reschedule them.
  const { setNodeRef, isOver } = useDroppable({ id: `${DAY_DROP}${c.date}` });
  const cls = [
    "cal-day",
    !c.inMonth && "outside",
    c.isToday && "today",
    c.isSelected && "selected",
    c.overdue && "overdue",
    isOver && "drop-over",
  ]
    .filter(Boolean)
    .join(" ");
  const extra = c.dots.length - MAX_DOTS;
  const label = new Date(`${c.date}T00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <button
      ref={setNodeRef}
      className={cls}
      onClick={() => c.onSelect(c.date)}
      onDoubleClick={() => c.onAddOn(c.date)}
      aria-label={`${label}${c.dots.length ? `, ${c.dots.length} task${c.dots.length === 1 ? "" : "s"}` : ""}`}
      aria-pressed={c.isSelected}
    >
      <span className="cal-num">{Number(c.date.slice(8))}</span>
      <span className="cal-dots" aria-hidden="true">
        {c.dots.slice(0, MAX_DOTS).map((d) => (
          <span key={d.key} className={`cal-dot ${d.kind}`} style={{ "--dot": d.color } as CSSProperties} />
        ))}
        {extra > 0 && <span className="cal-more">+{extra}</span>}
      </span>
    </button>
  );
}
