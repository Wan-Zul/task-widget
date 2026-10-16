import type { CSSProperties } from "react";
import type { View } from "../db/tasks";
import type { ProjectedOccurrence } from "../db/series";
import type { TasksApi } from "../hooks/useTasks";
import { formatTime, timePart } from "../lib/dates";
import { QuickAdd } from "./QuickAdd";
import { TaskList } from "./TaskList";
import { ViewTabs, type Tab } from "./ViewTabs";

const EMPTY_TEXT: Record<View, string> = {
  day: "Nothing on this day. Add a task above.",
  today: "Nothing due today.",
  upcoming: "Nothing scheduled after today.",
  all: "Nothing to do. Add a task above.",
  done: "No completed tasks yet.",
};

interface Props {
  api: TasksApi;
  tabs?: Tab[];
  /** Future occurrences of recurring tasks on the selected day (Day view only). */
  projected?: ProjectedOccurrence[];
}

/**
 * Quick add, view tabs and the task list: the body of both the widget and the open notch.
 * Must sit inside a DragArea.
 */
export function TaskPane({ api, tabs, projected = [] }: Props) {
  const colorOf = (id: number | null) => api.categories.find((c) => c.id === id)?.color;
  const showProjected = api.view === "day" && projected.length > 0;
  return (
    <>
      <header className="header">
        <QuickAdd categories={api.categories} onAdd={(q) => api.add(q)} />
        <ViewTabs tabs={tabs} view={api.view} onChange={api.setView} />
      </header>
      <main className="content">
        <TaskList
          tasks={api.tasks}
          categories={api.categories}
          editingId={api.editingId}
          view={api.view}
          emptyText={showProjected ? "" : EMPTY_TEXT[api.view]}
          onEdit={api.setEditingId}
          onToggleDone={api.toggleDone}
          onSave={api.save}
          onSkip={api.skip}
          onDelete={api.remove}
          onReorder={api.reorder}
        />
        {showProjected && (
          <ul className="projected" aria-label="Repeating tasks on this day">
            {projected.map((o) => (
              <li
                key={`${o.seriesId}-${o.dueAt}`}
                title="Upcoming repeat: appears as a task once the current one is done"
                style={{ "--chip": colorOf(o.categoryId) ?? "var(--muted)" } as CSSProperties}
              >
                <span className="projected-icon">↻</span>
                <span className="projected-title">{o.title}</span>
                {o.hasTime && <span className="projected-time">{formatTime(timePart(o.dueAt))}</span>}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
