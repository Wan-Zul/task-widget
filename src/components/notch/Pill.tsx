import type { Task } from "../../db/tasks";
import { isOverdue, timePart } from "../../lib/dates";

/** The collapsed island: a one-line glance at today. */
export function Pill({ today }: { today: Task[] }) {
  const overdue = today.filter((t) => isOverdue(t.dueAt, t.hasTime)).length;
  const dueToday = today.length - overdue;
  const next = today.find((t) => !isOverdue(t.dueAt, t.hasTime)) ?? today[0];

  if (!today.length) {
    return (
      <div className="pill">
        <span className="pill-ok">✓</span> All clear
      </div>
    );
  }
  return (
    <div className="pill">
      {overdue > 0 && (
        <>
          <span className="pill-dot" aria-hidden="true" />
          <span className="pill-overdue">{overdue} overdue</span>
          {dueToday > 0 && <span className="pill-sep">·</span>}
        </>
      )}
      {dueToday > 0 && <span className="pill-count">{dueToday} today</span>}
      {next && (
        <>
          <span className="pill-sep">·</span>
          <span className="pill-next">
            {next.title}
            {next.hasTime && next.dueAt && <span className="pill-time"> {formatTime(timePart(next.dueAt))}</span>}
          </span>
        </>
      )}
    </div>
  );
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
