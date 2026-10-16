use serde::Deserialize;
use tauri::{AppHandle, LogicalSize, Manager};

use crate::{notch, tray};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Notch,
    Floating,
}

/// Switch display mode. The frontend restores floating geometry/always-on-top afterwards.
pub fn apply(app: &AppHandle, mode: Mode) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("main window missing")?;
    let e = |e: tauri::Error| e.to_string();
    match mode {
        Mode::Notch => {
            w.set_resizable(false).map_err(e)?;
            w.set_always_on_top(true).map_err(e)?;
            notch::activate(app)?;
        }
        Mode::Floating => {
            notch::deactivate(app);
            w.set_resizable(true).map_err(e)?;
            w.set_min_size(Some(LogicalSize::new(240.0, 240.0))).map_err(e)?;
        }
    }
    tray::sync_mode(app, mode);
    Ok(())
}

/// Startup: v0.2 had a docked (AppBar) mode that left a marker file while docked. Windows
/// frees the strip itself when the app goes away, so just tidy the file up.
pub fn remove_docked_leftovers(app: &AppHandle) {
    if let Ok(dir) = app.path().app_local_data_dir() {
        let _ = std::fs::remove_file(dir.join("appbar.active"));
    }
}
