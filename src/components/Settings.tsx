import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { acceleratorFromEvent, changeHotkey, isUsableHotkey } from "../lib/hotkey";
import type { Edge, Mode } from "../lib/windowMode";

interface Props {
  alwaysOnTop: boolean;
  hotkey: string;
  mode: Mode;
  edge: Edge;
  onModeChange: (mode: Mode, edge: Edge) => void;
  onAlwaysOnTop: (on: boolean) => void;
  onHotkeyChanged: (accel: string) => void;
  onClose: () => void;
}

export function Settings(p: Props) {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [hotkeyMsg, setHotkeyMsg] = useState<string | null>(null);
  const [autostartMsg, setAutostartMsg] = useState<string | null>(null);

  useEffect(() => {
    isEnabled().then(setAutostart, (e) => setAutostartMsg(String(e)));
  }, []);

  async function toggleAutostart(on: boolean) {
    try {
      await (on ? enable() : disable());
      setAutostart(await isEnabled());
      setAutostartMsg(null);
    } catch (e) {
      setAutostartMsg(String(e));
    }
  }

  async function onHotkeyKey(e: React.KeyboardEvent) {
    e.preventDefault();
    if (e.key === "Escape") {
      setRecording(false);
      setHotkeyMsg(null);
      return;
    }
    const accel = acceleratorFromEvent(e.nativeEvent);
    if (!accel) return;
    if (!isUsableHotkey(accel)) {
      setHotkeyMsg("Include Ctrl, Alt or Win (or use an F-key).");
      return;
    }
    setRecording(false);
    try {
      await changeHotkey(accel);
      p.onHotkeyChanged(accel);
      setHotkeyMsg(null);
    } catch (err) {
      setHotkeyMsg(String(err));
    }
  }

  return (
    <section className="settings">
      <h2>Settings</h2>
      <label className="setting-row">
        <span>Display</span>
        <select
          value={p.mode === "docked" ? p.edge : "floating"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "floating") p.onModeChange("floating", p.edge);
            else p.onModeChange("docked", v as Edge);
          }}
        >
          <option value="floating">Floating</option>
          <option value="left">Docked left</option>
          <option value="right">Docked right</option>
        </select>
      </label>
      <label className="setting-row">
        <span>Always on top{p.mode === "docked" && " (floating mode)"}</span>
        <input type="checkbox" checked={p.alwaysOnTop} onChange={(e) => p.onAlwaysOnTop(e.target.checked)} />
      </label>
      <label className="setting-row">
        <span>Launch on Windows startup</span>
        <input
          type="checkbox"
          checked={!!autostart}
          disabled={autostart === null}
          onChange={(e) => toggleAutostart(e.target.checked)}
        />
      </label>
      {autostartMsg && <p className="setting-msg">{autostartMsg}</p>}
      <div className="setting-row">
        <span>Show / hide hotkey</span>
        <button
          className={recording ? "hotkey recording" : "hotkey"}
          onClick={() => {
            setRecording(true);
            setHotkeyMsg(null);
          }}
          onKeyDown={recording ? onHotkeyKey : undefined}
          onBlur={() => setRecording(false)}
        >
          {recording ? "Press keys…" : p.hotkey}
        </button>
      </div>
      {hotkeyMsg && <p className="setting-msg">{hotkeyMsg}</p>}
      <button className="link-btn" onClick={p.onClose}>
        ← Back to tasks
      </button>
    </section>
  );
}
