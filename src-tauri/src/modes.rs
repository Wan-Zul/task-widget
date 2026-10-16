use std::sync::mpsc;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::appbar::{self, Edge};

/// Docked panel width in logical pixels.
const DOCK_WIDTH: i32 = 300;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Floating,
    Docked,
}

/// Run `f` on the main (window) thread and wait for its result.
/// Only call from a non-main thread, e.g. an async command.
fn on_main<F>(app: &AppHandle, f: F) -> Result<(), String>
where
    F: FnOnce() -> Result<(), String> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(f());
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

fn main_hwnd(app: &AppHandle) -> Result<isize, String> {
    let w = app.get_webview_window("main").ok_or("main window missing")?;
    Ok(w.hwnd().map_err(|e| e.to_string())?.0 as isize)
}

/// Switch display mode. The frontend restores floating geometry/always-on-top afterwards.
pub fn apply(app: &AppHandle, mode: Mode, edge: Edge) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("main window missing")?;
    let hwnd = main_hwnd(app)?;
    match mode {
        Mode::Docked => {
            w.set_resizable(false).map_err(|e| e.to_string())?;
            // AppBars sit above normal windows (they step aside for fullscreen apps).
            w.set_always_on_top(true).map_err(|e| e.to_string())?;
            on_main(app, move || appbar::dock(hwnd, edge, DOCK_WIDTH))
        }
        Mode::Floating => {
            on_main(app, move || {
                appbar::undock(hwnd);
                Ok(())
            })?;
            w.set_resizable(true).map_err(|e| e.to_string())
        }
    }
}

/// Startup (main thread): free any strip a killed previous run left behind.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    appbar::init(dir.join("appbar.active"), main_hwnd(app)?);
    Ok(())
}
