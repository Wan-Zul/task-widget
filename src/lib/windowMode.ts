import { invoke } from "@tauri-apps/api/core";
import {
  availableMonitors,
  getCurrentWindow,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/window";
import { getSetting, setSetting, type Bounds } from "../db/settings";

const win = getCurrentWindow();

/** True if the window's header strip is on some monitor (e.g. not on an unplugged screen). */
async function headerVisible(b: Bounds): Promise<boolean> {
  const monitors = await availableMonitors();
  const hx = b.x + Math.min(b.w, 80) / 2;
  const hy = b.y + 10;
  return monitors.some(({ position: p, size: s }) => hx >= p.x && hx < p.x + s.width && hy >= p.y && hy < p.y + s.height);
}

/**
 * Restore floating geometry and always-on-top, then show the window (it starts hidden).
 * Resolves to the restored always-on-top value, since its change event may fire before
 * any listener is attached.
 */
export async function initFloating(): Promise<boolean> {
  try {
    const b = await getSetting("floating_bounds");
    if (b && (await headerVisible(b))) {
      await win.setSize(new PhysicalSize(b.w, b.h));
      await win.setPosition(new PhysicalPosition(b.x, b.y));
    }
    const onTop = (await getSetting("always_on_top")) ?? false;
    await invoke("set_always_on_top", { on: onTop });
    return onTop;
  } finally {
    await win.show();
    await win.setFocus();
  }
}

/** Persist position and size as the user moves or resizes the widget. */
export async function trackFloatingBounds(): Promise<() => void> {
  let timer: number | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (!(await win.isVisible())) return;
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
