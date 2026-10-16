mod tray;

use tauri::{AppHandle, WindowEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Database URL shared with the frontend (`Database.load(DB_URL)`).
/// Resolved relative to the app config dir: %APPDATA%\com.wan.taskwidget\
pub const DB_URL: &str = "sqlite:tasks.db";

/// Schema migrations. Never edit a shipped migration; add a new version instead.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initial schema",
        sql: include_str!("../migrations/001_init.sql"),
        kind: MigrationKind::Up,
    }]
}

#[tauri::command]
fn set_always_on_top(app: AppHandle, on: bool) -> Result<(), String> {
    tray::set_always_on_top(&app, on).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .setup(|app| {
            tray::create(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the widget (Alt+F4) hides it to the tray; Quit lives in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![set_always_on_top])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
