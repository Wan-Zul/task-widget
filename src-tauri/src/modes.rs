use std::sync::mpsc;

use serde::Deserialize;
use tauri::{AppHandle, LogicalSize, Manager};

use crate::appbar::{self, Edge};
use crate::{notch, tray};

/// Docked panel width in logical pixels.
const DOCK_WIDTH: i32 = 300;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Notch,
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
    let e = |e: tauri::Error| e.to_string();
    if mode != Mode::Notch {
        notch::deactivate(app);
    }
    if mode != Mode::Docked {
        on_main(app, move || {
            appbar::undock(hwnd);
            Ok(())
        })?;
    }
    match mode {
        Mode::Notch => {
            w.set_resizable(false).map_err(e)?;
            w.set_always_on_top(true).map_err(e)?;
            notch::activate(app)?;
        }
        Mode::Docked => {
            w.set_resizable(false).map_err(e)?;
            w.set_min_size(None::<LogicalSize<f64>>).map_err(e)?;
            // AppBars sit above normal windows (they step aside for fullscreen apps).
            w.set_always_on_top(true).map_err(e)?;
            on_main(app, move || appbar::dock(hwnd, edge, DOCK_WIDTH))?;
        }
        Mode::Floating => {
            w.set_resizable(true).map_err(e)?;
            w.set_min_size(Some(LogicalSize::new(240.0, 240.0))).map_err(e)?;
        }
    }
    tray::sync_mode(app, mode, edge);
    Ok(())
}

/// Startup (main thread): free any strip a killed previous run left behind.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    appbar::init(dir.join("appbar.active"), main_hwnd(app)?);
    Ok(())
}
