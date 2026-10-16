import { invoke } from "@tauri-apps/api/core";
import {
  availableMonitors,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/window";
import { getSetting, setSetting, type Bounds, type Settings } from "../db/settings";
import { loadAppearance } from "./appearance";

export type Mode = Settings["mode"];
export type Edge = Settings["dock_edge"];

export interface WindowState {
  mode: Mode;
  edge: Edge;
  alwaysOnTop: boolean;
}

const win = getCurrentWindow();
let mode: Mode = "floating";

/** Lets CSS drop rounded corners and the screen-side border when docked. */
function markDocument(m: Mode, edge: Edge) {
  document.documentElement.dataset.mode = m;
  document.documentElement.dataset.edge = edge;
}

/** True if the window's header strip is on some monitor (e.g. not on an unplugged screen). */
async function headerVisible(b: Bounds): Promise<boolean> {
  const monitors = await availableMonitors();
  const hx = b.x + Math.min(b.w, 80) / 2;
  const hy = b.y + 10;
  return monitors.some(({ position: p, size: s }) => hx >= p.x && hx < p.x + s.width && hy >= p.y && hy < p.y + s.height);
}

async function restoreFloatingBounds(): Promise<void> {
  const b = await getSetting("floating_bounds");
  if (b && (await headerVisible(b))) {
    await win.setSize(new PhysicalSize(b.w, b.h));
    await win.setPosition(new PhysicalPosition(b.x, b.y));
  } else {
    await win.setSize(new LogicalSize(320, 480));
    await win.center();
  }
}

/** Apply a mode to the native window. Always-on-top is re-applied for floating mode. */
async function applyMode(m: Mode, edge: Edge, alwaysOnTop: boolean): Promise<void> {
  mode = m;
  markDocument(m, edge);
  await invoke("set_mode", { mode: m, edge });
  if (m === "floating") await restoreFloatingBounds();
  // In docked mode Rust keeps the window topmost and only syncs the tray check mark.
  await invoke("set_always_on_top", { on: alwaysOnTop });
}

/**
 * Restore the saved mode, geometry and always-on-top, then show the window (it starts hidden),
 * unless this is a login launch, which stays in the tray.
 * Resolves to the restored state; the always-on-top change event may fire before any
 * listener is attached.
 */
export async function initWindow(): Promise<WindowState> {
  const state: WindowState = { mode: "floating", edge: "right", alwaysOnTop: false };
  let show = true;
  try {
    show = !(await invoke<boolean>("launched_hidden"));
    await loadAppearance(); // before showing, so the theme doesn't flash
    state.mode = (await getSetting("mode")) ?? "floating";
    state.edge = (await getSetting("dock_edge")) ?? "right";
    state.alwaysOnTop = (await getSetting("always_on_top")) ?? false;
    await applyMode(state.mode, state.edge, state.alwaysOnTop);
  } finally {
    if (show) {
      await win.show();
      await win.setFocus();
    }
  }
  return state;
}

/** Switch between floating and docked (or change the docked edge) and remember it. */
export async function switchMode(m: Mode, edge: Edge): Promise<void> {
  const alwaysOnTop = (await getSetting("always_on_top")) ?? false;
  await applyMode(m, edge, alwaysOnTop);
  await setSetting("mode", m);
  await setSetting("dock_edge", edge);
}

export const currentMode = () => mode;

/** Persist floating position and size as the user moves or resizes the widget. */
export async function trackFloatingBounds(): Promise<() => void> {
  let timer: number | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (mode !== "floating" || !(await win.isVisible())) return;
      const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
      // Windows parks minimised windows at -32000; never remember that.
      if (pos.x <= -30000 || pos.y <= -30000) return;
      await setSetting("floating_bounds", { x: pos.x, y: pos.y, w: size.width, h: size.height });
    }, 400);
  };
  const offMoved = await win.onMoved(save);
  const offResized = await win.onResized(save);
  return () => {
    clearTimeout(timer);
    offMoved();
    offResized();
  };
}

export const hideWindow = () => win.hide();
export const setAlwaysOnTop = (on: boolean) => invoke("set_always_on_top", { on });
