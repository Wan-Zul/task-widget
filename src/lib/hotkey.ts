import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../db/settings";

export const DEFAULT_HOTKEY = "Ctrl+Alt+T";

/** Re-apply the saved hotkey at startup (Rust registers the default before this runs). */
export async function applySavedHotkey(): Promise<string> {
  const saved = await getSetting("hotkey");
  if (saved && saved !== DEFAULT_HOTKEY) await invoke("set_hotkey", { accelerator: saved });
  return saved ?? DEFAULT_HOTKEY;
}

/** Register a new hotkey and save it. Throws with a readable message if it can't be used. */
export async function changeHotkey(accelerator: string): Promise<void> {
  await invoke("set_hotkey", { accelerator });
  await setSetting("hotkey", accelerator);
}

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

/**
 * Turn a keydown into an accelerator string ("Ctrl+Alt+T"), or null while only modifiers
 * are held. Uses `code` so the result doesn't depend on keyboard layout or Shift.
 */
export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1\d|2[0-4])$/.test(e.code)) key = e.code;
  else if (["Space", "Enter", "Backquote", "Minus", "Equal", "Comma", "Period", "Slash", "Semicolon"].includes(e.code))
    key = e.code;
  if (!key) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean);
  return [...mods, key].join("+");
}

/** A global hotkey needs Ctrl, Alt or Win, or it would swallow normal typing. F-keys are fine alone. */
export function isUsableHotkey(accel: string): boolean {
  return /(^|\+)(Ctrl|Alt|Super)\+/.test(accel) || /^(Shift\+)?F\d+$/.test(accel);
}
