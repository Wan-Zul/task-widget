import type { View } from "../db/tasks";
import type { TasksApi } from "../hooks/useTasks";
import { QuickAdd } from "./QuickAdd";
import { TaskList } from "./TaskList";
import { ViewTabs } from "./ViewTabs";

const EMPTY_TEXT: Record<View, string> = {
  today: "Nothing due today.",
  upcoming: "Nothing scheduled after today.",
  all: "Nothing to do. Add a task above.",
  done: "No completed tasks yet.",
};

/** Quick add, view tabs and the task list: the body of both the widget and the open notch. */
export function TaskPane({ api }: { api: TasksApi }) {
  return (
    <>
      <header className="header">
        <QuickAdd categories={api.categories} onAdd={(q) => api.add(q)} />
        <ViewTabs view={api.view} onChange={api.setView} />
      </header>
      <main className="content">
        <TaskList
          tasks={api.tasks}
          categories={api.categories}
          editingId={api.editingId}
          view={api.view}
          emptyText={EMPTY_TEXT[api.view]}
          onEdit={api.setEditingId}
          onToggleDone={api.toggleDone}
          onSave={api.save}
          onSkip={api.skip}
          onDelete={api.remove}
          onReorder={api.reorder}
        />
      </main>
    </>
  );
}
