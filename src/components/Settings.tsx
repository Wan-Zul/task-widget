import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Backup } from "../db/backup";
import { importBackup } from "../db/backup";
import type { Category } from "../db/tasks";
import type { Appearance, Theme } from "../lib/appearance";
import { exportToFile, pickBackupFile } from "../lib/backupFile";
import { acceleratorFromEvent, changeHotkey, isUsableHotkey } from "../lib/hotkey";
import type { Mode } from "../lib/windowMode";
import { CategoryManager } from "./CategoryManager";
import { withDialog } from "../lib/dialogGuard";

interface Props {
  alwaysOnTop: boolean;
  hotkey: string;
  mode: Mode;
  appearance: Appearance;
  categories: Category[];
  onModeChange: (mode: Mode) => void;
  onAlwaysOnTop: (on: boolean) => void;
  onHotkeyChanged: (accel: string) => void;
  onAppearance: (a: Appearance) => void;
  /** Categories or tasks changed (category edits, import). */
  onDataChanged: () => void;
  onError: (e: unknown) => void;
  onClose: () => void;
}

export function Settings(p: Props) {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [hotkeyMsg, setHotkeyMsg] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);

  useEffect(() => {
    isEnabled().then(setAutostart, p.onError);
  }, []);

  async function toggleAutostart(on: boolean) {
    try {
      await (on ? enable() : disable());
      setAutostart(await isEnabled());
    } catch (e) {
      p.onError(e);
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

  async function doExport() {
    try {
      const path = await exportToFile();
      if (path) setBackupMsg(`Saved to ${path}`);
    } catch (e) {
      setBackupMsg(String(e));
    }
  }

  async function doPick() {
    try {
      setPending(await pickBackupFile());
      setBackupMsg(null);
    } catch (e) {
      setBackupMsg(String(e));
    }
  }

  async function doImport(mode: "merge" | "replace") {
    if (!pending) return;
    if (
      mode === "replace" &&
      !(await withDialog(() =>
        confirm("Delete ALL current tasks, history and categories, then load the backup?", {
          title: "Replace everything?",
          kind: "warning",
        }),
      ))
    )
      return;
    try {
      const r = await importBackup(pending, mode);
      setBackupMsg(`Imported ${r.tasks} task${r.tasks === 1 ? "" : "s"}${r.categories ? ` and ${r.categories} new categories` : ""}.`);
      setPending(null);
      p.onDataChanged();
    } catch (e) {
      setBackupMsg(`Import stopped part-way: ${e}`);
      p.onDataChanged();
    }
  }

  return (
    <section className="settings">
      <h3>Display</h3>
      <label className="setting-row">
        <span>Mode</span>
        <select
          value={p.mode}
          onChange={(e) => p.onModeChange(e.target.value as Mode)}
        >
          <option value="notch">Notch (top centre)</option>
          <option value="floating">Floating window</option>
        </select>
      </label>
      <label className="setting-row">
        <span>Always on top{p.mode !== "floating" && " (floating mode)"}</span>
        <input type="checkbox" checked={p.alwaysOnTop} onChange={(e) => p.onAlwaysOnTop(e.target.checked)} />
      </label>
      <label className="setting-row">
        <span>Theme</span>
        <select
          value={p.appearance.theme}
          onChange={(e) => p.onAppearance({ ...p.appearance, theme: e.target.value as Theme })}
        >
          <option value="system">Follow Windows</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label className="setting-row">
        <span>Week starts on</span>
        <select
          value={p.appearance.weekStart}
          onChange={(e) => p.onAppearance({ ...p.appearance, weekStart: e.target.value as "mon" | "sun" })}
        >
          <option value="mon">Monday</option>
          <option value="sun">Sunday</option>
        </select>
      </label>
      <label className="setting-row">
        <span>Compact list (titles only)</span>
        <input
          type="checkbox"
          checked={p.appearance.compact}
          onChange={(e) => p.onAppearance({ ...p.appearance, compact: e.target.checked })}
        />
      </label>

      <h3>Behaviour</h3>
      <label className="setting-row">
        <span>Launch on Windows startup</span>
        <input
          type="checkbox"
          checked={!!autostart}
          disabled={autostart === null}
          onChange={(e) => toggleAutostart(e.target.checked)}
        />
      </label>
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

      <h3>Categories</h3>
      <CategoryManager categories={p.categories} onChanged={p.onDataChanged} onError={p.onError} />

      <h3>Backup</h3>
      <div className="setting-actions">
        <button className="btn" onClick={doExport}>
          Export to JSON…
        </button>
        <button className="btn" onClick={doPick}>
          Import from JSON…
        </button>
      </div>
      {pending && (
        <div className="import-choice">
          <p>
            Backup from {pending.exportedAt.replace("T", " ").slice(0, 16)} with {pending.tasks.length} task
            {pending.tasks.length === 1 ? "" : "s"}.
          </p>
          <div className="setting-actions">
            <button className="btn" onClick={() => doImport("merge")} title="Add to your current tasks">
              Merge
            </button>
            <button className="btn danger" onClick={() => doImport("replace")} title="Delete current data first">
              Replace all
            </button>
            <button className="btn" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {backupMsg && <p className="setting-msg neutral">{backupMsg}</p>}

      <button className="link-btn" onClick={p.onClose}>
        ← Back to tasks
      </button>
    </section>
  );
}
