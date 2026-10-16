import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Header } from "./components/Header";
import { Settings } from "./components/Settings";
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
import { setSetting } from "./db/settings";
import { hideWindow, initFloating, setAlwaysOnTop, trackFloatingBounds } from "./lib/windowMode";

// Module-level so React StrictMode's double effect run doesn't restore twice.
const windowReady = initFloating();

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
  const [alwaysOnTop, setAlwaysOnTopState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      return;
    }
    await reload();
  }

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
        <QuickAdd onAdd={(title) => run(() => createTask({ title }))} />
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
        </>
      )}
    </div>
  );
}
