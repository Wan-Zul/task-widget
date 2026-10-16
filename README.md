# Task Widget

A small Windows 10/11 task tracker that lives on screen all day: by default as a black **notch** at the top centre of the screen (inspired by [Coucou](https://github.com/Louis-CFM/coucou)) that opens into a calendar and task list. It can also run as a normal floating window.
Built with Tauri v2 (Rust) + React + TypeScript. Everything is stored locally in SQLite: no cloud, no login.

## Using it

### The notch (default)

| State | What you see | How |
|---|---|---|
| Pill | One line: `● 1 overdue · 3 today · next task 5 PM`, or "All clear" | Always visible at the top centre |
| Peek | The next 4 tasks for today, tickable | Hover the pill |
| Open | Calendar on the left, tasks on the right | Click, or press the hotkey |

Esc, clicking anywhere else, or the hotkey folds it back. It hides while a fullscreen app (video, game, presentation) is in front.
The pill covers about 220×30 px at the very top centre, roughly the middle of a maximised window's title bar.

**Calendar**: dots show tasks per day in their category colour (faded = done, hollow = an upcoming repeat), and the day number turns red when something is overdue.
Click a day to list it in the date tab (quick add then defaults to that day), or double-click it to add a task straight away.
Drag a task from the list onto a day to reschedule it; the time is kept.

### Everywhere

- **Quick add**: type in the box at the top, then click **Add** or press Enter. The line under the box shows where the task will go (e.g. "→ Today", "→ 17 Oct", "→ No date"). Shorthand is picked up and shown as chips before you add:

  | Type | Examples |
  |---|---|
  | Date | `today`, `tomorrow`/`tmr`, `fri`, `next fri`, `in 3 days`, `in 2 weeks`, `25/12` (day first), `25/12/27`, `17 oct`, `oct 17`, `2026-10-17` |
  | Time | `5pm`, `5:30pm`, `17:00`, `at 9am`, `noon` (a time that has already passed today means tomorrow) |
  | Category | `#FYP` (created if it doesn't exist) |
  | Priority | `!high` `!med` `!low` (or `!h` `!m` `!l`) |
  | Repeat | `daily`, `weekdays`, `weekly`, `monthly`, `every 3 days`, `every 2 weeks`, `every mon and thu` |

  Example: `Submit logbook fri 5pm #FYP !high`
- **Views**: Today (overdue pinned on top), Upcoming (grouped by day), **No date** (tasks that aren't on the calendar; adding there creates undated tasks), All, Done. In the notch, the selected calendar day comes first.
- **Edit**: click a task. A recurring task offers *This one* (edit only this occurrence) or *All future*, plus *Skip*. Choose *Doesn't repeat* to stop a recurrence.
- **Reorder**: drag tasks within a day.
- **Missed recurring tasks** show up once as overdue, marked with "↻ missed N", never as a pile of copies.
- **Hotkey**: `Ctrl+Alt+T` (changeable in Settings) opens the notch, or shows the widget, with quick add focused. Press it again to fold or hide.
- **Tray icon**: Show/Hide, Mode (Notch / Floating), Always on top, Settings, Quit. Closing the window only hides it.
- **Settings** (gear icon): mode, always on top (floating mode), theme (the notch is always dark), week start, compact list, launch on startup, hotkey, categories, JSON backup.

v0.3 removed the docked (screen-edge) mode. If you used it in v0.2, the app opens as the notch after the upgrade.

## Develop

Requirements: Node 20+, Rust stable (MSVC toolchain), Visual Studio Build Tools with C++, WebView2 (included with Windows 11).

```bash
npm install
npm run tauri dev     # run the app with hot reload
npm test              # recurrence, quick-add parser and data-layer tests
```

The data-layer tests run the real migrations against Node's built-in `node:sqlite`.

## Build the installer

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/nsis/Task Widget_<version>_x64-setup.exe`. Running a newer installer upgrades an existing install in place; your data is kept.
It's a per-user install (no admin prompt) and adds a Start-menu entry. Uninstall it from Windows Settings → Apps.

## Data and backups

| What | Where |
|---|---|
| Database | `%APPDATA%\com.wan.taskwidget\tasks.db` |

Settings → Backup → *Export to JSON* writes everything (tasks, recurring series, completion history, categories) to a versioned JSON file.
*Import* can **merge** a backup into your current data or **replace** it, which asks for confirmation first.
Window position, hotkey and theme aren't included in backups; they belong to this machine.

Schema changes live in `src-tauri/migrations/` as numbered files registered in `src-tauri/src/lib.rs`.
Never edit a migration that has already shipped; add a new one. (`.gitattributes` pins `.sql` files to LF because sqlx checksums each migration.)

## Project layout

```
src/
  App.tsx                 top-level state and wiring
  components/             TaskPane, QuickAdd, ViewTabs, TaskList/TaskItem/TaskEditor, RecurrencePicker, Settings, CategoryManager, DragArea
  components/notch/       NotchShell (pill/peek/open state machine), Pill, Peek, Calendar
  hooks/useTasks.ts       task state and mutations shared by the notch and widget layouts
  db/                     SQLite access: tasks, series (recurrence lifecycle), settings, backup
  recurrence/             RRULE presets (rules.ts) and next-occurrence logic (next.ts)
  parse/quickAdd.ts       quick-add shorthand parser
  lib/                    dates, window modes, hotkey, notifications, appearance, backup files
src-tauri/
  src/lib.rs              plugins, commands, migrations
  src/tray.rs             tray menu and always-on-top
  src/hotkey.rs           global shortcut
  src/modes.rs            notch/floating switch
  src/notch.rs            notch window: per-state size and position, fullscreen check
  migrations/             numbered SQL migrations
```
