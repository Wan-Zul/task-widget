import { db } from "./client";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Known settings keys and their value types (stored JSON-encoded). */
export interface Settings {
  floating_bounds: Bounds; // physical pixels
  always_on_top: boolean;
  hotkey: string; // accelerator, e.g. "Ctrl+Alt+T"
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K] | undefined> {
  const rows = await (await db()).select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  if (!rows.length) return undefined;
  try {
    return JSON.parse(rows[0].value) as Settings[K];
  } catch {
    return undefined;
  }
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await (await db()).execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, JSON.stringify(value)],
  );
}
