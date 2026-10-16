import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Header } from "./components/Header";
import { Settings } from "./components/Settings";
import { QuickAdd } from "./components/QuickAdd";
import { ViewTabs } from "./components/ViewTabs";
import { TaskList } from "./components/TaskList";
import { createTask, listCategories, listTasks, type Category, type Task, type View } from "./db/tasks";
import { completeTask, removeTask, repairSeries, saveTask, skipOccurrence, uncompleteTask } from "./db/series";
import { setSetting } from "./db/settings";
import { nowLocal, toLocal } from "./lib/dates";
import { hideWindow, initFloating, setAlwaysOnTop, trackFloatingBounds } from "./lib/windowMode";

// Module-level so React StrictMode's double effect run doesn't run these twice.
const windowReady = initFloating();
const seriesReady = repairSeries();

const EMPTY_TEXT: Record<View, string> = {
  today: "Nothing due today.",
  upcoming: "Nothing scheduled after today.",
  all: "Nothing to do. Add a task above.",
  done: "No completed tasks yet.",
};

/** Quick add gives the task a due date matching the view, so it doesn't vanish from it. */
function quickAddDue(view: View): string | null {
  const now = new Date();
  if (view === "today") return `${nowLocal().slice(0, 10)}T00:00`;
  if (view === "upcoming") return `${toLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)).slice(0, 10)}T00:00`;
  return null;
}

export default function App() {
  const [view, setView] = useState<View>("today");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      await seriesReady.catch(() => {}); // a failed repair shouldn't hide the list
      setTasks(await listTasks(view));
    } catch (e) {
      setError(String(e));
    }
  }, [view]);

  useEffect(() => {
    reload();
    // Overdue/Today depend on the clock (and the laptop may have slept), so refresh each minute.
    const timer = window.setInterval(reload, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    listCategories().then(setCategories, (e) => setError(String(e)));
    seriesReady.catch((e) => setError(String(e)));
  }, []);

  // Window/tray wiring. Rust emits always-on-top-changed for every change (tray or pin button).
  useEffect(() => {
    const cleanups: Promise<() => void>[] = [
      listen<boolean>("always-on-top-changed", ({ payload }) => {
        setAlwaysOnTopState(payload);
        setSetting("always_on_top", payload).catch((e) => setError(String(e)));
      }),
      listen("open-settings", () => setSettingsOpen(true)),
      windowReady.then(trackFloatingBounds, trackFloatingBounds),
    ];
    windowReady.then(setAlwaysOnTopState, (e) => setError(String(e)));
    return () => cleanups.forEach((c) => c.then((off) => off()));
  }, []);

  // Run a mutation, surface DB errors, then refresh the list.
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
    await reload();
  }

  const closeEditorAnd = (fn: () => Promise<unknown>) => {
    setEditingId(null);
    run(fn);
  };

  return (
    <div className="app">
      <Header
        alwaysOnTop={alwaysOnTop}
        settingsOpen={settingsOpen}
        onToggleAlwaysOnTop={() => setAlwaysOnTop(!alwaysOnTop).catch((e) => setError(String(e)))}
        onToggleSettings={() => setSettingsOpen(!settingsOpen)}
        onHide={() => hideWindow()}
      />
      {error && (
        <div className="error" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {settingsOpen ? (
        <Settings
          alwaysOnTop={alwaysOnTop}
          onAlwaysOnTop={(on) => setAlwaysOnTop(on).catch((e) => setError(String(e)))}
          onClose={() => setSettingsOpen(false)}
        />
      ) : (
        <>
          <header className="header">
            <QuickAdd onAdd={(title) => run(() => createTask({ title, dueAt: quickAddDue(view) }))} />
            <ViewTabs
              view={view}
              onChange={(v) => {
                setEditingId(null);
                setView(v);
              }}
            />
          </header>
          <main className="content">
            <TaskList
              tasks={tasks}
              categories={categories}
              editingId={editingId}
              emptyText={EMPTY_TEXT[view]}
              groupByDay={view === "upcoming"}
              onEdit={setEditingId}
              onToggleDone={(t) => run(() => (t.done ? uncompleteTask(t) : completeTask(t)))}
              onSave={(t, patch, rrule, scope) => closeEditorAnd(() => saveTask(t, patch, rrule, scope))}
              onSkip={(t) => closeEditorAnd(() => skipOccurrence(t))}
              onDelete={(t) => closeEditorAnd(() => removeTask(t))}
            />
          </main>
        </>
      )}
    </div>
  );
}
