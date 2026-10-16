use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const DEFAULT: &str = "Ctrl+Alt+T";

/// Currently registered accelerator, so a failed change can fall back to it.
#[derive(Default)]
pub struct HotkeyState(Mutex<Option<String>>);

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                on_pressed(app);
            }
        })
        .build()
}

/// Hide if the widget is already in front, otherwise bring it up with quick add focused.
fn on_pressed(app: &AppHandle) {
    // Notch mode: the frontend opens or folds the island (it owns the animation).
    if crate::notch::is_active(app) {
        crate::notch::reveal(app);
        let _ = app.emit("notch-toggle", ());
        return;
    }
    let Some(w) = app.get_webview_window("main") else { return };
    let visible = w.is_visible().unwrap_or(false);
    if visible && w.is_focused().unwrap_or(false) {
        let _ = w.hide();
    } else {
        let _ = w.show();
        let _ = w.set_focus();
        let _ = app.emit("focus-quick-add", ());
    }
}

/// Replace the global hotkey. On failure (bad syntax, or taken by another app) the
/// previous hotkey stays registered and the error is returned.
pub fn set(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|e| format!("\"{accelerator}\" isn't a valid shortcut: {e}"))?;
    let gs = app.global_shortcut();
    let state = app.state::<HotkeyState>();
    let mut current = state.0.lock().unwrap();

    let previous = current.take();
    if let Some(prev) = &previous {
        let _ = gs.unregister(prev.as_str());
    }
    match gs.register(shortcut) {
        Ok(()) => {
            *current = Some(accelerator.to_string());
            Ok(())
        }
        Err(e) => {
            if let Some(prev) = previous {
                if gs.register(prev.as_str()).is_ok() {
                    *current = Some(prev);
                }
            }
            Err(format!("Couldn't register {accelerator} (another app may be using it): {e}"))
        }
    }
}
