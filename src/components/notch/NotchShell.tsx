import { useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { addDay, listTasks, listTasksBetween, moveToDate, type Task } from "../../db/tasks";
import { projectOccurrences, type ProjectedOccurrence } from "../../db/series";
import { nowLocal } from "../../lib/dates";
import { DragArea } from "../DragArea";
import { LIST_TABS, type Tab } from "../ViewTabs";
import { Calendar, gridDays } from "./Calendar";
import type { TasksApi } from "../../hooks/useTasks";
import { dialogOpen } from "../../lib/dialogGuard";
import { setNotchState, type NotchState } from "../../lib/windowMode";
import { TaskPane } from "../TaskPane";
import { Pill } from "./Pill";
import { Peek } from "./Peek";

/** Island size per state in logical px. Must match `logical_size` in src-tauri/src/notch.rs. */
const SIZE: Record<NotchState, [number, number]> = { pill: [220, 30], peek: [360, 150], open: [780, 460] };
const RANK: Record<NotchState, number> = { pill: 0, peek: 1, open: 2 };
const TRANSITION_MS = 230; // a little over the 220 ms CSS transition

interface Props {
  api: TasksApi;
  error: string | null;
  onDismissError: () => void;
  onError: (e: unknown) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  settings: ReactNode;
  weekStart: "mon" | "sun";
}

/** Tabs for the open island: the selected calendar day first, then the usual lists. */
function dayTabs(day: string): Tab[] {
  const label = new Date(`${day}T00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return [{ id: "day", label }, ...LIST_TABS];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const focusQuickAdd = () => requestAnimationFrame(() => document.getElementById("quick-add")?.focus());

/** Is the cursor really over the window? WebView2 fires a stray mouseleave when the window resizes under a still cursor. */
async function cursorInside(): Promise<boolean> {
  const win = getCurrentWindow();
  const [c, pos, size] = await Promise.all([cursorPosition(), win.outerPosition(), win.outerSize()]);
  return c.x >= pos.x && c.x < pos.x + size.width && c.y >= pos.y && c.y < pos.y + size.height;
}

export function NotchShell(p: Props) {
  // `visual` drives the CSS; `target` is where we're heading (it can change mid-animation).
  const [visual, setVisual] = useState<NotchState>("pill");
  const target = useRef<NotchState>("pill");
  const token = useRef(0);
  const hovering = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const [today, setToday] = useState<Task[]>([]);
  const [month, setMonth] = useState(() => `${nowLocal().slice(0, 7)}-01`);
  const [calTasks, setCalTasks] = useState<Task[]>([]);
  const [projected, setProjected] = useState<ProjectedOccurrence[]>([]);

  /**
   * Move to a state. Growing resizes the window first, then animates the island into it;
   * shrinking animates first, then shrinks the window, so the island is never clipped.
   */
  async function go(next: NotchState) {
    if (target.current === next) return;
    const grow = RANK[next] > RANK[target.current];
    target.current = next;
    const mine = ++token.current;
    if (next !== "open") p.setSettingsOpen(false);
    try {
      if (grow) {
        await setNotchState(next);
        if (mine === token.current) setVisual(next);
      } else {
        setVisual(next);
        await sleep(TRANSITION_MS);
        if (mine === token.current) await setNotchState(next);
      }
    } catch (e) {
      p.onError(e);
    }
  }

  const open = async () => {
    await go("open");
    focusQuickAdd();
  };

  // Today's tasks for the pill and peek; refreshed after any change and every minute.
  useEffect(() => {
    const load = () => listTasks("today").then(setToday, p.onError);
    load();
    const t = window.setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [p.api.version]);

  // Calendar data for the 6 weeks on screen, while the island is open.
  useEffect(() => {
    if (visual !== "open") return;
    const days = gridDays(month, p.weekStart);
    const [from, to] = [days[0], addDay(days[days.length - 1], 1)];
    Promise.all([listTasksBetween(from, to), projectOccurrences(from, to)]).then(([t, o]) => {
      setCalTasks(t);
      setProjected(o);
    }, p.onError);
  }, [visual, month, p.weekStart, p.api.version]);

  const selectDay = (date: string) => {
    p.api.selectDay(date);
    if (date.slice(0, 7) !== month.slice(0, 7)) setMonth(`${date.slice(0, 7)}-01`);
  };

  // Hotkey, tray and window focus.
  useEffect(() => {
    const offs = [
      listen("notch-toggle", () => (target.current === "open" ? go("pill") : open())),
      listen("notch-open", () => open()),
      // Clicking anywhere else folds the open island (not while a file dialog is up).
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused && target.current === "open" && !dialogOpen() && !hovering.current) go("pill");
      }),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && target.current === "open") go("pill");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      offs.forEach((o) => o.then((off) => off()));
    };
  }, []);

  function onEnter() {
    hovering.current = true;
    clearTimeout(timer.current);
    if (target.current === "pill") timer.current = window.setTimeout(() => go("peek"), 150);
  }

  function onLeave() {
    hovering.current = false;
    clearTimeout(timer.current);
    // Fold only if the cursor has really left; otherwise it was a resize artefact.
    const fold = (from: NotchState, ms: number) => {
      timer.current = window.setTimeout(async () => {
        if (target.current !== from) return;
        const inside = await cursorInside().catch(() => false);
        if (hovering.current || target.current !== from) return; // re-entered meanwhile
        if (inside) fold(from, ms); // check again; onEnter cancels it
        else go("pill");
      }, ms);
    };
    if (target.current === "peek") fold("peek", 400);
    // Opened but never got the keyboard (so no blur will come): fold when the mouse leaves.
    else if (target.current === "open" && !document.hasFocus()) fold("open", 600);
  }

  const [w, h] = SIZE[visual];
  return (
    <div className="notch-root">
      <div
        className={`island island--${visual}`}
        style={{ width: w, height: h }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={visual === "open" ? undefined : open}
      >
        {visual === "pill" && <Pill today={today} />}
        {visual === "peek" && <Peek today={today} onToggleDone={p.api.toggleDone} />}
        {visual === "open" && (
          <div className="island-open">
            <div className="island-bar">
              <span className="island-title">Tasks</span>
              <span className="island-date">
                {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <span className="spacer" />
              <button
                className={p.settingsOpen ? "icon-btn on" : "icon-btn"}
                title="Settings"
                onClick={() => p.setSettingsOpen(!p.settingsOpen)}
              >
                ⚙
              </button>
              <button className="icon-btn" title="Fold (Esc)" onClick={() => go("pill")}>
                ⌃
              </button>
            </div>
            {p.error && (
              <div className="error" role="alert" onClick={p.onDismissError}>
                {p.error}
              </div>
            )}
            {p.settingsOpen ? (
              p.settings
            ) : (
              <DragArea onDropOnDay={(t, date) => p.api.run(() => moveToDate(t, date))}>
                <div className="island-body">
                  <aside className="island-cal">
                    <Calendar
                      month={month}
                      selected={p.api.day}
                      weekStart={p.weekStart}
                      tasks={calTasks}
                      projected={projected}
                      categories={p.api.categories}
                      onSelect={selectDay}
                      onAddOn={(date) => {
                        selectDay(date);
                        focusQuickAdd();
                      }}
                      onMonth={setMonth}
                    />
                  </aside>
                  <section className="island-main">
                    <TaskPane
                      api={p.api}
                      tabs={dayTabs(p.api.day)}
                      projected={projected.filter((o) => o.dueAt.startsWith(p.api.day))}
                    />
                  </section>
                </div>
              </DragArea>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
