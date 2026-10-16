import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { db } from "../db/client";
import { formatDue, toLocal } from "./dates";

const CHECK_EVERY_MS = 20_000;
/** Tasks that fell due longer ago than this (e.g. laptop was off) don't pop up; they just show as overdue. */
const LATE_WINDOW_MS = 30 * 60_000;

interface DueRow {
  id: number;
  title: string;
  due_at: string;
  category: string | null;
}

async function check(): Promise<void> {
  const now = new Date();
  const d = await db();
  const due = await d.select<DueRow[]>(
    `SELECT t.id, t.title, t.due_at, c.name AS category FROM tasks t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.done = 0 AND t.has_time = 1 AND t.notified_at IS NULL
       AND t.due_at <= $1 AND t.due_at > $2
     ORDER BY t.due_at`,
    [toLocal(now), toLocal(new Date(now.getTime() - LATE_WINDOW_MS))],
  );
  for (const t of due) {
    // Mark first so a failing toast can't repeat every 20 s.
    await d.execute("UPDATE tasks SET notified_at = $1 WHERE id = $2", [toLocal(now, true), t.id]);
    sendNotification({
      title: t.title,
      body: [formatDue(t.due_at, true, now), t.category].filter(Boolean).join(" · "),
    });
  }
}

let started = false;

/** Start the background due-time checker (once per app run). */
export async function startNotifier(onError: (e: unknown) => void): Promise<void> {
  if (started) return;
  started = true;
  if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
  const tick = () => check().catch(onError);
  tick();
  window.setInterval(tick, CHECK_EVERY_MS);
}
