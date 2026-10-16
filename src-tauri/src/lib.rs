mod hotkey;
mod modes;
mod notch;
mod tray;

use tauri::{AppHandle, State, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Database URL shared with the frontend (`Database.load(DB_URL)`).
/// Resolved relative to the app config dir: %APPDATA%\com.wan.taskwidget\
pub const DB_URL: &str = "sqlite:tasks.db";

/// Passed by the autostart entry so a login launch stays in the tray.
const AUTOSTART_FLAG: &str = "--autostart";

/// Schema migrations. Never edit a shipped migration; add a new version instead.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "notified_at",
            sql: include_str!("../migrations/002_notified_at.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "manual sort within a day",
            sql: include_str!("../migrations/003_manual_sort.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

struct Launch {
    hidden: bool,
}

#[tauri::command]
fn set_always_on_top(app: AppHandle, on: bool) -> Result<(), String> {
    tray::set_always_on_top(&app, on).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    hotkey::set(&app, &accelerator)
}

#[tauri::command(async)]
fn set_mode(app: AppHandle, mode: modes::Mode) -> Result<(), String> {
    modes::apply(&app, mode)
}

#[tauri::command(async)]
fn notch_set_state(app: AppHandle, state: notch::NotchState) -> Result<(), String> {
    notch::set_state(&app, state)
}

/// Whether this launch should stay hidden in the tray (started at Windows login).
#[tauri::command]
fn launched_hidden(launch: State<Launch>) -> bool {
    launch.hidden
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch just brings the running widget forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main(app);
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .plugin(hotkey::plugin())
        .manage(hotkey::HotkeyState::default())
        .manage(notch::NotchCtl::default())
        .manage(Launch {
            hidden: std::env::args().any(|a| a == AUTOSTART_FLAG),
        })
        .setup(|app| {
            tray::create(app.handle())?;
            notch::spawn_watcher(app.handle().clone());
            modes::remove_docked_leftovers(app.handle());
            // The frontend re-applies the saved hotkey on load; register the default now so
            // it works even before (or if) that happens.
            if let Err(e) = hotkey::set(app.handle(), hotkey::DEFAULT) {
                eprintln!("{e}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the widget (Alt+F4) hides it to the tray; Quit lives in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![set_always_on_top, set_hotkey, set_mode, notch_set_state, launched_hidden])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
