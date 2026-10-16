import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { exportBackup, validateBackup, type Backup } from "../db/backup";
import { nowLocal } from "./dates";
import { withDialog } from "./dialogGuard";

const FILTERS = [{ name: "Task Widget backup", extensions: ["json"] }];

/** Ask where to save, then write the backup. Resolves to the path, or null if cancelled. */
export async function exportToFile(): Promise<string | null> {
  const path = await withDialog(() => save({ defaultPath: `task-widget-backup-${nowLocal().slice(0, 10)}.json`, filters: FILTERS }));
  if (!path) return null;
  await writeTextFile(path, JSON.stringify(await exportBackup(), null, 2));
  return path;
}

/** Ask for a backup file and validate it. Resolves to null if cancelled. */
export async function pickBackupFile(): Promise<Backup | null> {
  const path = await withDialog(() => open({ multiple: false, directory: false, filters: FILTERS }));
  if (!path) return null;
  let data: unknown;
  try {
    data = JSON.parse(await readTextFile(path));
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  return validateBackup(data);
}
