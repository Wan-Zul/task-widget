# Task Widget

A small Windows 10/11 task tracker that lives on screen all day, either as a floating widget or as a panel docked to a screen edge.
Built with Tauri v2 (Rust) + React + TypeScript. Everything is stored locally in SQLite: no cloud, no login.

## Using it

- **Quick add**: type in the box at the top and press Enter. Shorthand is picked up and shown as chips before you add:

  | Type | Examples |
  |---|---|
  | Date | `today`, `tomorrow`/`tmr`, `fri`, `next fri`, `in 3 days`, `in 2 weeks`, `25/12` (day first), `25/12/27`, `17 oct`, `oct 17`, `2026-10-17` |
  | Time | `5pm`, `5:30pm`, `17:00`, `at 9am`, `noon` (a time that has already passed today means tomorrow) |
  | Category | `#FYP` (created if it doesn't exist) |
  | Priority | `!high` `!med` `!low` (or `!h` `!m` `!l`) |
  | Repeat | `daily`, `weekdays`, `weekly`, `monthly`, `every 3 days`, `every 2 weeks`, `every mon and thu` |

  Example: `Submit logbook fri 5pm #FYP !high`
- **Views**: Today (overdue pinned on top), Upcoming (grouped by day), All, Done.
- **Edit**: click a task. A recurring task offers *This one* (edit only this occurrence) or *All future*, plus *Skip*. Choose *Doesn't repeat* to stop a recurrence.
- **Reorder**: drag tasks within a day.
- **Missed recurring tasks** show up once as overdue, marked with "↻ missed N", never as a pile of copies.
- **Hotkey**: `Ctrl+Alt+T` (changeable in Settings) shows the widget and focuses quick add. Press it again to hide.
- **Tray icon**: Show/Hide, Switch floating/docked, Always on top, Settings, Quit. Closing the window only hides it.
- **Settings** (gear icon): mode (floating / docked left / docked right), always on top, theme, compact list, launch on startup, hotkey, categories, JSON backup.

### Docked mode

Docked mode reserves a 300 px strip at the screen edge using the Windows AppBar API, the same mechanism the taskbar uses, so maximised windows stop at the panel.
Hiding the widget gives the space back. Quitting, switching to floating, or a crash also release it, and a launch after a forced kill cleans up anything left behind.
If a strip ever stays reserved, restarting Explorer (Task Manager → Windows Explorer → Restart) frees it.

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

Output: `src-tauri/target/release/bundle/nsis/Task Widget_<version>_x64-setup.exe`.
It's a per-user install (no admin prompt) and adds a Start-menu entry. Uninstall it from Windows Settings → Apps.

## Data and backups

| What | Where |
|---|---|
| Database | `%APPDATA%\com.wan.taskwidget\tasks.db` |
| Docked-mode crash marker | `%LOCALAPPDATA%\com.wan.taskwidget\appbar.active` |

Settings → Backup → *Export to JSON* writes everything (tasks, recurring series, completion history, categories) to a versioned JSON file.
*Import* can **merge** a backup into your current data or **replace** it, which asks for confirmation first.
Window position, hotkey and theme aren't included in backups; they belong to this machine.

Schema changes live in `src-tauri/migrations/` as numbered files registered in `src-tauri/src/lib.rs`.
Never edit a migration that has already shipped; add a new one. (`.gitattributes` pins `.sql` files to LF because sqlx checksums each migration.)

## Project layout

```
src/
  App.tsx                 top-level state and wiring
  components/             Header, QuickAdd, ViewTabs, TaskList/TaskItem/TaskEditor, RecurrencePicker, Settings, CategoryManager
  db/                     SQLite access: tasks, series (recurrence lifecycle), settings, backup
  recurrence/             RRULE presets (rules.ts) and next-occurrence logic (next.ts)
  parse/quickAdd.ts       quick-add shorthand parser
  lib/                    dates, window modes, hotkey, notifications, appearance, backup files
src-tauri/
  src/lib.rs              plugins, commands, migrations
  src/tray.rs             tray menu and always-on-top
  src/hotkey.rs           global shortcut
  src/modes.rs            floating/docked switch
  src/appbar.rs           Win32 AppBar (docked mode)
  migrations/             numbered SQL migrations
```
