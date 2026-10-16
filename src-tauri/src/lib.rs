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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
