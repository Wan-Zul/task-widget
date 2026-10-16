import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Settings } from "./components/Settings";
import { WidgetShell } from "./components/WidgetShell";
import { NotchShell } from "./components/notch/NotchShell";
import { useTasks } from "./hooks/useTasks";
import { setSetting } from "./db/settings";
import {
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
const hotkeyReady = applySavedHotkey();

export default function App() {
  const [error, setError] = useState<string | null>(null);
  const onError = (e: unknown) => setError(String(e));
  const api = useTasks(onError);

  const [ready, setReady] = useState(false);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hotkey, setHotkey] = useState(DEFAULT_HOTKEY);
  const [mode, setMode] = useState<Mode>("notch");
  const [edge, setEdge] = useState<Edge>("right");
  const [appearance, setAppearance] = useState<Appearance>({ theme: "system", compact: false });

  useEffect(() => {
    hotkeyReady.then(setHotkey, onError);
    windowReady.then(loadAppearance).then(setAppearance, () => {});
    startNotifier(onError);
  }, []);

  // Window/tray wiring. Rust emits always-on-top-changed for every change (tray or pin button).
  useEffect(() => {
    const cleanups: Promise<() => void>[] = [
      listen<boolean>("always-on-top-changed", ({ payload }) => {
        setAlwaysOnTopState(payload);
        setSetting("always_on_top", payload).catch(onError);
      }),
      listen("open-settings", () => setSettingsOpen(true)),
      listen<{ mode: Mode; edge: Edge | null }>("set-mode", ({ payload }) =>
        changeMode(payload.mode, payload.edge ?? edgeNow),
      ),
      listen("focus-quick-add", () => {
        setSettingsOpen(false);
        // Wait for the list view to render if settings were open.
        requestAnimationFrame(() => document.getElementById("quick-add")?.focus());
      }),
      windowReady.then(trackFloatingBounds, trackFloatingBounds),
    ];
    windowReady
      .then((w) => {
        setAlwaysOnTopState(w.alwaysOnTop);
        setMode(w.mode);
        setEdge(w.edge);
        edgeNow = w.edge;
      }, onError)
      .finally(() => setReady(true));
    return () => cleanups.forEach((c) => c.then((off) => off()));
  }, []);

  async function changeMode(m: Mode, e: Edge) {
    try {
      setSettingsOpen(false);
      await switchMode(m, e);
      setMode(m);
      setEdge(e);
      edgeNow = e;
    } catch (err) {
      onError(err);
    }
  }

  const settings = (
    <Settings
      alwaysOnTop={alwaysOnTop}
      hotkey={hotkey}
      mode={mode}
      edge={edge}
      appearance={appearance}
      categories={api.categories}
      onAppearance={(a) => {
        setAppearance(a);
        saveAppearance(a).catch(onError);
      }}
      onDataChanged={() => {
        api.reloadCategories();
        api.reload();
      }}
      onError={onError}
      onModeChange={changeMode}
      onHotkeyChanged={setHotkey}
      onAlwaysOnTop={(on) => setAlwaysOnTop(on).catch(onError)}
      onClose={() => setSettingsOpen(false)}
    />
  );

  if (!ready) return null; // don't flash the wrong layout before the saved mode is known

  const common = {
    api,
    error,
    onDismissError: () => setError(null),
    settingsOpen,
    setSettingsOpen,
    settings,
  };
  return mode === "notch" ? (
    <NotchShell {...common} onError={onError} />
  ) : (
    <WidgetShell
      {...common}
      docked={mode === "docked"}
      alwaysOnTop={alwaysOnTop}
      onToggleAlwaysOnTop={() => setAlwaysOnTop(!alwaysOnTop).catch(onError)}
      onHide={() => hideWindow()}
    />
  );
}

/** Current docked edge for tray events, which arrive outside React's render cycle. */
let edgeNow: Edge = "right";
