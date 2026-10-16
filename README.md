# Task Widget

A small Windows 10/11 task tracker that lives on screen as a widget. Tauri v2 (Rust) + React + TypeScript, with local SQLite storage.

## Develop

```bash
npm install
npm run tauri dev
```

Requires Node 20+, Rust (stable-msvc), the MSVC build tools and WebView2.

## Data

The SQLite database is stored at `%APPDATA%\com.wan.taskwidget\tasks.db`.
Schema changes live in `src-tauri/migrations/` as numbered files, registered in `src-tauri/src/lib.rs`.
Never edit a migration that has already shipped; add a new one instead.
