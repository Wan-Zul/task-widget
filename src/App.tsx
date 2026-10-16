import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Header } from "./components/Header";
import { Settings } from "./components/Settings";
import { QuickAdd } from "./components/QuickAdd";
import { ViewTabs } from "./components/ViewTabs";
import { TaskList } from "./components/TaskList";
import {
  createTask,
  findOrCreateCategory,
  listCategories,
  listTasks,
  reorderTasks,
  type Category,
  type Task,
  type View,
} from "./db/tasks";
import type { ParsedQuickAdd } from "./parse/quickAdd";
import { completeTask, removeTask, repairSeries, saveTask, skipOccurrence, uncompleteTask } from "./db/series";
import { setSetting } from "./db/settings";
import { nowLocal, toLocal } from "./lib/dates";
import {
  currentMode,
  hideWindow,
  initWindow,
  setAlwaysOnTop,
  switchMode,
  trackFloatingBounds,
  type Edge,
  type Mode,
} from "./lib/windowMode";
import { applySavedHotkey, DEFAULT_HOTKEY } from "./lib/hotkey";
import { startNotifier } from "./lib/notify";
import { loadAppearance, saveAppearance, type Appearance } from "./lib/appearance";

// Module-level so React StrictMode's double effect run doesn't run these twice.
const windowReady = initWindow();
const seriesReady = repairSeries();
const hotkeyReady = applySavedHotkey();

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
  const [hotkey, setHotkey] = useState(DEFAULT_HOTKEY);
  const [mode, setMode] = useState<Mode>("floating");
  const [edge, setEdge] = useState<Edge>("right");
  const [appearance, setAppearance] = useState<Appearance>({ theme: "system", compact: false });
  const edgeRef = useRef<Edge>("right");
  edgeRef.current = edge;

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

  const reloadCategories = useCallback(
    () => listCategories().then(setCategories, (e) => setError(String(e))),
    [],
  );

  useEffect(() => {
    reloadCategories();
    seriesReady.catch((e) => setError(String(e)));
    hotkeyReady.then(setHotkey, (e) => setError(String(e)));
    windowReady.then(loadAppearance).then(setAppearance, () => {});
    startNotifier((e) => setError(String(e)));
  }, []);

  // Window/tray wiring. Rust emits always-on-top-changed for every change (tray or pin button).
  useEffect(() => {
    const cleanups: Promise<() => void>[] = [
      listen<boolean>("always-on-top-changed", ({ payload }) => {
        setAlwaysOnTopState(payload);
        setSetting("always_on_top", payload).catch((e) => setError(String(e)));
      }),
      listen("open-settings", () => setSettingsOpen(true)),
      listen("toggle-mode", () => changeMode(currentMode() === "docked" ? "floating" : "docked", edgeRef.current)),
      listen("focus-quick-add", () => {
        setSettingsOpen(false);
        // Wait for the list view to render if settings were open.
        requestAnimationFrame(() => document.getElementById("quick-add")?.focus());
      }),
      windowReady.then(trackFloatingBounds, trackFloatingBounds),
    ];
    windowReady.then(
      (w) => {
        setAlwaysOnTopState(w.alwaysOnTop);
        setMode(w.mode);
        setEdge(w.edge);
      },
      (e) => setError(String(e)),
    );
    return () => cleanups.forEach((c) => c.then((off) => off()));
  }, []);

  async function changeMode(m: Mode, e: Edge) {
    try {
      await switchMode(m, e);
      setMode(m);
      setEdge(e);
    } catch (err) {
      setError(String(err));
    }
  }

  /** Create a task from quick add; shorthand may add a category and a recurrence. */
  async function addParsed(q: ParsedQuickAdd) {
    const categoryId = q.category ? await findOrCreateCategory(q.category) : null;
    if (q.category) await reloadCategories();
    // Without a date, give it one matching the view so it doesn't vanish from it.
    const dueAt = q.dueAt ?? (q.rrule ? quickAddDue("today") : quickAddDue(view));
    const input = { title: q.title, dueAt, hasTime: q.hasTime, priority: q.priority ?? 1, categoryId };
    const id = await createTask(input);
    if (q.rrule) {
      const [task] = (await listTasks("all")).filter((t) => t.id === id);
      if (task) await saveTask(task, {}, q.rrule, "future");
    }
  }

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
        docked={mode === "docked"}
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
          hotkey={hotkey}
          mode={mode}
          edge={edge}
          appearance={appearance}
          categories={categories}
          onAppearance={(a) => {
            setAppearance(a);
            saveAppearance(a).catch((e) => setError(String(e)));
          }}
          onDataChanged={() => {
            reloadCategories();
            reload();
          }}
          onError={(e) => setError(String(e))}
          onModeChange={changeMode}
          onHotkeyChanged={setHotkey}
          onAlwaysOnTop={(on) => setAlwaysOnTop(on).catch((e) => setError(String(e)))}
          onClose={() => setSettingsOpen(false)}
        />
      ) : (
        <>
          <header className="header">
            <QuickAdd categories={categories} onAdd={(q) => run(() => addParsed(q))} />
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
              view={view}
              emptyText={EMPTY_TEXT[view]}
              onEdit={setEditingId}
              onToggleDone={(t) => run(() => (t.done ? uncompleteTask(t) : completeTask(t)))}
              onSave={(t, patch, rrule, scope) => closeEditorAnd(() => saveTask(t, patch, rrule, scope))}
              onSkip={(t) => closeEditorAnd(() => skipOccurrence(t))}
              onDelete={(t) => closeEditorAnd(() => removeTask(t))}
              onReorder={(next, ids) => {
                setTasks(next); // instant, then persist
                run(() => reorderTasks(ids));
              }}
            />
          </main>
        </>
      )}
    </div>
  );
}
