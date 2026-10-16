import type { Task } from "../../db/tasks";
import { formatDue, isOverdue } from "../../lib/dates";

const SHOW = 4;

/** Hover view: the next few tasks for today, tickable. Clicking anywhere else opens the island. */
export function Peek({ today, onToggleDone }: { today: Task[]; onToggleDone: (t: Task) => void }) {
  return (
    <div className="peek">
      <div className="peek-head">Today</div>
      {!today.length && <p className="peek-empty">Nothing due today. Click to add one.</p>}
      <ul className="peek-list">
        {today.slice(0, SHOW).map((t) => (
          <li key={t.id} className={isOverdue(t.dueAt, t.hasTime) ? "overdue" : undefined}>
            <input
              type="checkbox"
              className="check"
              checked={t.done}
              aria-label="Mark done"
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleDone(t)}
            />
            <span className="peek-title">{t.title}</span>
            {t.dueAt && <span className="peek-due">{formatDue(t.dueAt, t.hasTime)}</span>}
          </li>
        ))}
      </ul>
      {today.length > SHOW && <div className="peek-more">+{today.length - SHOW} more</div>}
    </div>
  );
}
