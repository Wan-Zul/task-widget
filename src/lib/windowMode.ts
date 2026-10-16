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
export type NotchState = "pill" | "peek" | "open";

export interface WindowState {
  mode: Mode;
  alwaysOnTop: boolean;
}

const win = getCurrentWindow();
let mode: Mode = "notch";

/** Lets CSS style the page for the current mode. */
function markDocument(m: Mode) {
  document.documentElement.dataset.mode = m;
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
async function applyMode(m: Mode, alwaysOnTop: boolean): Promise<void> {
  mode = m;
  markDocument(m);
  await invoke("set_mode", { mode: m }); // notch: Rust shows the pill without taking focus
  if (m === "floating") await restoreFloatingBounds();
  // In notch mode Rust keeps the window topmost and only syncs the tray check mark.
  await invoke("set_always_on_top", { on: alwaysOnTop });
}

/**
 * Restore the saved mode, geometry and always-on-top, then show the window (it starts hidden),
 * unless this is a login launch, which stays in the tray.
 * Resolves to the restored state; the always-on-top change event may fire before any
 * listener is attached.
 */
export async function initWindow(): Promise<WindowState> {
  const state: WindowState = { mode: "notch", alwaysOnTop: false };
  let show = true;
  try {
    show = !(await invoke<boolean>("launched_hidden"));
    await loadAppearance(); // before showing, so the theme doesn't flash
    // Anything but "floating" (including the old "docked" mode from v0.2) starts as the notch.
    state.mode = ((await getSetting("mode")) as string | undefined) === "floating" ? "floating" : "notch";
    state.alwaysOnTop = (await getSetting("always_on_top")) === true; // tolerate a corrupted value
    await applyMode(state.mode, state.alwaysOnTop);
  } finally {
    // The notch shows itself (unfocused, even on a login launch: it is the widget).
    if (show && state.mode !== "notch") {
      await win.show();
      await win.setFocus();
    }
  }
  return state;
}

/** Switch between notch and floating and remember it. */
export async function switchMode(m: Mode): Promise<void> {
  const alwaysOnTop = (await getSetting("always_on_top")) === true;
  await applyMode(m, alwaysOnTop);
  await setSetting("mode", m);
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
/** Resize/re-centre the notch island. Opening also gives it the keyboard. */
export const setNotchState = (state: NotchState) => invoke("notch_set_state", { state });
export const setAlwaysOnTop = (on: boolean) => invoke("set_always_on_top", { on });
