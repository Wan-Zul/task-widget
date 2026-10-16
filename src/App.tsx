import { useCallback, useEffect, useState } from "react";
import { QuickAdd } from "./components/QuickAdd";
import { ViewTabs } from "./components/ViewTabs";
import { TaskList } from "./components/TaskList";
import {
  createTask,
  deleteTask,
  listCategories,
  listTasks,
  setDone,
  updateTask,
  type Category,
  type Task,
  type View,
} from "./db/tasks";

const EMPTY_TEXT: Record<View, string> = {
  all: "Nothing to do. Add a task above.",
  done: "No completed tasks yet.",
};

export default function App() {
  const [view, setView] = useState<View>("all");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTasks(await listTasks(view));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [view]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    listCategories().then(setCategories, (e) => setError(String(e)));
  }, []);

  // Run a mutation, surface DB errors, then refresh the list.
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      setError(String(e));
      return;
    }
    await reload();
  }

  return (
    <div className="app">
      <header className="header">
        <QuickAdd onAdd={(title) => run(() => createTask({ title }))} />
        <ViewTabs
          view={view}
          onChange={(v) => {
            setEditingId(null);
            setView(v);
          }}
        />
      </header>
      {error && (
        <div className="error" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <main className="content">
        <TaskList
          tasks={tasks}
          categories={categories}
          editingId={editingId}
          emptyText={EMPTY_TEXT[view]}
          onEdit={setEditingId}
          onToggleDone={(t) => run(() => setDone(t.id, !t.done))}
          onSave={(id, patch) => {
            setEditingId(null);
            run(() => updateTask(id, patch));
          }}
          onDelete={(id) => {
            setEditingId(null);
            run(() => deleteTask(id));
          }}
        />
      </main>
    </div>
  );
}
